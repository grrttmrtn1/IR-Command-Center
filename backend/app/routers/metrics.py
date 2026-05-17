from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, case
from pydantic import BaseModel
from app.database import get_db
from app.models.incident import Incident, IncidentTask, TimelineEvent, TaskStatus, Severity, IncidentStatus
from app.models.audit import AuditLog
from app.models.user import User
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


class SeverityCounts(BaseModel):
    CRITICAL: int = 0
    HIGH: int = 0
    MEDIUM: int = 0
    LOW: int = 0


class StatusCounts(BaseModel):
    OPEN: int = 0
    CONTAINED: int = 0
    ERADICATING: int = 0
    RECOVERING: int = 0
    CLOSED: int = 0


class TaskOwner(BaseModel):
    user_id: str
    name: str
    count: int


class MetricsSummary(BaseModel):
    open_count: int
    critical_count: int
    incidents_by_severity: SeverityCounts
    incidents_by_status: StatusCounts
    task_backlog_by_owner: list[TaskOwner]
    total_tasks_open: int
    mttd_hours: float | None
    mttr_hours: float | None


class ActivityItem(BaseModel):
    type: str
    description: str
    actor: str | None
    occurred_at: datetime


class TrendPoint(BaseModel):
    week: str
    opened: int
    closed: int


class TrendsResponse(BaseModel):
    points: list[TrendPoint]


@router.get("/summary", response_model=MetricsSummary)
async def get_summary(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    ninety_days_ago = now - timedelta(days=90)

    # Open incidents (non-exercise)
    open_q = await db.execute(
        select(Incident).where(
            Incident.status != IncidentStatus.CLOSED,
            Incident.is_exercise == False,
        )
    )
    open_incidents = open_q.scalars().all()

    by_sev: dict[str, int] = {s.value: 0 for s in Severity}
    for inc in open_incidents:
        by_sev[inc.severity.value] += 1

    by_status: dict[str, int] = {s.value: 0 for s in IncidentStatus}
    all_status_q = await db.execute(
        select(Incident.status, func.count(Incident.id))
        .where(Incident.is_exercise == False)
        .group_by(Incident.status)
    )
    for status, count in all_status_q.all():
        by_status[status.value] = count

    # MTTD / MTTR (closed, non-exercise, last 90 days)
    mttd_q = await db.execute(
        select(func.avg(func.extract("epoch", Incident.contained_at - Incident.started_at)))
        .where(
            Incident.is_exercise == False,
            Incident.contained_at.isnot(None),
            Incident.started_at >= ninety_days_ago,
        )
    )
    mttd_seconds = mttd_q.scalar()
    mttd_hours = round(mttd_seconds / 3600, 1) if mttd_seconds else None

    mttr_q = await db.execute(
        select(func.avg(func.extract("epoch", Incident.resolved_at - Incident.started_at)))
        .where(
            Incident.is_exercise == False,
            Incident.resolved_at.isnot(None),
            Incident.started_at >= ninety_days_ago,
        )
    )
    mttr_seconds = mttr_q.scalar()
    mttr_hours = round(mttr_seconds / 3600, 1) if mttr_seconds else None

    # Task backlog by owner
    task_q = await db.execute(
        select(IncidentTask.assignee_id, func.count(IncidentTask.id))
        .where(
            IncidentTask.status != TaskStatus.DONE,
            IncidentTask.assignee_id.isnot(None),
        )
        .group_by(IncidentTask.assignee_id)
        .order_by(func.count(IncidentTask.id).desc())
        .limit(10)
    )
    task_rows = task_q.all()

    total_open_tasks_q = await db.execute(
        select(func.count(IncidentTask.id)).where(IncidentTask.status != TaskStatus.DONE)
    )
    total_tasks_open = total_open_tasks_q.scalar() or 0

    task_by_owner: list[TaskOwner] = []
    for assignee_id, count in task_rows:
        user_q = await db.execute(select(User).where(User.id == assignee_id))
        u = user_q.scalar_one_or_none()
        name = u.name or u.email if u else assignee_id
        task_by_owner.append(TaskOwner(user_id=assignee_id, name=name, count=count))

    return MetricsSummary(
        open_count=len(open_incidents),
        critical_count=by_sev.get("CRITICAL", 0),
        incidents_by_severity=SeverityCounts(**by_sev),
        incidents_by_status=StatusCounts(**by_status),
        task_backlog_by_owner=task_by_owner,
        total_tasks_open=total_tasks_open,
        mttd_hours=mttd_hours,
        mttr_hours=mttr_hours,
    )


@router.get("/activity", response_model=list[ActivityItem])
async def get_activity(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Recent timeline events
    tl_q = await db.execute(
        select(TimelineEvent)
        .order_by(TimelineEvent.occurred_at.desc())
        .limit(20)
    )
    timeline = tl_q.scalars().all()

    items: list[ActivityItem] = []
    for e in timeline:
        items.append(ActivityItem(
            type="timeline",
            description=e.description,
            actor=e.actor,
            occurred_at=e.occurred_at,
        ))

    # Recent audit log entries
    audit_q = await db.execute(
        select(AuditLog)
        .where(AuditLog.user_id.isnot(None))
        .order_by(AuditLog.created_at.desc())
        .limit(20)
    )
    audit_entries = audit_q.scalars().all()

    # Collect user display names
    user_ids = {e.user_id for e in audit_entries if e.user_id}
    users_q = await db.execute(select(User).where(User.id.in_(user_ids)))
    user_map = {u.id: (u.name or u.email) for u in users_q.scalars().all()}

    for e in audit_entries:
        items.append(ActivityItem(
            type="audit",
            description=f"{e.action} {e.resource}" + (f" {e.resource_id[:8]}" if e.resource_id else ""),
            actor=user_map.get(e.user_id) if e.user_id else None,
            occurred_at=e.created_at,
        ))

    items.sort(key=lambda x: x.occurred_at, reverse=True)
    return items[:20]


@router.get("/trends", response_model=TrendsResponse)
async def get_trends(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    points: list[TrendPoint] = []

    for weeks_ago in range(7, -1, -1):
        week_start = now - timedelta(weeks=weeks_ago + 1)
        week_end = now - timedelta(weeks=weeks_ago)

        opened_q = await db.execute(
            select(func.count(Incident.id)).where(
                Incident.is_exercise == False,
                Incident.started_at >= week_start,
                Incident.started_at < week_end,
            )
        )
        opened = opened_q.scalar() or 0

        closed_q = await db.execute(
            select(func.count(Incident.id)).where(
                Incident.is_exercise == False,
                Incident.resolved_at >= week_start,
                Incident.resolved_at < week_end,
            )
        )
        closed = closed_q.scalar() or 0

        points.append(TrendPoint(
            week=week_start.strftime("%b %d"),
            opened=opened,
            closed=closed,
        ))

    return TrendsResponse(points=points)
