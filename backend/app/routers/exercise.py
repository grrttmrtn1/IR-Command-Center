import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.postmortem import ExerciseInject, ExerciseObservation
from app.models.incident import Incident
from app.models.user import User, UserRole
from app.middleware.auth import get_current_user, require_role

router = APIRouter(prefix="/api/incidents", tags=["exercise"])

# Phase-aware discussion prompts surfaced to the facilitator
DISCUSSION_PROMPTS: dict[str, list[dict]] = {
    "DETECTION": [
        {"id": "d1", "text": "Who first detected this, and through what channel? Was detection timely?"},
        {"id": "d2", "text": "What's your confidence level this is a real incident vs. false positive? What would change your assessment?"},
        {"id": "d3", "text": "What is the potential blast radius if this is real and spreading right now?"},
        {"id": "d4", "text": "Who needs to know about this before you do anything else? Have you notified them?"},
        {"id": "d5", "text": "Is there any risk your investigation is tipping off the attacker? Should you go silent?"},
    ],
    "ANALYSIS": [
        {"id": "a1", "text": "What data could be at risk? What's its classification and regulatory sensitivity?"},
        {"id": "a2", "text": "Do you know the initial entry point? If not, what's your theory and how will you test it?"},
        {"id": "a3", "text": "What notification deadlines apply — GDPR 72hr, SEC 4-day, state breach laws? Who owns that clock?"},
        {"id": "a4", "text": "Are you documenting everything with litigation in mind? Assume this ends in court."},
        {"id": "a5", "text": "Do you need forensic preservation right now before remediation destroys evidence?"},
        {"id": "a6", "text": "Is there any lateral movement? How far has the attacker gotten beyond the initial foothold?"},
    ],
    "CONTAINMENT": [
        {"id": "c1", "text": "What are the trade-offs between speed of containment and evidence preservation?"},
        {"id": "c2", "text": "Who has the authority to take affected systems offline? Have you gotten that sign-off?"},
        {"id": "c3", "text": "Which business processes depend on affected systems? What's the business impact of taking them down?"},
        {"id": "c4", "text": "Have you notified cyber insurance yet? Many policies require prompt notification to preserve coverage."},
        {"id": "c5", "text": "Is containment actually working, or are you just slowing the attacker down? How do you know?"},
        {"id": "c6", "text": "Do we need to notify law enforcement? Does the severity or type cross that threshold?"},
    ],
    "ERADICATION": [
        {"id": "e1", "text": "How confident are you that you've found ALL persistence mechanisms? What's your validation method?"},
        {"id": "e2", "text": "Do you need a third-party forensics firm to validate your findings before declaring clean?"},
        {"id": "e3", "text": "What's the re-infection risk if you restore from backups too quickly? How are you mitigating it?"},
        {"id": "e4", "text": "Are the root credentials that allowed this still valid? Have all affected accounts been reset?"},
        {"id": "e5", "text": "Is there a chance this was a distraction from something else happening simultaneously?"},
    ],
    "RECOVERY": [
        {"id": "r1", "text": "What's your validation criteria before you declare systems clean and return them to production?"},
        {"id": "r2", "text": "Who needs to sign off on systems returning to production? Have you gotten that approval?"},
        {"id": "r3", "text": "How are you monitoring for re-infection during the recovery window? What's the tripwire?"},
        {"id": "r4", "text": "What's the communication plan for stakeholders when you're ready to declare the all-clear?"},
        {"id": "r5", "text": "Have you preserved all evidence and documentation before cleanup? You can't go back."},
    ],
    "POST_INCIDENT": [
        {"id": "p1", "text": "What would you do differently if this happened again tomorrow?"},
        {"id": "p2", "text": "Did everyone know their role? Where did the RACI break down?"},
        {"id": "p3", "text": "Were your playbooks helpful? What was missing or wrong?"},
        {"id": "p4", "text": "How did tools and access hold up under pressure? What failed when you needed it?"},
        {"id": "p5", "text": "What's one control that, if implemented, would have prevented or materially limited this incident?"},
        {"id": "p6", "text": "Were communications (internal and external) handled well? What would you change?"},
    ],
    "_all": [
        {"id": "x1", "text": "Is the right person leading right now, or does command need to transfer?"},
        {"id": "x2", "text": "Who is the single source of truth for status right now? Is everyone aligned?"},
        {"id": "x3", "text": "What decisions are you avoiding making? What's blocking them?"},
        {"id": "x4", "text": "Have you eaten, slept, taken breaks? Fatigue is the enemy of good decisions."},
    ],
}


class InjectCreate(BaseModel):
    title: str
    description: str
    inject_type: str = "COMPLICATION"
    target_phase: str | None = None
    facilitator_notes: str | None = None


