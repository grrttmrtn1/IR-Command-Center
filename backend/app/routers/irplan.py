import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.irplan import IRPlanSection, OnCallRoster
from app.models.user import User, UserRole
from app.schemas.irplan import (
    IRPlanSectionUpdate, IRPlanSectionResponse,
    OnCallRosterCreate, OnCallRosterUpdate, OnCallRosterResponse,
)
from app.middleware.auth import get_current_user, require_role

router = APIRouter(prefix="/api/ir-plan", tags=["ir-plan"])

DEFAULT_SECTIONS = [
    {"key": "scope", "title": "Scope and Purpose", "sort_order": 1,
     "content": "## Scope and Purpose\n\nDefine the purpose of this IR plan and what systems, data, and personnel it covers.\n\n### Purpose\n*Document the objectives of the IR plan here.*\n\n### Scope\n*List the systems, data types, and organizational units covered by this plan.*\n\n### Out of Scope\n*Document any explicit exclusions.*"},
    {"key": "roles", "title": "Roles and Responsibilities", "sort_order": 2,
     "content": "## Roles and Responsibilities\n\nDefine the IR team structure and responsibilities for each role.\n\n### IR Team Structure\n| Role | Responsibility | Primary | Backup |\n|------|---------------|---------|--------|\n| IR Lead | Overall incident coordination | | |\n| CISO | Executive escalation point | | |\n| Legal Counsel | Regulatory and legal guidance | | |\n| Communications Lead | Internal/external messaging | | |\n| Technical Analyst | Technical investigation | | |\n\n### RACI Matrix\n*Add RACI assignments for key IR activities.*"},
    {"key": "escalation", "title": "Escalation Procedures", "sort_order": 3,
     "content": "## Escalation Procedures\n\nDocument when and how to escalate incidents.\n\n### Escalation Criteria by Severity\n- **Critical**: Immediate escalation to CISO and executive team. Notify within 15 minutes.\n- **High**: Escalate to IR Lead and CISO within 1 hour.\n- **Medium**: Notify IR Lead within 4 hours.\n- **Low**: Standard workflow, daily status update.\n\n### Escalation Contacts\n*Reference the Contact Directory for primary and backup contacts.*\n\n### External Escalation\n*Document when to escalate to law enforcement, regulators, or cyber insurer.*"},
    {"key": "comms", "title": "Communication Procedures", "sort_order": 4,
     "content": "## Communication Procedures\n\nDefine internal and external communication protocols during an incident.\n\n### Internal Communications\n- Primary channel: War room in IR Command Center\n- Backup channel: *Document backup communication method*\n- Status update frequency: Every 2 hours during active incidents\n\n### External Communications\n- All external statements must be approved by Legal and CISO\n- Media inquiries: Route to designated communications lead\n- Customer notifications: Follow jurisdiction-specific templates\n- Regulatory notifications: See escalation procedures for timelines\n\n### Communication Do's and Don'ts\n- DO use approved templates for regulatory notifications\n- DO log all external communications in the incident timeline\n- DON'T speculate on cause or scope to external parties\n- DON'T disclose specific technical details publicly"},
    {"key": "legal_regulatory", "title": "Legal and Regulatory Requirements", "sort_order": 5,
     "content": "## Legal and Regulatory Requirements\n\nDocument the legal and regulatory obligations that apply during an incident.\n\n### Applicable Regulations\n*List the regulatory frameworks your organization is subject to (e.g., GDPR, HIPAA, PCI-DSS, CCPA, state breach notification laws).*\n\n### Notification Timelines\n| Regulation | Trigger | Notification Window | Recipient |\n|-----------|---------|--------------------|-----------|\n| GDPR | PII breach | 72 hours | Supervisory Authority |\n| HIPAA | PHI breach | 60 days | HHS / Affected individuals |\n| *State Law* | PII breach | *Varies* | *AG / Individuals* |\n\n### Legal Hold Procedures\n*Document the process for issuing a legal hold when litigation or regulatory investigation is anticipated.*"},
    {"key": "recovery", "title": "Recovery and Reconstitution", "sort_order": 6,
     "content": "## Recovery and Reconstitution\n\nDocument procedures for restoring normal operations after an incident.\n\n### Recovery Objectives\n- RTO (Recovery Time Objective): *Document per system*\n- RPO (Recovery Point Objective): *Document per system*\n\n### Recovery Sequence\n1. Verify the threat has been eradicated\n2. Restore from verified clean backups\n3. Validate system integrity before reconnecting\n4. Restore services in priority order (critical systems first)\n5. Monitor for signs of reinfection or continued threat activity\n6. Declare incident contained and transition to post-incident phase\n\n### Backup Locations and Procedures\n*Document where backups are stored and how to access them during an incident.*\n\n### Recovery Testing\n*Document when recovery procedures were last tested and the results.*"},
    {"key": "training_exercises", "title": "Training and Exercises", "sort_order": 7,
     "content": "## Training and Exercises\n\nDocument the IR training program and exercise schedule.\n\n### Training Requirements\n- All IR team members: Annual IR training\n- Analysts: Quarterly technical skill exercises\n- All staff: Annual security awareness training\n\n### Exercise Schedule\n| Exercise Type | Frequency | Last Conducted | Next Scheduled |\n|--------------|-----------|---------------|----------------|\n| Tabletop Exercise | Semi-annual | | |\n| Technical Exercise | Annual | | |\n| Full-scale Simulation | Annual | | |\n\n### Lessons Learned Process\n*Document how after action reviews are conducted and how findings feed back into plan updates.*"},
    {"key": "plan_maintenance", "title": "Plan Maintenance and Review", "sort_order": 8,
     "content": "## Plan Maintenance and Review\n\nDocument how this IR plan is maintained and kept current.\n\n### Review Schedule\n- Full plan review: Annually\n- Post-incident review: After every significant incident\n- Triggered review: After major organizational changes (mergers, new systems, new regulations)\n\n### Version History\n| Version | Date | Author | Changes |\n|---------|------|--------|--------|\n| 1.0 | | | Initial version |\n\n### Review and Approval\n- Plan Owner: *Name/Role*\n- Approved by: *Name/Role*\n- Distribution: *List who receives this document*"},
]


