"""
External REST API — authenticated via API key Bearer token.
All routes are versioned under /api/v1/.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.database import get_db
from app.models.incident import Incident, IOC, AffectedAsset, IncidentTask
from app.models.document import Document
from app.models.audit import AuditLog
from app.models.user import ApiKey
from app.schemas.incident import (
    IncidentCreate, IncidentUpdate, IncidentResponse,
    IOCCreate, IOCResponse, AssetResponse, TaskResponse,
)
from app.schemas.document import DocumentResponse
from app.middleware.auth import get_api_key_user, require_api_scope

router = APIRouter(prefix="/api/v1", tags=["External API v1"])


def _scope(scope: str):
    return Depends(require_api_scope(scope))


@router.get(
    "/incidents",
    response_model=list[IncidentResponse],
    summary="List incidents",
    description="Returns all incidents. Requires scope: incidents:read",
)
async def v1_list_incidents(
    status: str | None = None,
    severity: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    api_key: ApiKey = _scope("incidents:read"),
    db: AsyncSession = Depends(get_db),
):
    query = select(Incident).order_by(desc(Incident.created_at)).limit(limit)
    if status:
        query = query.where(Incident.status == status)
    if severity:
        query = query.where(Incident.severity == severity)
    result = await db.execute(query)
    return result.scalars().all()


@router.post(
    "/incidents",
    response_model=IncidentResponse,
    status_code=201,
    summary="Create incident",
    description="Requires scope: incidents:write",
)
async def v1_create_incident(
    body: IncidentCreate,
    api_key: ApiKey = _scope("incidents:write"),
    db: AsyncSession = Depends(get_db),
):
    incident = Incident(**body.model_dump(), created_by=api_key.created_by)
    db.add(incident)
    await db.commit()
    await db.refresh(incident)
    return incident


@router.get(
    "/incidents/{incident_id}",
    response_model=IncidentResponse,
    summary="Get incident",
    description="Requires scope: incidents:read",
)
async def v1_get_incident(
    incident_id: str,
    api_key: ApiKey = _scope("incidents:read"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@router.patch(
    "/incidents/{incident_id}",
    response_model=IncidentResponse,
    summary="Update incident",
    description="Requires scope: incidents:write",
)
async def v1_update_incident(
    incident_id: str,
    body: IncidentUpdate,
    api_key: ApiKey = _scope("incidents:write"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(incident, field, value)
    await db.commit()
    await db.refresh(incident)
    return incident


@router.get(
    "/incidents/{incident_id}/iocs",
    response_model=list[IOCResponse],
    summary="List IOCs for incident",
    description="Requires scope: incidents:read",
)
async def v1_list_iocs(
    incident_id: str,
    api_key: ApiKey = _scope("incidents:read"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(IOC).where(IOC.incident_id == incident_id))
    return result.scalars().all()


@router.post(
    "/incidents/{incident_id}/iocs",
    response_model=IOCResponse,
    status_code=201,
    summary="Add IOC to incident",
    description="Requires scope: incidents:write",
)
async def v1_add_ioc(
    incident_id: str,
    body: IOCCreate,
    api_key: ApiKey = _scope("incidents:write"),
    db: AsyncSession = Depends(get_db),
):
    ioc = IOC(**body.model_dump(), incident_id=incident_id, created_by=api_key.created_by)
    db.add(ioc)
    await db.commit()
    await db.refresh(ioc)
    return ioc


@router.get(
    "/incidents/{incident_id}/assets",
    response_model=list[AssetResponse],
    summary="List affected assets",
    description="Requires scope: incidents:read",
)
async def v1_list_assets(
    incident_id: str,
    api_key: ApiKey = _scope("incidents:read"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AffectedAsset).where(AffectedAsset.incident_id == incident_id))
    return result.scalars().all()


@router.get(
    "/incidents/{incident_id}/tasks",
    response_model=list[TaskResponse],
    summary="List tasks for incident",
    description="Requires scope: tasks:read",
)
async def v1_list_incident_tasks(
    incident_id: str,
    api_key: ApiKey = _scope("tasks:read"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(IncidentTask).where(IncidentTask.incident_id == incident_id).order_by(IncidentTask.sort_order))
    return result.scalars().all()


@router.get(
    "/documents",
    response_model=list[DocumentResponse],
    summary="List documents",
    description="Requires scope: documents:read",
)
async def v1_list_documents(
    category: str | None = None,
    api_key: ApiKey = _scope("documents:read"),
    db: AsyncSession = Depends(get_db),
):
    query = select(Document).order_by(Document.title)
    if category:
        query = query.where(Document.category == category)
    result = await db.execute(query)
    return result.scalars().all()


@router.get(
    "/tasks",
    response_model=list[TaskResponse],
    summary="List all tasks",
    description="Requires scope: tasks:read",
)
async def v1_list_tasks(
    status: str | None = None,
    api_key: ApiKey = _scope("tasks:read"),
    db: AsyncSession = Depends(get_db),
):
    query = select(IncidentTask).order_by(IncidentTask.sort_order)
    if status:
        query = query.where(IncidentTask.status == status)
    result = await db.execute(query)
    return result.scalars().all()


@router.get(
    "/audit-logs",
    summary="List audit logs",
    description="Requires scope: audit:read",
)
async def v1_list_audit_logs(
    limit: int = Query(100, ge=1, le=1000),
    api_key: ApiKey = _scope("audit:read"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AuditLog).order_by(desc(AuditLog.created_at)).limit(limit))
    logs = result.scalars().all()
    return [{"id": l.id, "action": l.action, "resource": l.resource, "resource_id": l.resource_id, "created_at": l.created_at.isoformat()} for l in logs]
