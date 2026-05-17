import csv
import io
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, outerjoin
from datetime import datetime
from app.database import get_db
from app.models.audit import AuditLog
from app.models.user import User, UserRole
from app.middleware.auth import require_role

router = APIRouter(prefix="/api/audit-logs", tags=["audit"])

AI_RESOURCES = {"ai", "exec-brief", "generate-tasks", "analyze-ioc", "gap-analysis"}


def _is_ai_action(action: str, resource: str) -> bool:
    return resource in AI_RESOURCES or "ai" in action or "exec-brief" in action or "brief" in action


async def _fetch_logs_with_actors(db: AsyncSession, query, limit: int | None = None, skip: int = 0):
    if limit:
        query = query.offset(skip).limit(limit)
    else:
        query = query.offset(skip)
    result = await db.execute(query)
    logs = result.scalars().all()

    # Resolve user display names in bulk
    user_ids = {l.user_id for l in logs if l.user_id}
    user_map: dict[str, str] = {}
    if user_ids:
        u_result = await db.execute(select(User).where(User.id.in_(user_ids)))
        for u in u_result.scalars().all():
            user_map[u.id] = u.name or u.email

    return logs, user_map


def _serialize_log(log, user_map: dict[str, str]) -> dict:
    actor_display = None
    if log.user_id:
        actor_display = user_map.get(log.user_id, log.user_id[:8] + "…")
    elif log.api_key_id:
        actor_display = f"API Key ({log.api_key_id[:8]}…)"
    return {
        "id": log.id,
        "user_id": log.user_id,
        "api_key_id": log.api_key_id,
        "actor_display": actor_display,
        "action": log.action,
        "resource": log.resource,
        "resource_id": log.resource_id,
        "details": log.details,
        "ip_address": log.ip_address,
        "user_agent": log.user_agent,
        "created_at": log.created_at.isoformat(),
        "is_ai_action": _is_ai_action(log.action, log.resource),
    }


@router.get("")
async def list_audit_logs(
    user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    action: str | None = None,
    resource: str | None = None,
    user_id: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    ai_only: bool = False,
):
    from sqlalchemy import func as sqlfunc
    filters = []
    if action:
        filters.append(AuditLog.action.ilike(f"%{action}%"))
    if resource:
        filters.append(AuditLog.resource == resource)
    if user_id:
        filters.append(AuditLog.user_id == user_id)
    if since:
        filters.append(AuditLog.created_at >= since)
    if until:
        filters.append(AuditLog.created_at <= until)
    if ai_only:
        from sqlalchemy import or_
        filters.append(or_(
            AuditLog.resource.in_(list(AI_RESOURCES)),
            AuditLog.action.ilike("%ai%"),
            AuditLog.action.ilike("%brief%"),
        ))

    base_query = select(AuditLog)
    count_query = select(sqlfunc.count()).select_from(AuditLog)
    if filters:
        base_query = base_query.where(and_(*filters))
        count_query = count_query.where(and_(*filters))

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    base_query = base_query.order_by(AuditLog.created_at.desc())
    logs, user_map = await _fetch_logs_with_actors(db, base_query, limit=limit, skip=skip)

    return {
        "total": total,
        "items": [_serialize_log(l, user_map) for l in logs],
    }


@router.get("/export")
async def export_audit_logs(
    user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
    format: str = Query("csv", pattern="^(csv|json)$"),
    since: datetime | None = None,
    until: datetime | None = None,
):
    query = select(AuditLog).order_by(AuditLog.created_at.desc())
    if since:
        query = query.where(AuditLog.created_at >= since)
    if until:
        query = query.where(AuditLog.created_at <= until)

    logs, user_map = await _fetch_logs_with_actors(db, query)

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["id", "actor", "user_id", "api_key_id", "action", "resource", "resource_id", "ip_address", "created_at"])
        for l in logs:
            actor = user_map.get(l.user_id, "") if l.user_id else ("API Key" if l.api_key_id else "System")
            writer.writerow([l.id, actor, l.user_id, l.api_key_id, l.action, l.resource, l.resource_id, l.ip_address, l.created_at.isoformat()])
        return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=audit_log.csv"})

    import json
    data = [_serialize_log(l, user_map) for l in logs]
    return Response(content=json.dumps(data), media_type="application/json", headers={"Content-Disposition": "attachment; filename=audit_log.json"})