class ObservationCreate(BaseModel):
    category: str = "GENERAL"
    content: str
    phase: str | None = None


def _inject_out(inj: ExerciseInject) -> dict:
    return {
        "id": inj.id,
        "incident_id": inj.incident_id,
        "title": inj.title,
        "description": inj.description,
        "inject_type": inj.inject_type,
        "target_phase": inj.target_phase,
        "delivered_at": inj.delivered_at.isoformat() if inj.delivered_at else None,
        "facilitator_notes": inj.facilitator_notes,
        "sort_order": inj.sort_order,
        "created_by": inj.created_by,
        "created_at": inj.created_at.isoformat(),
    }


def _obs_out(obs: ExerciseObservation) -> dict:
    return {
        "id": obs.id,
        "incident_id": obs.incident_id,
        "category": obs.category,
        "content": obs.content,
        "phase": obs.phase,
        "created_by": obs.created_by,
        "created_at": obs.created_at.isoformat(),
    }


async def _require_exercise(incident_id: str, db: AsyncSession) -> Incident:
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    inc = result.scalar_one_or_none()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    if not inc.is_exercise:
        raise HTTPException(status_code=400, detail="This endpoint is only available for exercise incidents")
    return inc


@router.get("/{incident_id}/exercise/prompts")
async def get_discussion_prompts(
    incident_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    inc = await _require_exercise(incident_id, db)
    phase_prompts = DISCUSSION_PROMPTS.get(inc.phase, [])
    always_prompts = DISCUSSION_PROMPTS["_all"]
    return {
        "phase": inc.phase,
        "phase_prompts": phase_prompts,
        "always_prompts": always_prompts,
    }


@router.get("/{incident_id}/exercise/injects")
async def list_injects(
    incident_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_exercise(incident_id, db)
    result = await db.execute(
        select(ExerciseInject)
        .where(ExerciseInject.incident_id == incident_id)
        .order_by(ExerciseInject.sort_order, ExerciseInject.created_at)
    )
    return [_inject_out(i) for i in result.scalars().all()]


@router.post("/{incident_id}/exercise/injects")
async def create_inject(
    incident_id: str,
    body: InjectCreate,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    await _require_exercise(incident_id, db)
    inject = ExerciseInject(
        id=str(uuid.uuid4()),
        incident_id=incident_id,
        created_by=user.id,
        **body.model_dump(),
    )
    db.add(inject)
    await db.commit()
    await db.refresh(inject)
    return _inject_out(inject)


@router.post("/{incident_id}/exercise/injects/{inject_id}/deliver")
async def deliver_inject(
    incident_id: str,
    inject_id: str,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    await _require_exercise(incident_id, db)
    result = await db.execute(select(ExerciseInject).where(ExerciseInject.id == inject_id))
    inject = result.scalar_one_or_none()
    if not inject:
        raise HTTPException(status_code=404, detail="Inject not found")
    inject.delivered_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(inject)
    return _inject_out(inject)


@router.delete("/{incident_id}/exercise/injects/{inject_id}", status_code=204)
async def delete_inject(
    incident_id: str,
    inject_id: str,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    await _require_exercise(incident_id, db)
    result = await db.execute(select(ExerciseInject).where(ExerciseInject.id == inject_id))
    inject = result.scalar_one_or_none()
    if not inject:
        raise HTTPException(status_code=404, detail="Inject not found")
    await db.delete(inject)
    await db.commit()


@router.get("/{incident_id}/exercise/observations")
async def list_observations(
    incident_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_exercise(incident_id, db)
    result = await db.execute(
        select(ExerciseObservation)
        .where(ExerciseObservation.incident_id == incident_id)
        .order_by(ExerciseObservation.created_at)
    )
    return [_obs_out(o) for o in result.scalars().all()]


@router.post("/{incident_id}/exercise/observations")
async def add_observation(
    incident_id: str,
    body: ObservationCreate,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    inc = await _require_exercise(incident_id, db)
    obs = ExerciseObservation(
        id=str(uuid.uuid4()),
        incident_id=incident_id,
        phase=body.phase or inc.phase,
        category=body.category,
        content=body.content,
        created_by=user.id,
    )
    db.add(obs)
    await db.commit()
    await db.refresh(obs)
    return _obs_out(obs)


@router.delete("/{incident_id}/exercise/observations/{obs_id}", status_code=204)
async def delete_observation(
    incident_id: str,
    obs_id: str,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    await _require_exercise(incident_id, db)
    result = await db.execute(select(ExerciseObservation).where(ExerciseObservation.id == obs_id))
    obs = result.scalar_one_or_none()
    if not obs:
        raise HTTPException(status_code=404, detail="Observation not found")
    await db.delete(obs)
    await db.commit()
