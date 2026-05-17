"""
Task template management — allows admins to view, edit, add, and deactivate
the out-of-the-box task templates that are seeded into new incidents.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models.task_template import TaskTemplate
from app.models.user import User, UserRole
from app.middleware.auth import get_current_user, require_role

router = APIRouter(prefix="/api/task-templates", tags=["admin"])

BUILTIN_INCIDENT_TYPES = [
    "base", "RANSOMWARE", "DATA_BREACH", "DDOS", "PHISHING", "INSIDER_THREAT",
    "MALWARE", "VULNERABILITY", "OTHER",
]

BUILTIN_TEMPLATES = {
    "base": [
        ("Assign Incident Commander", "CRITICAL"),
        ("Notify IR team members", "HIGH"),
        ("Document initial findings", "HIGH"),
        ("Assess scope and severity", "HIGH"),
        ("Engage legal counsel", "HIGH"),
        ("Preserve evidence (logs, memory, disk images)", "HIGH"),
        ("Implement initial containment measures", "HIGH"),
        ("Draft executive briefing", "MEDIUM"),
        ("Assess regulatory notification obligations", "MEDIUM"),
        ("Schedule post-incident review", "LOW"),
        ("Update playbooks based on lessons learned", "LOW"),
    ],
    "RANSOMWARE": [
        ("Isolate all affected systems from network", "CRITICAL"),
        ("Verify integrity of backup systems", "CRITICAL"),
        ("Contact cyber insurance carrier", "HIGH"),
        ("Assess decryption feasibility", "HIGH"),
        ("Contact FBI IC3 (ic3.gov)", "HIGH"),
        ("Review ransom payment legal considerations with counsel", "HIGH"),
        ("Notify CISA if critical infrastructure", "MEDIUM"),
        ("Document ransom note and attacker communications", "MEDIUM"),
    ],
    "DATA_BREACH": [
        ("Identify types and volume of data exposed", "CRITICAL"),
        ("Map notification obligations by jurisdiction", "HIGH"),
        ("File SEC 8-K within 4 business days (if public company)", "HIGH"),
        ("Prepare state AG notifications per applicable laws", "HIGH"),
        ("File GDPR Article 33 notification within 72 hours", "HIGH"),
        ("Engage credit monitoring vendor for affected individuals", "MEDIUM"),
        ("Draft customer breach notification letter", "HIGH"),
        ("Draft employee notification", "MEDIUM"),
        ("Document data lineage and affected records count", "HIGH"),
    ],
    "DDOS": [
        ("Activate DDoS mitigation service/scrubbing", "CRITICAL"),
        ("Coordinate with upstream ISP for traffic filtering", "HIGH"),
        ("Document attack vector and source IPs", "HIGH"),
        ("Engage cloud scrubbing provider if needed", "HIGH"),
        ("Monitor recovery of services", "MEDIUM"),
        ("Implement rate limiting and geo-blocking as needed", "MEDIUM"),
    ],
    "PHISHING": [
        ("Quarantine malicious emails from all mailboxes", "CRITICAL"),
        ("Identify all users who received/clicked the phishing link", "HIGH"),
        ("Reset credentials for compromised accounts", "HIGH"),
        ("Check for credential reuse across systems", "HIGH"),
        ("Block malicious URLs and sender domains", "HIGH"),
        ("Send user awareness alert to organization", "MEDIUM"),
    ],
    "INSIDER_THREAT": [
        ("Secure HR and legal privilege for investigation", "CRITICAL"),
        ("Preserve user activity logs without alerting subject", "HIGH"),
        ("Coordinate with HR and legal on response actions", "HIGH"),
        ("Assess data exfiltration scope", "HIGH"),
        ("Restrict subject's access as appropriate", "HIGH"),
        ("Engage law enforcement if criminal activity suspected", "MEDIUM"),
    ],
    "MALWARE": [
        ("Isolate infected systems from network immediately", "CRITICAL"),
        ("Identify malware family and attack vector", "HIGH"),
        ("Run memory forensics on affected hosts", "HIGH"),
        ("Check for lateral movement and persistence mechanisms", "HIGH"),
        ("Remove malware and restore from clean backups", "HIGH"),
        ("Scan environment for additional indicators of compromise", "HIGH"),
        ("Patch exploited vulnerability if applicable", "MEDIUM"),
        ("Update endpoint detection signatures", "MEDIUM"),
    ],
    "VULNERABILITY": [
        ("Assess exploitability and exposure scope", "CRITICAL"),
        ("Apply emergency patch or implement compensating controls", "CRITICAL"),
        ("Scan for all affected systems in environment", "HIGH"),
        ("Check for evidence of prior exploitation", "HIGH"),
        ("Notify affected vendors and stakeholders", "HIGH"),
        ("Document CVE details and CVSS score", "MEDIUM"),
        ("Validate patch deployment across all systems", "MEDIUM"),
        ("Update vulnerability management records", "LOW"),
    ],
    "OTHER": [
        ("Define incident scope and classification", "CRITICAL"),
        ("Identify affected systems and data", "HIGH"),
        ("Implement containment measures", "HIGH"),
        ("Engage relevant subject matter experts", "HIGH"),
        ("Document findings and response actions", "MEDIUM"),
        ("Assess notification and regulatory obligations", "MEDIUM"),
    ],
}


class TemplateCreate(BaseModel):
    incident_type: str
    title: str
    priority: str = "MEDIUM"
    description: str | None = None
    sort_order: int = 0


class TemplateUpdate(BaseModel):
    title: str | None = None
    priority: str | None = None
    description: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class TemplateResponse(BaseModel):
    id: str
    incident_type: str
    title: str
    priority: str
    description: str | None
    sort_order: int
    is_active: bool
    is_system: bool

    class Config:
        from_attributes = True


@router.get("")
async def list_templates(
    incident_type: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns merged view: built-in templates (from code) plus any DB overrides/additions.
    DB records with matching incident_type+title shadow the built-in entry.
    """
    # Fetch all DB templates
    query = select(TaskTemplate).order_by(TaskTemplate.incident_type, TaskTemplate.sort_order)
    if incident_type:
        query = query.where(TaskTemplate.incident_type == incident_type)
    result = await db.execute(query)
    db_templates = result.scalars().all()

    db_map: dict[tuple, TaskTemplate] = {}
    for t in db_templates:
        db_map[(t.incident_type, t.title)] = t

    # Build merged list
    merged = []
    if not incident_type:
        types_to_show = list(BUILTIN_TEMPLATES.keys())
    else:
        types_to_show = [incident_type] if incident_type in BUILTIN_TEMPLATES else []

    seen_ids: set[str] = set()
    for itype in types_to_show:
        for sort_idx, (title, priority) in enumerate(BUILTIN_TEMPLATES.get(itype, [])):
            key = (itype, title)
            if key in db_map:
                t = db_map[key]
                seen_ids.add(t.id)
                merged.append({
                    "id": t.id, "incident_type": t.incident_type, "title": t.title,
                    "priority": t.priority, "description": t.description,
                    "sort_order": t.sort_order, "is_active": t.is_active, "is_system": True,
                })
            else:
                merged.append({
                    "id": f"builtin:{itype}:{sort_idx}", "incident_type": itype, "title": title,
                    "priority": priority, "description": None,
                    "sort_order": sort_idx, "is_active": True, "is_system": True,
                })

    # Add DB templates not already represented (custom templates for any type,
    # including custom incident types not in BUILTIN_TEMPLATES)
    for t in db_templates:
        if t.id not in seen_ids:
            merged.append({
                "id": t.id, "incident_type": t.incident_type, "title": t.title,
                "priority": t.priority, "description": t.description,
                "sort_order": t.sort_order, "is_active": t.is_active, "is_system": t.is_system,
            })

    return merged


