from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models.knowledge import AIConfig
from app.models.user import User, UserRole
from app.schemas.knowledge import AIConfigUpdate, AIConfigResponse
from app.middleware.auth import get_current_user, require_role
from app.auth.encryption import encrypt, decrypt
from app.services.ai import get_provider, AIMessage

router = APIRouter(prefix="/api/ai", tags=["ai"])


class MessageIn(BaseModel):
    role: str
    content: str


class GenerateRequest(BaseModel):
    prompt: str | None = None
    messages: list[MessageIn] | None = None
    system: str | None = None
    provider: str | None = None
    max_tokens: int = 2048
    temperature: float = 0.7


class GenerateTasksRequest(BaseModel):
    incident_title: str
    incident_type: str
    incident_description: str | None = None
    provider: str | None = None


class AnalyzeIOCRequest(BaseModel):
    ioc_type: str
    value: str
    context: str | None = None
    provider: str | None = None


async def _get_provider_from_db(db: AsyncSession, provider_name: str | None = None):
    result = await db.execute(select(AIConfig).limit(1))
    cfg = result.scalar_one_or_none()
    if not cfg or not cfg.providers_encrypted:
        raise HTTPException(status_code=400, detail="AI provider not configured. Configure it in Settings > AI Configuration.")
    providers = decrypt(cfg.providers_encrypted)
    return get_provider({"default_provider": cfg.default_provider, "providers": providers}, provider_name=provider_name)


@router.get("/config")
async def get_ai_config(user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AIConfig).limit(1))
    cfg = result.scalar_one_or_none()
    all_providers = ["anthropic", "openai", "azure_openai", "gemini"]
    if not cfg:
        return {
            "default_provider": "anthropic",
            "providers": {p: {"configured": False} for p in all_providers},
        }
    stored: dict = {}
    if cfg.providers_encrypted:
        try:
            stored = decrypt(cfg.providers_encrypted)
            if not isinstance(stored, dict):
                stored = {}
        except Exception:
            stored = {}
    providers_out = {}
    for p in all_providers:
        info = stored.get(p, {})
        providers_out[p] = {
            "configured": bool(info.get("api_key") or info.get("endpoint")),
            "model": info.get("model"),
        }
    return {"default_provider": cfg.default_provider, "providers": providers_out}


@router.patch("/config")
async def update_ai_config(body: AIConfigUpdate, user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AIConfig).limit(1))
    cfg = result.scalar_one_or_none()
    if not cfg:
        cfg = AIConfig()
        db.add(cfg)

    if body.default_provider:
        cfg.default_provider = body.default_provider

    if body.providers:
        existing_providers = {}
        if cfg.providers_encrypted:
            existing_providers = decrypt(cfg.providers_encrypted)
        for pname, pconfig in body.providers.items():
            existing_providers[pname] = {k: v for k, v in pconfig.model_dump().items() if v is not None}
        cfg.providers_encrypted = encrypt(existing_providers)

    await db.commit()
    return {"message": "AI configuration updated"}


@router.post("/generate")
async def generate_text(
    body: GenerateRequest,
    user: User = Depends(require_role(UserRole.IR_LEAD)),
    db: AsyncSession = Depends(get_db),
):
    provider = await _get_provider_from_db(db, body.provider)
    if body.messages:
        msgs = [AIMessage(role=m.role, content=m.content) for m in body.messages]
    elif body.prompt:
        msgs = [AIMessage(role="user", content=body.prompt)]
    else:
        raise HTTPException(status_code=400, detail="Provide either 'prompt' or 'messages'")
    response = await provider.generate(
        msgs,
        system=body.system,
        max_tokens=body.max_tokens,
        temperature=body.temperature,
    )
    return {"content": response.content, "provider": response.provider, "model": response.model}


