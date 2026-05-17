import re as _re
from datetime import datetime, timezone
from html import escape
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
import aiofiles
import os
import uuid
from app.database import get_db
from app.models.incident import (
    Incident, IOC, AffectedAsset, IncidentNote, TimelineEvent, Evidence, IncidentTask,
    IncidentType,
)
from app.models.user import User, UserRole
from app.schemas.incident import (
    IncidentCreate, IncidentUpdate, IncidentResponse,
    IOCCreate, IOCResponse,
    AssetCreate, AssetUpdate, AssetResponse,
    NoteCreate, NoteResponse,
    TimelineEventCreate, TimelineEventResponse,
    EvidenceCreate, EvidenceResponse,
    TaskCreate, TaskUpdate, TaskResponse, TaskMoveRequest,
)
from app.middleware.auth import get_current_user, require_role
from app.config import settings
from app.models.task_template import TaskTemplate as TaskTemplateModel
from app.services.ws_manager import publish_incident_event
from app.services.notifications import publish_notification, publish_notification_to_all
from app.models.notification import NotificationType

router = APIRouter(prefix="/api/incidents", tags=["incidents"])

TASK_TEMPLATES = {
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


async def _add_timeline_event(db, incident_id, actor_id, event_type, description):
    event = TimelineEvent(
        incident_id=incident_id,
        actor_id=actor_id,
        event_type=event_type,
        description=description,
        occurred_at=datetime.now(timezone.utc),
    )
    db.add(event)


@router.get("", response_model=list[IncidentResponse])
async def list_incidents(
    exercise: bool | None = Query(None, description="Filter by exercise flag. None=all, true=only exercises, false=exclude exercises"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Incident).order_by(desc(Incident.created_at))
    if exercise is True:
        q = q.where(Incident.is_exercise == True)
    elif exercise is False:
        q = q.where(Incident.is_exercise == False)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=IncidentResponse, status_code=201)
async def create_incident(
    body: IncidentCreate,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    incident = Incident(**body.model_dump(), created_by=user.id)
    db.add(incident)
    await db.flush()

    # Seed tasks: merge builtin templates with DB overrides/custom
    types_to_seed = ["base"]
    if body.incident_type.value != "base":
        types_to_seed.append(body.incident_type.value)

    effective: list[tuple[str, str]] = []
    try:
        db_result = await db.execute(
            select(TaskTemplateModel)
            .where(TaskTemplateModel.incident_type.in_(types_to_seed))
            .order_by(TaskTemplateModel.sort_order)
        )
        db_tpls = db_result.scalars().all()
        override_map: dict[tuple[str, str], TaskTemplateModel] = {}
        custom_tpls: list[TaskTemplateModel] = []
        for t in db_tpls:
            if t.is_system:
                override_map[(t.incident_type, t.title)] = t
            else:
                custom_tpls.append(t)

        for itype in types_to_seed:
            for title, priority in TASK_TEMPLATES.get(itype, []):
                key = (itype, title)
                if key in override_map:
                    ot = override_map[key]
                    if ot.is_active:
                        effective.append((ot.title, ot.priority))
                else:
                    effective.append((title, priority))
        for t in custom_tpls:
            if t.is_active:
                effective.append((t.title, t.priority))
    except Exception:
        # Fallback to static templates if task_templates table is unavailable
        for itype in types_to_seed:
            effective.extend(TASK_TEMPLATES.get(itype, []))

    for i, (title, priority) in enumerate(effective):
        db.add(IncidentTask(
            incident_id=incident.id,
            title=title,
            priority=priority,
            status="TODO",
            sort_order=i,
            labels="",
            created_by=user.id,
        ))

    await _add_timeline_event(db, incident.id, user.id, "INCIDENT_CREATED", f"Incident created by {user.email}")
    await db.commit()
    await db.refresh(incident)
    return incident


@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(
    incident_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@router.patch("/{incident_id}", response_model=IncidentResponse)
async def update_incident(
    incident_id: str,
    body: IncidentUpdate,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    old_severity = incident.severity
    old_status = incident.status
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(incident, field, value)

    if body.status and body.status != old_status:
        await _add_timeline_event(db, incident_id, user.id, "STATUS_CHANGE",
                                   f"Status changed to {body.status.value}")

    if body.severity and body.severity != old_severity:
        # Notify all active users about severity change
        all_users = (await db.execute(
            select(User).where(User.is_active == True, User.id != user.id)
        )).scalars().all()
        await publish_notification_to_all(
            db,
            [u.id for u in all_users],
            NotificationType.SEVERITY_CHANGE,
            title=f"Incident severity changed: {incident.title}",
            body=f"Severity changed from {old_severity.value} to {body.severity.value}",
            incident_id=incident_id,
        )

    await db.commit()
    await db.refresh(incident)
    return incident


@router.delete("/{incident_id}", status_code=204)
async def delete_incident(
    incident_id: str,
    user: User = Depends(require_role(UserRole.IR_LEAD)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    await db.delete(incident)
    await db.commit()


# --- IOCs ---

@router.get("/{incident_id}/iocs")
async def list_iocs(incident_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(IOC).where(IOC.incident_id == incident_id).order_by(desc(IOC.created_at)))
    return [IOCResponse.from_orm_ioc(i) for i in result.scalars().all()]


@router.post("/{incident_id}/iocs", status_code=201)
async def add_ioc(incident_id: str, body: IOCCreate, user: User = Depends(require_role(UserRole.ANALYST)), db: AsyncSession = Depends(get_db)):
    ioc_type = body.get_ioc_type()
    ioc = IOC(
        ioc_type=ioc_type,
        value=body.value,
        confidence=body.confidence,
        source=body.source,
        notes=body.notes,
        incident_id=incident_id,
        created_by=user.id,
    )
    db.add(ioc)
    await _add_timeline_event(db, incident_id, user.id, "IOC_ADDED", f"IOC added: [{ioc_type.value}] {body.value}")
    await db.commit()
    await db.refresh(ioc)

    ioc_resp = IOCResponse.from_orm_ioc(ioc)
    await publish_incident_event(incident_id, {
        "type": "ioc_added",
        "actor": user.name or user.email,
        "data": ioc_resp.model_dump(mode="json"),
    })

    # Notify incident lead if set
    inc = (await db.execute(select(Incident).where(Incident.id == incident_id))).scalar_one_or_none()
    if inc and inc.lead_id and inc.lead_id != user.id:
        await publish_notification(
            db, inc.lead_id, NotificationType.IOC_ADDED,
            title=f"New IOC added to {inc.title}",
            body=f"[{ioc_type.value}] {body.value}",
            incident_id=incident_id,
        )
        await db.commit()

    return ioc_resp


@router.delete("/{incident_id}/iocs/{ioc_id}", status_code=204)
async def delete_ioc(incident_id: str, ioc_id: str, user: User = Depends(require_role(UserRole.ANALYST)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(IOC).where(IOC.id == ioc_id, IOC.incident_id == incident_id))
    ioc = result.scalar_one_or_none()
    if not ioc:
        raise HTTPException(status_code=404, detail="IOC not found")
    await db.delete(ioc)
    await db.commit()


# --- Assets ---

@router.get("/{incident_id}/assets", response_model=list[AssetResponse])
async def list_assets(incident_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AffectedAsset).where(AffectedAsset.incident_id == incident_id))
    return result.scalars().all()


@router.post("/{incident_id}/assets", response_model=AssetResponse, status_code=201)
async def add_asset(incident_id: str, body: AssetCreate, user: User = Depends(require_role(UserRole.ANALYST)), db: AsyncSession = Depends(get_db)):
    asset = AffectedAsset(**body.model_dump(), incident_id=incident_id, created_by=user.id)
    db.add(asset)
    await _add_timeline_event(db, incident_id, user.id, "ASSET_ADDED", f"Asset added: {body.name}")
    await db.commit()
    await db.refresh(asset)
    return asset


@router.patch("/{incident_id}/assets/{asset_id}", response_model=AssetResponse)
async def update_asset(incident_id: str, asset_id: str, body: AssetUpdate, user: User = Depends(require_role(UserRole.ANALYST)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AffectedAsset).where(AffectedAsset.id == asset_id, AffectedAsset.incident_id == incident_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(asset, field, value)
    await db.commit()
    await db.refresh(asset)
    return asset


# --- Notes ---

@router.get("/{incident_id}/notes", response_model=list[NoteResponse])
async def list_notes(incident_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(IncidentNote).where(IncidentNote.incident_id == incident_id).order_by(desc(IncidentNote.created_at)))
    return result.scalars().all()


@router.post("/{incident_id}/notes", response_model=NoteResponse, status_code=201)
async def add_note(incident_id: str, body: NoteCreate, user: User = Depends(require_role(UserRole.ANALYST)), db: AsyncSession = Depends(get_db)):
    note = IncidentNote(**body.model_dump(), incident_id=incident_id, author_id=user.id)
    db.add(note)
    await _add_timeline_event(db, incident_id, user.id, "NOTE_ADDED", "Note added to incident")
    await db.commit()
    await db.refresh(note)

    await publish_incident_event(incident_id, {
        "type": "note_added",
        "actor": user.name or user.email,
    })
    return note


# --- Timeline ---

@router.get("/{incident_id}/timeline", response_model=list[TimelineEventResponse])
async def get_timeline(incident_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TimelineEvent).where(TimelineEvent.incident_id == incident_id).order_by(TimelineEvent.occurred_at))
    return result.scalars().all()


@router.post("/{incident_id}/timeline", response_model=TimelineEventResponse, status_code=201)
async def add_timeline_event(incident_id: str, body: TimelineEventCreate, user: User = Depends(require_role(UserRole.ANALYST)), db: AsyncSession = Depends(get_db)):
    event = TimelineEvent(
        incident_id=incident_id,
        actor_id=user.id,
        actor=user.name or user.email,
        event_type=body.event_type,
        description=body.description,
        occurred_at=body.occurred_at,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)

    await publish_incident_event(incident_id, {
        "type": "timeline_event",
        "actor": user.name or user.email,
        "description": body.description,
    })
    return event


_VALID_TAG = _re.compile(r"^[A-Z0-9_]{2,20}:[A-Za-z0-9_.]{2,20}$")


class _TagsBody(BaseModel):
    tags: list[str]


@router.patch("/{incident_id}/timeline/{event_id}/tags")
async def update_timeline_event_tags(
    incident_id: str,
    event_id: str,
    body: _TagsBody,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    invalid = [t for t in body.tags if not _VALID_TAG.match(t)]
    if invalid:
        raise HTTPException(status_code=422, detail=f"Invalid tag format: {invalid[:3]}")
    result = await db.execute(
        select(TimelineEvent).where(TimelineEvent.id == event_id, TimelineEvent.incident_id == incident_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Timeline event not found")
    event.tags = body.tags
    await db.commit()
    await db.refresh(event)
    return {"id": event.id, "tags": event.tags}


# --- Evidence ---

@router.get("/{incident_id}/evidence", response_model=list[EvidenceResponse])
async def list_evidence(incident_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Evidence).where(Evidence.incident_id == incident_id).order_by(desc(Evidence.collected_at)))
    return result.scalars().all()


@router.post("/{incident_id}/evidence", response_model=EvidenceResponse, status_code=201)
async def upload_evidence(
    incident_id: str,
    title: str = Form(...),
    description: str = Form(""),
    file: UploadFile = File(None),
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    file_path = None
    file_size = None
    mime_type = None

    if file:
        max_size = settings.max_upload_size_mb * 1024 * 1024
        content = await file.read()
        if len(content) > max_size:
            raise HTTPException(status_code=413, detail="File too large")
        file_ext = os.path.splitext(file.filename or "")[1]
        file_name = f"{uuid.uuid4()}{file_ext}"
        dest = os.path.join(settings.upload_dir, "evidence", incident_id)
        os.makedirs(dest, exist_ok=True)
        full_path = os.path.join(dest, file_name)
        async with aiofiles.open(full_path, "wb") as f:
            await f.write(content)
        file_path = full_path
        file_size = len(content)
        mime_type = file.content_type

    evidence = Evidence(
        incident_id=incident_id,
        title=title,
        description=description or None,
        file_path=file_path,
        file_size=file_size,
        mime_type=mime_type,
        chain_of_custody=[{"action": "collected", "by": user.email, "at": datetime.now(timezone.utc).isoformat()}],
        collected_by=user.id,
    )
    db.add(evidence)
    await _add_timeline_event(db, incident_id, user.id, "EVIDENCE_ADDED", f"Evidence collected: {title}")
    await db.commit()
    await db.refresh(evidence)
    return evidence


# --- Tasks (incident-scoped) ---

@router.get("/{incident_id}/tasks", response_model=list[TaskResponse])
async def list_incident_tasks(incident_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(IncidentTask).where(IncidentTask.incident_id == incident_id).order_by(IncidentTask.sort_order)
    )
    return result.scalars().all()


@router.post("/{incident_id}/tasks", response_model=TaskResponse, status_code=201)
async def create_incident_task(incident_id: str, body: TaskCreate, user: User = Depends(require_role(UserRole.ANALYST)), db: AsyncSession = Depends(get_db)):
    task = IncidentTask(**body.model_dump(), incident_id=incident_id, created_by=user.id)
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


# --- AI Exec Brief ---

@router.post("/{incident_id}/exec-brief")
async def generate_exec_brief(
    incident_id: str,
    user: User = Depends(require_role(UserRole.IR_LEAD)),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Incident)
        .options(selectinload(Incident.iocs), selectinload(Incident.assets), selectinload(Incident.notes))
        .where(Incident.id == incident_id)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    from app.models.knowledge import AIConfig
    ai_result = await db.execute(select(AIConfig).limit(1))
    ai_config_row = ai_result.scalar_one_or_none()

    if not ai_config_row or not ai_config_row.providers_encrypted:
        raise HTTPException(status_code=400, detail="AI provider not configured")

    from app.auth.encryption import decrypt
    from app.services.ai import get_provider, AIMessage
    providers_config = decrypt(ai_config_row.providers_encrypted)
    provider = get_provider({"default_provider": ai_config_row.default_provider, "providers": providers_config})

    ioc_summary = "\n".join([f"- [{i.ioc_type.value}] {i.value} (confidence: {i.confidence})" for i in incident.iocs[:20]])
    asset_summary = "\n".join([f"- {a.name} ({a.asset_type}) - Status: {a.status}" for a in incident.assets[:15]])
    exec_notes = "\n".join([n.content for n in incident.notes if n.is_pinned or n.is_exec_briefing][:5])

    prompt = f"""Create a concise executive briefing for the following incident. Be factual, clear, and avoid technical jargon. Structure it with: Situation, Impact, Current Status, Immediate Actions Taken, and Next Steps.

Incident: {incident.title}
Type: {incident.incident_type.value}
Severity: {incident.severity.value}
Status: {incident.status.value}
Phase: {incident.phase.value}
Started: {incident.started_at.isoformat()}

IOCs ({len(incident.iocs)} total, showing up to 20):
{ioc_summary or 'None identified yet'}

Affected Assets ({len(incident.assets)} total, showing up to 15):
{asset_summary or 'None documented yet'}

Key Notes:
{exec_notes or 'No pinned notes yet'}"""

    response = await provider.generate([AIMessage(role="user", content=prompt)], max_tokens=1500, temperature=0.3)

    note = IncidentNote(
        incident_id=incident_id,
        author_id=user.id,
        content=response.content,
        is_exec_briefing=True,
        is_pinned=True,
    )
    db.add(note)
    await _add_timeline_event(db, incident_id, user.id, "EXEC_BRIEF_GENERATED", "Executive briefing generated via AI")
    await db.commit()

    return {"content": response.content, "note_id": note.id}


# --- PDF Report Export ---

@router.get("/{incident_id}/report")
async def export_report(
    incident_id: str,
    ai_narrative: bool = Query(False),
    user: User = Depends(require_role(UserRole.IR_LEAD)),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Incident)
        .options(
            selectinload(Incident.iocs),
            selectinload(Incident.assets),
            selectinload(Incident.tasks),
            selectinload(Incident.timeline_events),
        )
        .where(Incident.id == incident_id)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    narrative = ""
    if ai_narrative:
        try:
            from app.models.knowledge import AIConfig
            from app.auth.encryption import decrypt
            from app.services.ai import get_provider, AIMessage
            ai_cfg = (await db.execute(select(AIConfig).limit(1))).scalar_one_or_none()
            if ai_cfg and ai_cfg.providers_encrypted:
                providers_config = decrypt(ai_cfg.providers_encrypted)
                provider = get_provider({"default_provider": ai_cfg.default_provider, "providers": providers_config})
                ioc_list = "\n".join([f"- [{i.ioc_type.value}] {i.value}" for i in incident.iocs[:15]])
                ai_prompt = (
                    f"Write a 3-paragraph post-incident narrative for the following incident.\n\n"
                    f"Title: {incident.title}\nType: {incident.incident_type.value}\n"
                    f"Severity: {incident.severity.value}\nStatus: {incident.status.value}\n"
                    f"IOCs:\n{ioc_list or 'None'}\n\n"
                    "Paragraph 1: What happened. Paragraph 2: Impact and response actions. "
                    "Paragraph 3: Lessons learned and remediation."
                )
                ai_resp = await provider.generate([AIMessage(role="user", content=ai_prompt)], max_tokens=800, temperature=0.4)
                narrative = ai_resp.content
        except Exception:
            narrative = ""

    ioc_rows = "".join(
        f"<tr><td>{escape(i.ioc_type.value)}</td><td style='font-family:monospace'>{escape(i.value)}</td>"
        f"<td>{escape(str(i.confidence))}</td><td>{escape(i.source or '')}</td></tr>"
        for i in incident.iocs
    )
    task_rows = "".join(
        f"<tr><td>{escape(t.title)}</td><td>{escape(t.priority.value)}</td><td>{escape(t.status.value)}</td></tr>"
        for t in sorted(incident.tasks, key=lambda x: x.sort_order)
    )
    timeline_rows = "".join(
        f"<tr><td>{e.occurred_at.strftime('%Y-%m-%d %H:%M')}</td>"
        f"<td>{escape(e.event_type)}</td><td>{escape(e.description)}</td><td>{escape(e.actor or '')}</td></tr>"
        for e in sorted(incident.timeline_events, key=lambda x: x.occurred_at)
    )
    tasks_done = sum(1 for t in incident.tasks if t.status.value == "DONE")
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    sev_color = {"CRITICAL": "#dc2626", "HIGH": "#f97316", "MEDIUM": "#eab308", "LOW": "#3b82f6"}.get(incident.severity.value, "#6b7280")

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body {{ font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 40px; }}
  h1 {{ font-size: 22px; margin-bottom: 4px; }}
  h2 {{ font-size: 15px; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; margin-top: 28px; }}
  .badge {{ display: inline-block; padding: 3px 10px; border-radius: 4px; font-weight: bold; font-size: 11px; color: white; background: {sev_color}; }}
  .meta {{ color: #6b7280; font-size: 11px; margin-bottom: 20px; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
  th {{ background: #f3f4f6; text-align: left; padding: 6px 8px; font-size: 11px; }}
  td {{ padding: 5px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }}
  .narrative {{ background: #f9fafb; border-left: 3px solid #3b82f6; padding: 12px 16px; white-space: pre-wrap; line-height: 1.6; }}
  .footer {{ margin-top: 40px; font-size: 10px; color: #9ca3af; text-align: center; }}
</style></head><body>
<h1>{escape(incident.title)}</h1>
<div class="meta">
  <span class="badge">{escape(incident.severity.value)}</span>&nbsp;
  {escape(incident.incident_type.value.replace("_", " "))} &bull; Status: {escape(incident.status.value)} &bull; Phase: {escape(incident.phase.value)}<br>
  Started: {incident.started_at.strftime("%Y-%m-%d %H:%M UTC")}
  {f" &bull; Contained: {incident.contained_at.strftime('%Y-%m-%d %H:%M UTC')}" if incident.contained_at else ""}
  {f" &bull; Resolved: {incident.resolved_at.strftime('%Y-%m-%d %H:%M UTC')}" if incident.resolved_at else ""}
</div>

{f'<h2>Executive Narrative</h2><div class="narrative">{narrative}</div>' if narrative else ""}

<h2>IOCs ({len(incident.iocs)})</h2>
<table><thead><tr><th>Type</th><th>Value</th><th>Confidence</th><th>Source</th></tr></thead>
<tbody>{ioc_rows or "<tr><td colspan='4'>No IOCs recorded</td></tr>"}</tbody></table>

<h2>Tasks ({tasks_done}/{len(incident.tasks)} complete)</h2>
<table><thead><tr><th>Task</th><th>Priority</th><th>Status</th></tr></thead>
<tbody>{task_rows or "<tr><td colspan='3'>No tasks</td></tr>"}</tbody></table>

<h2>Timeline ({len(incident.timeline_events)} events)</h2>
<table><thead><tr><th>Time</th><th>Event</th><th>Description</th><th>Actor</th></tr></thead>
<tbody>{timeline_rows or "<tr><td colspan='4'>No timeline events</td></tr>"}</tbody></table>

<div class="footer">Generated by IR Command Center &bull; {generated_at}</div>
</body></html>"""

    try:
        import weasyprint
        pdf_bytes = weasyprint.HTML(string=html).write_pdf()
    except ImportError:
        # Fallback: return HTML if weasyprint not installed
        return Response(content=html, media_type="text/html")

    safe_title = "".join(c if c.isalnum() else "-" for c in incident.title)[:40]
    filename = f"incident-{safe_title}-{incident_id[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