@router.post("", status_code=201)
async def create_template(
    body: TemplateCreate,
    user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    template = TaskTemplate(
        id=str(uuid.uuid4()),
        incident_type=body.incident_type,
        title=body.title,
        priority=body.priority,
        description=body.description,
        sort_order=body.sort_order,
        is_active=True,
        is_system=False,
        created_by=user.id,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.patch("/{template_id}")
async def update_template(
    template_id: str,
    body: TemplateUpdate,
    user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    """
    If template_id starts with 'builtin:', create a DB override record for the built-in template.
    Otherwise update the existing DB record.
    """
    if template_id.startswith("builtin:"):
        # Parse the builtin reference and create an override
        parts = template_id.split(":", 2)
        itype = parts[1]
        sort_idx = int(parts[2])
        builtin_list = BUILTIN_TEMPLATES.get(itype, [])
        if sort_idx >= len(builtin_list):
            raise HTTPException(status_code=404, detail="Built-in template not found")
        orig_title, orig_priority = builtin_list[sort_idx]
        template = TaskTemplate(
            id=str(uuid.uuid4()),
            incident_type=itype,
            title=body.title or orig_title,
            priority=body.priority or orig_priority,
            description=body.description,
            sort_order=body.sort_order if body.sort_order is not None else sort_idx,
            is_active=body.is_active if body.is_active is not None else True,
            is_system=True,
            created_by=user.id,
        )
        db.add(template)
        await db.commit()
        await db.refresh(template)
        return template

    result = await db.execute(select(TaskTemplate).where(TaskTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(template, field, value)
    await db.commit()
    await db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: str,
    user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    if template_id.startswith("builtin:"):
        raise HTTPException(status_code=400, detail="Cannot delete built-in templates; disable them instead")
    result = await db.execute(select(TaskTemplate).where(TaskTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(template)
    await db.commit()