@router.post("/generate-tasks")
async def generate_tasks(
    body: GenerateTasksRequest,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    provider = await _get_provider_from_db(db, body.provider)
    prompt = f"""Generate a comprehensive task list for responding to the following incident. Return ONLY a JSON array of task objects with fields: title (string), priority (CRITICAL|HIGH|MEDIUM|LOW), description (string, brief).

Incident: {body.incident_title}
Type: {body.incident_type}
{f'Description: {body.incident_description}' if body.incident_description else ''}

Return only valid JSON array, no other text."""

    response = await provider.generate(
        [AIMessage(role="user", content=prompt)],
        system="You are an expert incident responder. Generate practical, actionable tasks.",
        max_tokens=2000,
        temperature=0.3,
    )

    import json
    try:
        content = response.content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        tasks = json.loads(content.strip())
    except Exception:
        tasks = [{"title": "Review AI response (JSON parsing failed)", "priority": "MEDIUM", "description": response.content}]

    return {"tasks": tasks, "provider": response.provider}


@router.post("/analyze-ioc")
async def analyze_ioc(
    body: AnalyzeIOCRequest,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    provider = await _get_provider_from_db(db, body.provider)
    prompt = f"""Analyze the following Indicator of Compromise (IOC) and provide a brief threat intelligence assessment.

IOC Type: {body.ioc_type}
Value: {body.value}
{f'Context: {body.context}' if body.context else ''}

Provide: (1) What this IOC likely represents, (2) Known threat associations if any, (3) Recommended defensive actions, (4) Severity assessment. Keep response concise and actionable. Do NOT access the internet or make assumptions about real-time threat intelligence."""

    response = await provider.generate(
        [AIMessage(role="user", content=prompt)],
        system="You are a threat intelligence analyst. Provide factual, actionable IOC analysis based on general knowledge.",
        max_tokens=800,
        temperature=0.2,
    )
    return {"analysis": response.content, "ioc_type": body.ioc_type, "value": body.value}


@router.post("/gap-analysis")
async def generate_gap_analysis(
    assessment_id: str,
    provider: str | None = None,
    user: User = Depends(require_role(UserRole.IR_LEAD)),
    db: AsyncSession = Depends(get_db),
):
    from app.models.assessment import Assessment, AssessmentAnswer
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Assessment).options(selectinload(Assessment.answers).selectinload(AssessmentAnswer.question))
        .where(Assessment.id == assessment_id)
    )
    assessment = result.scalar_one_or_none()
    if not assessment or not assessment.answers:
        raise HTTPException(status_code=404, detail="Assessment not found or has no answers")

    gaps = [(a.question.category, a.question.question, a.score) for a in assessment.answers if a.score <= 1]
    partial = [(a.question.category, a.question.question, a.score) for a in assessment.answers if a.score == 2]

    ai_provider = await _get_provider_from_db(db, provider)
    gaps_text = "\n".join([f"- [{cat}] {q}: Score {s}/4" for cat, q, s in gaps[:15]])
    partial_text = "\n".join([f"- [{cat}] {q}: Score {s}/4" for cat, q, s in partial[:10]])

    prompt = f"""Based on this IR readiness assessment (maturity level {assessment.maturity_level}/5, score {assessment.overall_score}%), provide a prioritized gap analysis and remediation roadmap.

Critical gaps (score 0-1):
{gaps_text or 'None'}

Partial gaps (score 2):
{partial_text or 'None'}

Provide: (1) Top 5 priority remediation items, (2) Quick wins achievable in 30 days, (3) 90-day roadmap to improve maturity by one level. Be specific and actionable."""

    response = await ai_provider.generate(
        [AIMessage(role="user", content=prompt)],
        system="You are an IR program consultant. Provide practical, prioritized remediation guidance.",
        max_tokens=2000,
        temperature=0.4,
    )
    return {"analysis": response.content, "assessment_id": assessment_id}


class GeneratePostMortemRequest(BaseModel):
    incident_id: str
    provider: str | None = None


class GenerateExerciseInjectsRequest(BaseModel):
    incident_id: str
    incident_type: str
    current_phase: str
    scenario_context: str | None = None
    count: int = 5
    provider: str | None = None


