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
