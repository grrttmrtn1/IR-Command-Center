from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.playbook import Playbook
from app.models.irplan import IRPlanSection
from app.models.knowledge import OrgKnowledge, ContactList
from app.models.incident import Incident
from app.models.user import User
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/readiness", tags=["readiness"])

MAJOR_INCIDENT_TYPES = ["RANSOMWARE", "DATA_BREACH", "INSIDER_THREAT", "DDOS", "PHISHING", "MALWARE"]
EXTERNAL_CONTACT_CATEGORIES = ["LEGAL", "INSURANCE", "FORENSICS"]
REQUIRED_PLAN_SECTIONS = ["scope", "roles", "escalation", "comms", "legal_regulatory", "recovery"]


class ReadinessDimension(BaseModel):
    label: str
    score: int          # 0–100
    max_score: int      # always 100
    weight: float       # contribution weight (0–1, all weights sum to 1)
    status: str         # GOOD | WARNING | CRITICAL
    detail: str
    items: list[dict]   # per-item breakdown


class ReadinessScore(BaseModel):
    total: int          # 0–100 weighted aggregate
    grade: str          # A / B / C / D / F
    dimensions: list[ReadinessDimension]
    assessed_at: datetime


def _grade(score: int) -> str:
    if score >= 90: return "A"
    if score >= 75: return "B"
    if score >= 60: return "C"
    if score >= 40: return "D"
    return "F"


def _status(score: int) -> str:
    if score >= 75: return "GOOD"
    if score >= 40: return "WARNING"
    return "CRITICAL"