@router.post("/generate-postmortem")
async def generate_postmortem(
    body: GeneratePostMortemRequest,
    user: User = Depends(require_role(UserRole.IR_LEAD)),
    db: AsyncSession = Depends(get_db),
):
    from app.models.incident import Incident, TimelineEvent, IncidentNote
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Incident)
        .options(
            selectinload(Incident.timeline_events),
            selectinload(Incident.notes),
            selectinload(Incident.tasks),
            selectinload(Incident.iocs),
        )
        .where(Incident.id == body.incident_id)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    duration_hours = None
    if incident.resolved_at:
        delta = incident.resolved_at - incident.started_at
        duration_hours = round(delta.total_seconds() / 3600, 1)

    timeline_text = "\n".join([
        f"- [{e.occurred_at.strftime('%Y-%m-%d %H:%M')}] {e.event_type}: {e.description}"
        for e in sorted(incident.timeline_events, key=lambda x: x.occurred_at)[:25]
    ]) or "No timeline events recorded."

    tasks_done = [t for t in incident.tasks if t.status == "DONE"]
    tasks_open = [t for t in incident.tasks if t.status != "DONE"]
    ioc_count = len(incident.iocs)

    prompt = f"""You are preparing a blameless post-mortem for the following security incident. Generate a structured, honest, and actionable post-mortem draft. Use markdown formatting in each section.

INCIDENT DETAILS:
- Title: {incident.title}
- Type: {incident.incident_type}
- Severity: {incident.severity}
- Status: {incident.status}
- Started: {incident.started_at.strftime('%Y-%m-%d %H:%M UTC')}
{"- Resolved: " + incident.resolved_at.strftime('%Y-%m-%d %H:%M UTC') if incident.resolved_at else "- Status: Not yet resolved"}
{"- Duration: " + str(duration_hours) + " hours" if duration_hours else ""}
- IOCs documented: {ioc_count}
- Tasks completed: {len(tasks_done)} / {len(incident.tasks)}
- Open tasks remaining: {len(tasks_open)}
{f"- Description: {incident.description}" if incident.description else ""}

TIMELINE:
{timeline_text}

Generate a post-mortem with these exact sections. Be specific, honest, and blameless. Use bullet points where appropriate.

1. SUMMARY (2-3 sentences: what happened, how it was detected, how it was resolved)
2. IMPACT (business and technical impact: systems affected, data at risk, downtime, etc.)
3. TIMELINE_NOTES (key observations about the response timeline: what was fast, what was slow)
4. WHAT_WENT_WELL (specific things the team did well — minimum 3 items)
5. WHAT_WENT_POORLY (specific gaps or failures — minimum 3 items, be direct)
6. ROOT_CAUSE (the actual root cause, not symptoms)
7. FIVE_WHYS (5 why iterations drilling into root cause — return as a numbered list "Why 1: ... Answer: ...")
8. LESSONS_LEARNED (3-5 actionable takeaways that will prevent recurrence or improve response)

Return ONLY a JSON object with keys: summary, impact, timeline_notes, what_went_well, what_went_poorly, root_cause, five_whys_text, lessons_learned. No other text."""

    provider = await _get_provider_from_db(db, body.provider)
    response = await provider.generate(
        [AIMessage(role="user", content=prompt)],
        system="You are a senior incident responder writing a blameless post-mortem. Be specific, honest, and constructive.",
        max_tokens=3000,
        temperature=0.4,
    )

    import json
    content = response.content.strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
    content = content.strip()

    try:
        parsed = json.loads(content)
    except Exception:
        return {"raw": response.content, "parse_error": True}

    five_whys_raw = parsed.get("five_whys_text", "")
    five_whys = []
    if five_whys_raw:
        for line in five_whys_raw.split("\n"):
            line = line.strip()
            if line.startswith("Why") and "Answer:" in line:
                parts = line.split("Answer:")
                five_whys.append({"why": parts[0].strip().lstrip("1234567890. ").strip(), "answer": parts[1].strip()})

    return {
        "summary": parsed.get("summary", ""),
        "impact": parsed.get("impact", ""),
        "timeline_notes": parsed.get("timeline_notes", ""),
        "what_went_well": parsed.get("what_went_well", ""),
        "what_went_poorly": parsed.get("what_went_poorly", ""),
        "root_cause": parsed.get("root_cause", ""),
        "five_whys": five_whys,
        "lessons_learned": parsed.get("lessons_learned", ""),
        "provider": response.provider,
    }


@router.post("/generate-exercise-injects")
async def generate_exercise_injects(
    body: GenerateExerciseInjectsRequest,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    INJECT_TYPES = ["TECHNICAL", "COMMUNICATION", "ESCALATION", "DECISION", "COMPLICATION"]

    prompt = f"""You are a tabletop exercise facilitator. Generate realistic, challenging scenario injects for a cybersecurity tabletop exercise.

Incident type: {body.incident_type}
Current phase: {body.current_phase}
{f"Additional context: {body.scenario_context}" if body.scenario_context else ""}

Generate exactly {body.count} scenario injects. Each inject should:
- Be realistic and plausible for the incident type
- Force a decision, reveal a gap, or escalate pressure on the team
- Cover a mix of categories: TECHNICAL (new technical finding), COMMUNICATION (external party, media, regulator), ESCALATION (leadership/board pressure), DECISION (forcing a hard choice), COMPLICATION (something that makes the situation harder)
- Be specific and concrete, not vague

Return ONLY a JSON array of objects with fields:
- title: short descriptive title (max 60 chars)
- description: the inject text read to the team (2-4 sentences, written as a present-tense scenario update)
- inject_type: one of TECHNICAL|COMMUNICATION|ESCALATION|DECISION|COMPLICATION
- facilitator_notes: private guidance for the facilitator (what to watch for, expected responses, follow-up probes)

No other text."""

    provider = await _get_provider_from_db(db, body.provider)
    response = await provider.generate(
        [AIMessage(role="user", content=prompt)],
        system="You are an expert tabletop exercise facilitator who creates realistic, high-pressure injects that expose gaps in IR processes.",
        max_tokens=2500,
        temperature=0.8,
    )

    import json
    content = response.content.strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
    content = content.strip()

    try:
        injects = json.loads(content)
    except Exception:
        injects = [{"title": "Review AI output", "description": response.content, "inject_type": "COMPLICATION", "facilitator_notes": "JSON parsing failed — review raw output."}]

    return {"injects": injects, "provider": response.provider}