async def _seed_sections(db: AsyncSession) -> None:
    for sec in DEFAULT_SECTIONS:
        existing = await db.execute(
            select(IRPlanSection).where(IRPlanSection.section_key == sec["key"])
        )
        if existing.scalar_one_or_none():
            continue
        section = IRPlanSection(
            id=str(uuid.uuid4()),
            section_key=sec["key"],
            title=sec["title"],
            content=sec["content"],
            sort_order=sec["sort_order"],
        )
        db.add(section)
    await db.commit()


# ---------------------------------------------------------------------------
# IR Plan section endpoints
# ---------------------------------------------------------------------------

@router.get("/sections", response_model=list[IRPlanSectionResponse])
async def list_sections(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _seed_sections(db)
    result = await db.execute(select(IRPlanSection).order_by(IRPlanSection.sort_order))
    return result.scalars().all()


@router.patch("/sections/{section_key}", response_model=IRPlanSectionResponse)
async def update_section(
    section_key: str,
    body: IRPlanSectionUpdate,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(IRPlanSection).where(IRPlanSection.section_key == section_key))
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(section, field, value)
    section.updated_by = user.id
    section.version += 1
    await db.commit()
    await db.refresh(section)
    return section


@router.post("/sections/{section_key}/review", response_model=IRPlanSectionResponse)
async def mark_reviewed(
    section_key: str,
    user: User = Depends(require_role(UserRole.IR_LEAD)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(IRPlanSection).where(IRPlanSection.section_key == section_key))
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    section.last_reviewed_at = datetime.now(timezone.utc)
    section.reviewed_by_id = user.id
    await db.commit()
    await db.refresh(section)
    return section


# ---------------------------------------------------------------------------
# On-call roster endpoints
# ---------------------------------------------------------------------------

@router.get("/oncall", response_model=list[OnCallRosterResponse])
async def list_rosters(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(OnCallRoster).order_by(OnCallRoster.name))
    return result.scalars().all()


@router.post("/oncall", response_model=OnCallRosterResponse, status_code=201)
async def create_roster(
    body: OnCallRosterCreate,
    user: User = Depends(require_role(UserRole.IR_LEAD)),
    db: AsyncSession = Depends(get_db),
):
    roster = OnCallRoster(
        name=body.name,
        description=body.description,
        is_active=body.is_active,
        entries=[e.model_dump() for e in body.entries],
        created_by=user.id,
    )
    db.add(roster)
    await db.commit()
    await db.refresh(roster)
    return roster


@router.patch("/oncall/{roster_id}", response_model=OnCallRosterResponse)
async def update_roster(
    roster_id: str,
    body: OnCallRosterUpdate,
    user: User = Depends(require_role(UserRole.IR_LEAD)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(OnCallRoster).where(OnCallRoster.id == roster_id))
    roster = result.scalar_one_or_none()
    if not roster:
        raise HTTPException(status_code=404, detail="Roster not found")

    data = body.model_dump(exclude_none=True)
    if "entries" in data:
        data["entries"] = [e if isinstance(e, dict) else e.model_dump() for e in body.entries]
    for field, value in data.items():
        setattr(roster, field, value)
    await db.commit()
    await db.refresh(roster)
    return roster


@router.delete("/oncall/{roster_id}", status_code=204)
async def delete_roster(
    roster_id: str,
    user: User = Depends(require_role(UserRole.IR_LEAD)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(OnCallRoster).where(OnCallRoster.id == roster_id))
    roster = result.scalar_one_or_none()
    if not roster:
        raise HTTPException(status_code=404, detail="Roster not found")
    await db.delete(roster)
    await db.commit()