@router.get("/score", response_model=ReadinessScore)
async def get_readiness_score(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    six_months_ago = now - timedelta(days=180)
    twelve_months_ago = now - timedelta(days=365)

    # -----------------------------------------------------------------------
    # 1. PLAYBOOKS (20%) — active playbook per major threat type
    # -----------------------------------------------------------------------
    pb_result = await db.execute(
        select(Playbook.incident_type).where(Playbook.is_active == True).distinct()
    )
    covered_types = {row[0] for row in pb_result.all()}

    pb_items = []
    for itype in MAJOR_INCIDENT_TYPES:
        covered = itype in covered_types
        pb_items.append({"label": itype.replace("_", " ").title(), "covered": covered})

    pb_score = round((len(covered_types & set(MAJOR_INCIDENT_TYPES)) / len(MAJOR_INCIDENT_TYPES)) * 100)

    # -----------------------------------------------------------------------
    # 2. CONTACT DIRECTORY (20%) — key external contacts documented
    # -----------------------------------------------------------------------
    contacts_result = await db.execute(
        select(ContactList.category).where(ContactList.category.in_(EXTERNAL_CONTACT_CATEGORIES)).distinct()
    )
    covered_categories = {row[0] for row in contacts_result.all()}

    # Also check OrgKnowledge for legacy legal/insurance data
    know_result = await db.execute(select(OrgKnowledge).limit(1))
    knowledge = know_result.scalar_one_or_none()

    if knowledge and knowledge.legal_counsel:
        covered_categories.add("LEGAL")
    if knowledge and knowledge.insurance_info:
        covered_categories.add("INSURANCE")

    contact_items = []
    for cat in EXTERNAL_CONTACT_CATEGORIES:
        covered = cat in covered_categories
        contact_items.append({"label": cat.replace("_", " ").title(), "covered": covered})

    # Also check if internal IR contacts exist
    internal_count_result = await db.execute(
        select(func.count(ContactList.id)).where(ContactList.category.in_(["IR_TEAM", "EXEC_TEAM"]))
    )
    internal_count = internal_count_result.scalar() or 0
    internal_covered = internal_count >= 2
    contact_items.append({"label": "Internal IR/Exec Contacts", "covered": internal_covered})

    total_contact_checks = len(EXTERNAL_CONTACT_CATEGORIES) + 1
    covered_contact_checks = len(covered_categories & set(EXTERNAL_CONTACT_CATEGORIES)) + (1 if internal_covered else 0)
    contact_score = round((covered_contact_checks / total_contact_checks) * 100)

    # -----------------------------------------------------------------------
    # 3. IR PLAN (20%) — sections populated and recently reviewed
    # -----------------------------------------------------------------------
    plan_result = await db.execute(
        select(IRPlanSection).where(IRPlanSection.section_key.in_(REQUIRED_PLAN_SECTIONS))
    )
    sections = {s.section_key: s for s in plan_result.scalars().all()}

    plan_items = []
    plan_points = 0
    for key in REQUIRED_PLAN_SECTIONS:
        s = sections.get(key)
        has_content = bool(s and s.content and len(s.content.strip()) > 200)
        recently_reviewed = bool(s and s.last_reviewed_at and s.last_reviewed_at >= twelve_months_ago)

        if has_content and recently_reviewed:
            status_str = "current"
            plan_points += 2
        elif has_content:
            status_str = "needs_review"
            plan_points += 1
        else:
            status_str = "missing"

        plan_items.append({
            "label": s.title if s else key.replace("_", " ").title(),
            "status": status_str,
            "last_reviewed": s.last_reviewed_at.isoformat() if (s and s.last_reviewed_at) else None,
        })

    plan_max = len(REQUIRED_PLAN_SECTIONS) * 2
    plan_score = round((plan_points / plan_max) * 100)

    # -----------------------------------------------------------------------
    # 4. EXERCISES (20%) — tabletop conducted in last 6 months
    # -----------------------------------------------------------------------
    exercise_result = await db.execute(
        select(func.count(Incident.id)).where(
            Incident.is_exercise == True,
            Incident.started_at >= six_months_ago,
        )
    )
    recent_exercises = exercise_result.scalar() or 0

    any_exercise_result = await db.execute(
        select(Incident).where(Incident.is_exercise == True).order_by(Incident.started_at.desc()).limit(1)
    )
    last_exercise = any_exercise_result.scalar_one_or_none()

    if recent_exercises >= 2:
        exercise_score = 100
        exercise_detail = f"{recent_exercises} exercises in the last 6 months"
    elif recent_exercises == 1:
        exercise_score = 70
        exercise_detail = "1 exercise in the last 6 months — target 2 per year"
    elif last_exercise:
        days_since = (now - last_exercise.started_at).days
        exercise_score = max(0, 40 - days_since // 30)
        exercise_detail = f"Last exercise was {days_since} days ago — schedule one soon"
    else:
        exercise_score = 0
        exercise_detail = "No tabletop exercises recorded — schedule one immediately"

    exercise_items = [
        {"label": "Exercises in last 6 months", "count": recent_exercises},
        {"label": "Last exercise", "date": last_exercise.started_at.isoformat() if last_exercise else None},
    ]

    # -----------------------------------------------------------------------
    # 5. ORG KNOWLEDGE (20%) — knowledge base populated
    # -----------------------------------------------------------------------
    know_items = []
    know_points = 0
    if knowledge:
        checks = [
            ("Organization profile", bool(knowledge.org_name and knowledge.industry)),
            ("Critical systems documented", bool(knowledge.critical_systems and len(knowledge.critical_systems) > 0)),
            ("Regulatory obligations", bool(knowledge.regulatory_obligations and len(knowledge.regulatory_obligations) > 0)),
            ("Cyber insurance info", bool(knowledge.insurance_info)),
            ("Legal counsel info", bool(knowledge.legal_counsel)),
        ]
        for label, covered in checks:
            know_items.append({"label": label, "covered": covered})
            if covered:
                know_points += 1
        know_score = round((know_points / len(checks)) * 100)
    else:
        know_score = 0
        know_items = [{"label": "Organization knowledge not configured", "covered": False}]

    # -----------------------------------------------------------------------
    # Aggregate
    # -----------------------------------------------------------------------
    weights = {"playbooks": 0.20, "contacts": 0.20, "irplan": 0.25, "exercises": 0.20, "knowledge": 0.15}
    total = round(
        pb_score * weights["playbooks"]
        + contact_score * weights["contacts"]
        + plan_score * weights["irplan"]
        + exercise_score * weights["exercises"]
        + know_score * weights["knowledge"]
    )

    dimensions = [
        ReadinessDimension(
            label="Response Playbooks",
            score=pb_score,
            max_score=100,
            weight=weights["playbooks"],
            status=_status(pb_score),
            detail=f"{len(covered_types & set(MAJOR_INCIDENT_TYPES))}/{len(MAJOR_INCIDENT_TYPES)} major threat types have an active playbook",
            items=pb_items,
        ),
        ReadinessDimension(
            label="Contact Directory",
            score=contact_score,
            max_score=100,
            weight=weights["contacts"],
            status=_status(contact_score),
            detail=f"{covered_contact_checks}/{total_contact_checks} key contact categories documented",
            items=contact_items,
        ),
        ReadinessDimension(
            label="IR Plan",
            score=plan_score,
            max_score=100,
            weight=weights["irplan"],
            status=_status(plan_score),
            detail=f"{sum(1 for i in plan_items if i['status'] == 'current')}/{len(REQUIRED_PLAN_SECTIONS)} sections current (populated + reviewed within 12 months)",
            items=plan_items,
        ),
        ReadinessDimension(
            label="Exercises & Testing",
            score=exercise_score,
            max_score=100,
            weight=weights["exercises"],
            status=_status(exercise_score),
            detail=exercise_detail,
            items=exercise_items,
        ),
        ReadinessDimension(
            label="Organization Knowledge",
            score=know_score,
            max_score=100,
            weight=weights["knowledge"],
            status=_status(know_score),
            detail=f"{know_points}/{len(know_items)} knowledge base fields populated",
            items=know_items,
        ),
    ]

    return ReadinessScore(
        total=total,
        grade=_grade(total),
        dimensions=dimensions,
        assessed_at=now,
    )
