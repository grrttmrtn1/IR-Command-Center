# Analytics Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated `/analytics` page with an Operational tab (live SLA tracking, task velocity, workload, incident heat map) and a Strategic tab (MTTD/MTTR trends, volume breakdown, readiness score history, repeat IOCs, post-mortem action item rates). Add readiness score history snapshots. Add SLA threshold configuration.

**Architecture:** Two new DB tables (`readiness_snapshots`, `org_settings`) via Alembic migrations. A new `/api/analytics/` FastAPI router with separate operational and strategic endpoint groups. A new frontend `/analytics` page with two tab views built using Recharts (already installed). SLA thresholds are configured via an `org_settings` table. The existing report scheduling infrastructure (`ReportSchedule`, `scheduler.py`) is already built and needs no changes.

**Tech Stack:** FastAPI, SQLAlchemy 2 async, Alembic, PostgreSQL, Next.js 15 App Router, Recharts, TanStack Query v5, Tailwind CSS

---

### Task 1: Create Migration for `readiness_snapshots` and `org_settings` Tables

**Files:**
- Create: `backend/alembic/versions/0015_add_analytics_tables.py`

- [ ] **Step 1: Create the migration file**

```python
# backend/alembic/versions/0015_add_analytics_tables.py
"""Add readiness_snapshots and org_settings tables

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-30 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "readiness_snapshots",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("total", sa.Integer, nullable=False),
        sa.Column("grade", sa.String(2), nullable=False),
        sa.Column("dimensions_json", JSONB, nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "org_settings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("sla_thresholds", JSONB, nullable=False, server_default="{}"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )


def downgrade():
    op.drop_table("org_settings")
    op.drop_table("readiness_snapshots")
```

- [ ] **Step 2: Run the migration**

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend alembic upgrade head
```

Expected output: `Running upgrade 0014 -> 0015, Add readiness_snapshots and org_settings tables`

- [ ] **Step 3: Verify tables exist**

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend python -c "
from app.database import engine
import asyncio
async def check():
    async with engine.connect() as conn:
        result = await conn.execute(
            __import__('sqlalchemy').text(\"SELECT table_name FROM information_schema.tables WHERE table_name IN ('readiness_snapshots', 'org_settings')\")
        )
        print(list(result))
asyncio.run(check())
"
```

Expected: Two rows showing both table names.

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/0015_add_analytics_tables.py
git commit -m "feat: migration for readiness_snapshots and org_settings tables"
```

---

### Task 2: Create Analytics SQLAlchemy Models

**Files:**
- Create: `backend/app/models/analytics.py`

- [ ] **Step 1: Create the models file**

```python
# backend/app/models/analytics.py
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB
from app.database import Base


class ReadinessSnapshot(Base):
    __tablename__ = "readiness_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    total: Mapped[int] = mapped_column(Integer, nullable=False)
    grade: Mapped[str] = mapped_column(String(2), nullable=False)
    dimensions_json: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OrgSettings(Base):
    __tablename__ = "org_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sla_thresholds: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

The default SLA threshold structure (stored in `sla_thresholds` JSON):
```json
{
  "CRITICAL": { "containment_hours": 4, "resolution_hours": 24 },
  "HIGH":     { "containment_hours": 8, "resolution_hours": 48 },
  "MEDIUM":   { "containment_hours": 24, "resolution_hours": 120 },
  "LOW":      { "containment_hours": 72, "resolution_hours": 240 }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/models/analytics.py
git commit -m "feat: ReadinessSnapshot and OrgSettings SQLAlchemy models"
```

---

### Task 3: Persist Readiness Snapshot on Score Computation

**Files:**
- Modify: `backend/app/routers/readiness.py`

- [ ] **Step 1: Find the readiness score endpoint**

Open `backend/app/routers/readiness.py`. Find the `GET /api/readiness/score` endpoint. It computes the score and returns it. Add snapshot persistence after the score is computed.

- [ ] **Step 2: Add snapshot persistence**

Find the return statement in the score endpoint. Before the `return` statement, add:

```python
    # Persist snapshot for historical tracking (at most one per hour)
    from app.models.analytics import ReadinessSnapshot
    from sqlalchemy import desc as _desc
    import uuid as _uuid

    last_snap = await db.execute(
        select(ReadinessSnapshot).order_by(_desc(ReadinessSnapshot.created_at)).limit(1)
    )
    last_snap = last_snap.scalar_one_or_none()
    now_utc = datetime.now(timezone.utc)
    should_snap = (
        last_snap is None or
        (now_utc - last_snap.created_at.replace(tzinfo=timezone.utc)).total_seconds() > 3600
    )
    if should_snap:
        snap = ReadinessSnapshot(
            id=str(_uuid.uuid4()),
            total=total_score,
            grade=grade,
            dimensions_json=[d.model_dump() for d in dimensions],
        )
        db.add(snap)
        await db.commit()
```

Make sure `datetime` and `timezone` are imported at the top of `readiness.py`:
```python
from datetime import datetime, timezone
```

- [ ] **Step 3: Verify snapshot is created**

Navigate to `/readiness` in the browser (triggers the score endpoint). Then check the DB:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend python -c "
import asyncio
from app.database import AsyncSessionLocal
from app.models.analytics import ReadinessSnapshot
from sqlalchemy import select
async def check():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ReadinessSnapshot).limit(5))
        snaps = result.scalars().all()
        for s in snaps: print(s.id, s.total, s.grade, s.created_at)
asyncio.run(check())
"
```

Expected: At least one snapshot row.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/readiness.py
git commit -m "feat: persist readiness score snapshot on each computation (max 1/hour)"
```

---

### Task 4: Create Analytics Backend Router — Operational Endpoints

**Files:**
- Create: `backend/app/routers/analytics.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create the analytics router with operational endpoints**

```python
# backend/app/routers/analytics.py
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, case, desc
from pydantic import BaseModel
from app.database import get_db
from app.models.incident import Incident, IncidentTask, Severity, IncidentStatus
from app.models.user import User
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ── Org Settings (SLA thresholds) ────────────────────────────────────────────

DEFAULT_SLA = {
    "CRITICAL": {"containment_hours": 4,  "resolution_hours": 24},
    "HIGH":     {"containment_hours": 8,  "resolution_hours": 48},
    "MEDIUM":   {"containment_hours": 24, "resolution_hours": 120},
    "LOW":      {"containment_hours": 72, "resolution_hours": 240},
}


async def _get_sla_thresholds(db: AsyncSession) -> dict:
    from app.models.analytics import OrgSettings
    result = await db.execute(select(OrgSettings).limit(1))
    settings = result.scalar_one_or_none()
    if settings and settings.sla_thresholds:
        return {**DEFAULT_SLA, **settings.sla_thresholds}
    return DEFAULT_SLA


@router.get("/settings")
async def get_org_settings(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.analytics import OrgSettings
    result = await db.execute(select(OrgSettings).limit(1))
    settings = result.scalar_one_or_none()
    return {"sla_thresholds": settings.sla_thresholds if settings else DEFAULT_SLA}


class OrgSettingsUpdate(BaseModel):
    sla_thresholds: dict


@router.patch("/settings")
async def update_org_settings(
    body: OrgSettingsUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.analytics import OrgSettings
    import uuid
    result = await db.execute(select(OrgSettings).limit(1))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = OrgSettings(id=str(uuid.uuid4()), sla_thresholds=body.sla_thresholds)
        db.add(settings)
    else:
        settings.sla_thresholds = body.sla_thresholds
        settings.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Settings updated"}


# ── Operational: SLA Status ───────────────────────────────────────────────────

class IncidentSLAStatus(BaseModel):
    id: str
    title: str
    severity: str
    status: str
    phase: str
    started_at: str
    contained_at: str | None
    containment_sla_hours: float
    resolution_sla_hours: float
    containment_elapsed_hours: float
    resolution_elapsed_hours: float
    containment_breached: bool
    resolution_breached: bool
    containment_pct_used: float
    resolution_pct_used: float


@router.get("/operational/sla", response_model=list[IncidentSLAStatus])
async def get_sla_status(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Incident)
        .where(Incident.status != "CLOSED")
        .where(Incident.is_exercise == False)
        .order_by(Incident.started_at)
    )
    incidents = result.scalars().all()
    thresholds = await _get_sla_thresholds(db)
    now = datetime.now(timezone.utc)
    out = []
    for inc in incidents:
        sev = inc.severity.value if hasattr(inc.severity, "value") else str(inc.severity)
        sla = thresholds.get(sev, DEFAULT_SLA["MEDIUM"])
        started = inc.started_at.replace(tzinfo=timezone.utc)
        containment_elapsed = (now - started).total_seconds() / 3600
        if inc.contained_at:
            containment_elapsed = (inc.contained_at.replace(tzinfo=timezone.utc) - started).total_seconds() / 3600
        resolution_elapsed = (now - started).total_seconds() / 3600

        c_sla = sla["containment_hours"]
        r_sla = sla["resolution_hours"]
        out.append(IncidentSLAStatus(
            id=str(inc.id),
            title=inc.title,
            severity=sev,
            status=inc.status.value if hasattr(inc.status, "value") else str(inc.status),
            phase=inc.phase.value if hasattr(inc.phase, "value") else str(inc.phase),
            started_at=inc.started_at.isoformat(),
            contained_at=inc.contained_at.isoformat() if inc.contained_at else None,
            containment_sla_hours=c_sla,
            resolution_sla_hours=r_sla,
            containment_elapsed_hours=round(containment_elapsed, 1),
            resolution_elapsed_hours=round(resolution_elapsed, 1),
            containment_breached=containment_elapsed > c_sla and not inc.contained_at,
            resolution_breached=resolution_elapsed > r_sla,
            containment_pct_used=round(min(containment_elapsed / c_sla * 100, 100), 1),
            resolution_pct_used=round(min(resolution_elapsed / r_sla * 100, 100), 1),
        ))
    return out


# ── Operational: Task Velocity ────────────────────────────────────────────────

class TaskVelocityPoint(BaseModel):
    date: str
    opened: int
    closed: int


@router.get("/operational/task-velocity", response_model=list[TaskVelocityPoint])
async def get_task_velocity(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    cutoff = datetime.now(timezone.utc) - timedelta(days=14)
    # Tasks opened per day
    opened_q = await db.execute(
        select(
            func.date_trunc("day", IncidentTask.created_at).label("day"),
            func.count().label("count"),
        )
        .where(IncidentTask.created_at >= cutoff)
        .group_by(func.date_trunc("day", IncidentTask.created_at))
        .order_by(func.date_trunc("day", IncidentTask.created_at))
    )
    opened_by_day = {row.day.date().isoformat(): row.count for row in opened_q}

    # Tasks closed per day (using updated_at as proxy for completion date)
    closed_q = await db.execute(
        select(
            func.date_trunc("day", IncidentTask.updated_at).label("day"),
            func.count().label("count"),
        )
        .where(IncidentTask.status == "DONE")
        .where(IncidentTask.updated_at >= cutoff)
        .group_by(func.date_trunc("day", IncidentTask.updated_at))
        .order_by(func.date_trunc("day", IncidentTask.updated_at))
    )
    closed_by_day = {row.day.date().isoformat(): row.count for row in closed_q}

    # Build 14-day series
    points = []
    for i in range(14):
        day = (datetime.now(timezone.utc) - timedelta(days=13 - i)).date().isoformat()
        points.append(TaskVelocityPoint(
            date=day,
            opened=opened_by_day.get(day, 0),
            closed=closed_by_day.get(day, 0),
        ))
    return points


# ── Operational: Responder Workload ──────────────────────────────────────────

class ResponderWorkload(BaseModel):
    user_id: str
    name: str
    open_tasks: int
    overdue_tasks: int
    completed_last_7d: int
    last_activity: str | None


@router.get("/operational/workload", response_model=list[ResponderWorkload])
async def get_workload(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    user_ids_q = await db.execute(
        select(IncidentTask.assignee_id)
        .where(IncidentTask.assignee_id != None)
        .distinct()
    )
    user_ids = [row[0] for row in user_ids_q]
    if not user_ids:
        return []

    users_q = await db.execute(select(User).where(User.id.in_(user_ids)))
    users_map = {u.id: u for u in users_q.scalars().all()}

    result = []
    for uid in user_ids:
        u = users_map.get(uid)
        if not u:
            continue
        tasks_q = await db.execute(
            select(IncidentTask).where(IncidentTask.assignee_id == uid)
        )
        tasks = tasks_q.scalars().all()
        open_tasks = [t for t in tasks if t.status not in ("DONE", "CANCELLED")]
        overdue = [t for t in open_tasks if t.due_at and t.due_at.replace(tzinfo=timezone.utc) < now]
        done_7d = [t for t in tasks if (t.status.value if hasattr(t.status, "value") else t.status) == "DONE" and t.updated_at.replace(tzinfo=timezone.utc) >= week_ago]
        last_act = max((t.updated_at for t in tasks), default=None)
        result.append(ResponderWorkload(
            user_id=uid,
            name=u.name or u.email,
            open_tasks=len(open_tasks),
            overdue_tasks=len(overdue),
            completed_last_7d=len(done_7d),
            last_activity=last_act.isoformat() if last_act else None,
        ))
    return sorted(result, key=lambda x: x.open_tasks, reverse=True)


# ── Operational: Incident Heat Map ───────────────────────────────────────────

class HeatMapCell(BaseModel):
    severity: str
    phase: str
    count: int


@router.get("/operational/heatmap", response_model=list[HeatMapCell])
async def get_heatmap(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(
            Incident.severity,
            Incident.phase,
            func.count().label("count"),
        )
        .where(Incident.status != "CLOSED")
        .where(Incident.is_exercise == False)
        .group_by(Incident.severity, Incident.phase)
    )
    return [
        HeatMapCell(
            severity=row.severity.value if hasattr(row.severity, "value") else str(row.severity),
            phase=row.phase.value if hasattr(row.phase, "value") else str(row.phase),
            count=row.count,
        )
        for row in result
    ]
```

- [ ] **Step 2: Add strategic endpoints to the same file**

Append to `backend/app/routers/analytics.py`:

```python
# ── Strategic: MTTD/MTTR Trends ──────────────────────────────────────────────

class MTTPoint(BaseModel):
    month: str
    mttd_hours: float | None
    mttr_hours: float | None
    incident_count: int


@router.get("/strategic/mtt-trends", response_model=list[MTTPoint])
async def get_mtt_trends(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    cutoff = datetime.now(timezone.utc) - timedelta(days=365)
    result = await db.execute(
        select(
            func.date_trunc("month", Incident.started_at).label("month"),
            func.avg(
                case(
                    (Incident.contained_at != None,
                     func.extract("epoch", Incident.contained_at - Incident.started_at) / 3600),
                    else_=None,
                )
            ).label("avg_mttd"),
            func.avg(
                case(
                    (Incident.resolved_at != None,
                     func.extract("epoch", Incident.resolved_at - Incident.started_at) / 3600),
                    else_=None,
                )
            ).label("avg_mttr"),
            func.count().label("count"),
        )
        .where(Incident.started_at >= cutoff)
        .where(Incident.is_exercise == False)
        .group_by(func.date_trunc("month", Incident.started_at))
        .order_by(func.date_trunc("month", Incident.started_at))
    )
    return [
        MTTPoint(
            month=row.month.strftime("%Y-%m"),
            mttd_hours=round(row.avg_mttd, 1) if row.avg_mttd else None,
            mttr_hours=round(row.avg_mttr, 1) if row.avg_mttr else None,
            incident_count=row.count,
        )
        for row in result
    ]


# ── Strategic: Incident Volume Breakdown ─────────────────────────────────────

class VolumeBreakdown(BaseModel):
    period: str
    by_type: dict
    by_severity: dict
    open_count: int
    closed_count: int


@router.get("/strategic/volume")
async def get_volume_breakdown(
    days: int = 90,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(Incident.incident_type, Incident.severity, Incident.status)
        .where(Incident.started_at >= cutoff)
        .where(Incident.is_exercise == False)
    )
    rows = result.all()
    by_type: dict = {}
    by_sev: dict = {}
    open_c = closed_c = 0
    for row in rows:
        t = row.incident_type.value if hasattr(row.incident_type, "value") else str(row.incident_type)
        s = row.severity.value if hasattr(row.severity, "value") else str(row.severity)
        st = row.status.value if hasattr(row.status, "value") else str(row.status)
        by_type[t] = by_type.get(t, 0) + 1
        by_sev[s] = by_sev.get(s, 0) + 1
        if st == "CLOSED":
            closed_c += 1
        else:
            open_c += 1
    return {"period": f"last_{days}d", "by_type": by_type, "by_severity": by_sev, "open_count": open_c, "closed_count": closed_c}


# ── Strategic: Readiness History ─────────────────────────────────────────────

class ReadinessHistoryPoint(BaseModel):
    date: str
    total: int
    grade: str


@router.get("/strategic/readiness-history", response_model=list[ReadinessHistoryPoint])
async def get_readiness_history(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.analytics import ReadinessSnapshot
    result = await db.execute(
        select(ReadinessSnapshot)
        .order_by(ReadinessSnapshot.created_at)
        .limit(200)
    )
    return [
        ReadinessHistoryPoint(
            date=snap.created_at.strftime("%Y-%m-%d"),
            total=snap.total,
            grade=snap.grade,
        )
        for snap in result.scalars().all()
    ]


# ── Strategic: Repeat IOCs ────────────────────────────────────────────────────

class RepeatIOC(BaseModel):
    value: str
    ioc_type: str
    incident_count: int
    first_seen: str
    last_seen: str


@router.get("/strategic/repeat-iocs", response_model=list[RepeatIOC])
async def get_repeat_iocs(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.incident import IOC
    result = await db.execute(
        select(
            IOC.value,
            IOC.ioc_type,
            func.count(IOC.incident_id.distinct()).label("inc_count"),
            func.min(IOC.created_at).label("first_seen"),
            func.max(IOC.created_at).label("last_seen"),
        )
        .group_by(IOC.value, IOC.ioc_type)
        .having(func.count(IOC.incident_id.distinct()) > 1)
        .order_by(desc(func.count(IOC.incident_id.distinct())))
        .limit(50)
    )
    return [
        RepeatIOC(
            value=row.value,
            ioc_type=row.ioc_type.value if hasattr(row.ioc_type, "value") else str(row.ioc_type),
            incident_count=row.inc_count,
            first_seen=row.first_seen.isoformat(),
            last_seen=row.last_seen.isoformat(),
        )
        for row in result
    ]


# ── Strategic: Post-Mortem Action Item Completion ────────────────────────────

class ActionItemStats(BaseModel):
    total: int
    completed: int
    open: int
    overdue: int
    overdue_items: list[dict]


@router.get("/strategic/action-items", response_model=ActionItemStats)
async def get_action_item_stats(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.postmortem import PostMortemActionItem
    from app.models.postmortem import PostMortem
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(PostMortemActionItem, PostMortem.incident_id)
        .join(PostMortem, PostMortemActionItem.postmortem_id == PostMortem.id)
    )
    rows = result.all()
    total = len(rows)
    completed = sum(1 for row, _ in rows if row.status == "DONE")
    open_items = [(row, inc_id) for row, inc_id in rows if row.status != "DONE"]
    overdue = [(row, inc_id) for row, inc_id in open_items if row.due_at and row.due_at.replace(tzinfo=timezone.utc) < now]
    overdue_out = [
        {
            "id": row.id,
            "title": row.title,
            "owner_name": row.owner_name,
            "due_at": row.due_at.isoformat() if row.due_at else None,
            "days_overdue": (now - row.due_at.replace(tzinfo=timezone.utc)).days if row.due_at else None,
            "priority": row.priority,
            "incident_id": inc_id,
            "postmortem_id": row.postmortem_id,
        }
        for row, inc_id in sorted(overdue, key=lambda x: x[0].due_at or now)[:20]
    ]
    return ActionItemStats(
        total=total,
        completed=completed,
        open=total - completed,
        overdue=len(overdue),
        overdue_items=overdue_out,
    )
```

- [ ] **Step 3: Register the analytics router in main.py**

Open `backend/app/main.py`. Add the import:
```python
from app.routers import analytics
```

Add the router registration after the existing routers:
```python
app.include_router(analytics.router)
```

Also add `{"name": "analytics", "description": "Operational and strategic analytics endpoints"}` to the `openapi_tags` list.

- [ ] **Step 4: Restart and verify all endpoints exist**

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart backend
```

Visit `http://localhost/docs` and verify the following endpoints appear under the `analytics` tag:
- `GET /api/analytics/settings`
- `PATCH /api/analytics/settings`
- `GET /api/analytics/operational/sla`
- `GET /api/analytics/operational/task-velocity`
- `GET /api/analytics/operational/workload`
- `GET /api/analytics/operational/heatmap`
- `GET /api/analytics/strategic/mtt-trends`
- `GET /api/analytics/strategic/volume`
- `GET /api/analytics/strategic/readiness-history`
- `GET /api/analytics/strategic/repeat-iocs`
- `GET /api/analytics/strategic/action-items`

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/analytics.py backend/app/main.py
git commit -m "feat: analytics backend router with operational and strategic endpoints"
```

---

### Task 5: Create Frontend Analytics Types

**Files:**
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Add analytics types**

Append to the end of `frontend/src/lib/types.ts`:

```typescript
// --- Analytics ---

export interface IncidentSLAStatus {
  id: string;
  title: string;
  severity: string;
  status: string;
  phase: string;
  started_at: string;
  contained_at: string | null;
  containment_sla_hours: number;
  resolution_sla_hours: number;
  containment_elapsed_hours: number;
  resolution_elapsed_hours: number;
  containment_breached: boolean;
  resolution_breached: boolean;
  containment_pct_used: number;
  resolution_pct_used: number;
}

export interface TaskVelocityPoint {
  date: string;
  opened: number;
  closed: number;
}

export interface ResponderWorkload {
  user_id: string;
  name: string;
  open_tasks: number;
  overdue_tasks: number;
  completed_last_7d: number;
  last_activity: string | null;
}

export interface HeatMapCell {
  severity: string;
  phase: string;
  count: number;
}

export interface MTTPoint {
  month: string;
  mttd_hours: number | null;
  mttr_hours: number | null;
  incident_count: number;
}

export interface VolumeBreakdown {
  period: string;
  by_type: Record<string, number>;
  by_severity: Record<string, number>;
  open_count: number;
  closed_count: number;
}

export interface ReadinessHistoryPoint {
  date: string;
  total: number;
  grade: string;
}

export interface RepeatIOC {
  value: string;
  ioc_type: string;
  incident_count: number;
  first_seen: string;
  last_seen: string;
}

export interface ActionItemStats {
  total: number;
  completed: number;
  open: number;
  overdue: number;
  overdue_items: Array<{
    id: string;
    title: string;
    owner_name: string | null;
    due_at: string | null;
    days_overdue: number | null;
    priority: string;
    incident_id: string;
    postmortem_id: string;
  }>;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat: analytics TypeScript types"
```

---

### Task 6: Build the Analytics Page — Operational Tab

**Files:**
- Create: `frontend/src/app/(dashboard)/analytics/page.tsx`

- [ ] **Step 1: Create the analytics page with the operational tab**

```tsx
// frontend/src/app/(dashboard)/analytics/page.tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, CartesianGrid,
} from "recharts";
import api from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import type {
  IncidentSLAStatus, TaskVelocityPoint, ResponderWorkload,
  HeatMapCell, MTTPoint, VolumeBreakdown, ReadinessHistoryPoint,
  RepeatIOC, ActionItemStats,
} from "@/lib/types";
import {
  Activity, BarChart3, TrendingUp, AlertTriangle, CheckSquare,
  Clock, Users, Shield, Repeat2, FileText,
} from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const PHASE_ORDER = ["DETECTION", "ANALYSIS", "CONTAINMENT", "ERADICATION", "RECOVERY", "POST_INCIDENT"];
const SEV_COLORS: Record<string, string> = {
  CRITICAL: "#dc2626", HIGH: "#f97316", MEDIUM: "#eab308", LOW: "#3b82f6",
};

function SLABar({ pct, breached }: { pct: number; breached: boolean }) {
  const color = breached ? "bg-red-500" : pct > 75 ? "bg-red-400" : pct > 50 ? "bg-yellow-400" : "bg-emerald-500";
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function OperationalTab() {
  const { data: slaData = [], isLoading: slaLoading } = useQuery<IncidentSLAStatus[]>({
    queryKey: ["analytics-sla"],
    queryFn: () => api.get<IncidentSLAStatus[]>("/analytics/operational/sla").then((r) => r.data),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const { data: velocity = [], isLoading: velLoading } = useQuery<TaskVelocityPoint[]>({
    queryKey: ["analytics-velocity"],
    queryFn: () => api.get<TaskVelocityPoint[]>("/analytics/operational/task-velocity").then((r) => r.data),
    staleTime: 60_000,
  });

  const { data: workload = [], isLoading: workLoading } = useQuery<ResponderWorkload[]>({
    queryKey: ["analytics-workload"],
    queryFn: () => api.get<ResponderWorkload[]>("/analytics/operational/workload").then((r) => r.data),
    staleTime: 60_000,
  });

  const { data: heatmap = [], isLoading: heatLoading } = useQuery<HeatMapCell[]>({
    queryKey: ["analytics-heatmap"],
    queryFn: () => api.get<HeatMapCell[]>("/analytics/operational/heatmap").then((r) => r.data),
    staleTime: 60_000,
  });

  const breachedCount = slaData.filter((i) => i.containment_breached || i.resolution_breached).length;

  return (
    <div className="space-y-6">
      {/* SLA Tracking */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">SLA / SLO Tracking</h2>
          </div>
          {breachedCount > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {breachedCount} breached
            </span>
          )}
        </div>
        {slaLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : slaData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No open incidents</p>
        ) : (
          <div className="space-y-3">
            {slaData.map((inc) => (
              <Link key={inc.id} href={`/incidents/${inc.id}`} className="block rounded-lg border border-border bg-background p-3 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs font-bold ${SEV_COLORS[inc.severity] ? "" : ""}`} style={{ color: SEV_COLORS[inc.severity] }}>
                      {inc.severity}
                    </span>
                    <span className="text-sm font-medium truncate">{inc.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">{inc.phase.replace("_", " ")}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Containment</span>
                      <span className={`text-xs font-medium ${inc.containment_breached ? "text-red-500" : inc.containment_pct_used > 75 ? "text-yellow-500" : "text-emerald-500"}`}>
                        {inc.containment_breached ? "BREACHED" : `${inc.containment_elapsed_hours}h / ${inc.containment_sla_hours}h`}
                      </span>
                    </div>
                    <SLABar pct={inc.containment_pct_used} breached={inc.containment_breached} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Resolution</span>
                      <span className={`text-xs font-medium ${inc.resolution_breached ? "text-red-500" : inc.resolution_pct_used > 75 ? "text-yellow-500" : "text-emerald-500"}`}>
                        {inc.resolution_breached ? "BREACHED" : `${inc.resolution_elapsed_hours}h / ${inc.resolution_sla_hours}h`}
                      </span>
                    </div>
                    <SLABar pct={inc.resolution_pct_used} breached={inc.resolution_breached} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Task Velocity + Workload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Task Velocity */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Task Velocity — Last 14 Days</h2>
          </div>
          {velLoading ? (
            <Skeleton className="h-44 w-full rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={velocity} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                />
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <Bar dataKey="opened" name="Opened" fill="#ef4444" radius={[3, 3, 0, 0]} />
                <Bar dataKey="closed" name="Closed" fill="#22c55e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Responder Workload */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Responder Workload</h2>
          </div>
          {workLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
            </div>
          ) : workload.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No assigned tasks</p>
          ) : (
            <div className="divide-y divide-border">
              <div className="grid grid-cols-4 pb-1 mb-1">
                {["Responder", "Open", "Overdue", "Done 7d"].map((h) => (
                  <p key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</p>
                ))}
              </div>
              {workload.slice(0, 8).map((w) => (
                <div key={w.user_id} className="grid grid-cols-4 py-2 items-center">
                  <p className="text-xs font-medium text-foreground truncate pr-2">{w.name}</p>
                  <p className="text-xs tabular-nums">{w.open_tasks}</p>
                  <p className={`text-xs tabular-nums font-medium ${w.overdue_tasks > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                    {w.overdue_tasks}
                  </p>
                  <p className="text-xs tabular-nums text-emerald-600">{w.completed_last_7d}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Incident Heat Map */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Active Incident Heat Map (Severity × Phase)</h2>
        </div>
        {heatLoading ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left py-1 pr-4 text-muted-foreground font-medium w-24">Severity</th>
                  {PHASE_ORDER.map((p) => (
                    <th key={p} className="text-center py-1 px-2 text-muted-foreground font-medium whitespace-nowrap">
                      {p.replace("_", " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SEVERITY_ORDER.map((sev) => (
                  <tr key={sev}>
                    <td className="py-1.5 pr-4 font-semibold" style={{ color: SEV_COLORS[sev] }}>{sev}</td>
                    {PHASE_ORDER.map((phase) => {
                      const cell = heatmap.find((h) => h.severity === sev && h.phase === phase);
                      const count = cell?.count ?? 0;
                      return (
                        <td key={phase} className="text-center py-1.5 px-2">
                          {count > 0 ? (
                            <Link
                              href={`/incidents?severity=${sev}&phase=${phase}`}
                              className="inline-flex items-center justify-center h-6 w-6 rounded font-bold text-white text-xs cursor-pointer"
                              style={{ backgroundColor: SEV_COLORS[sev] }}
                            >
                              {count}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StrategicTab() {
  const [volumeDays, setVolumeDays] = useState(90);

  const { data: mttTrends = [], isLoading: mttLoading } = useQuery<MTTPoint[]>({
    queryKey: ["analytics-mtt"],
    queryFn: () => api.get<MTTPoint[]>("/analytics/strategic/mtt-trends").then((r) => r.data),
    staleTime: 300_000,
  });

  const { data: volume, isLoading: volLoading } = useQuery<VolumeBreakdown>({
    queryKey: ["analytics-volume", volumeDays],
    queryFn: () => api.get<VolumeBreakdown>(`/analytics/strategic/volume?days=${volumeDays}`).then((r) => r.data),
    staleTime: 300_000,
  });

  const { data: readinessHistory = [], isLoading: rhLoading } = useQuery<ReadinessHistoryPoint[]>({
    queryKey: ["analytics-readiness-history"],
    queryFn: () => api.get<ReadinessHistoryPoint[]>("/analytics/strategic/readiness-history").then((r) => r.data),
    staleTime: 300_000,
  });

  const { data: repeatIOCs = [], isLoading: iocLoading } = useQuery<RepeatIOC[]>({
    queryKey: ["analytics-repeat-iocs"],
    queryFn: () => api.get<RepeatIOC[]>("/analytics/strategic/repeat-iocs").then((r) => r.data),
    staleTime: 300_000,
  });

  const { data: actionItems, isLoading: aiLoading } = useQuery<ActionItemStats>({
    queryKey: ["analytics-action-items"],
    queryFn: () => api.get<ActionItemStats>("/analytics/strategic/action-items").then((r) => r.data),
    staleTime: 300_000,
  });

  const volumeByType = volume
    ? Object.entries(volume.by_type).map(([name, value]) => ({ name: name.replace("_", " "), value }))
    : [];
  const volumeBySev = volume
    ? Object.entries(volume.by_severity).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="space-y-6">
      {/* MTTD / MTTR Trends */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">MTTD / MTTR Trends — Last 12 Months</h2>
        </div>
        {mttLoading ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : mttTrends.length < 2 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Not enough historical data yet. Data accumulates as incidents are resolved.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={mttTrends} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v, name) => [`${v}h`, name]}
                contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: 12 }}
              />
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="mttd_hours" stroke="#f97316" strokeWidth={2} dot={false} name="MTTD" connectNulls />
              <Line type="monotone" dataKey="mttr_hours" stroke="#3b82f6" strokeWidth={2} dot={false} name="MTTR" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Volume Breakdown */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Incident Volume Breakdown</h2>
          </div>
          <select
            value={volumeDays}
            onChange={(e) => setVolumeDays(Number(e.target.value))}
            className="text-xs border border-border rounded px-2 py-1 bg-background"
          >
            <option value={30}>Last 30d</option>
            <option value={90}>Last 90d</option>
            <option value={180}>Last 6mo</option>
            <option value={365}>Last 12mo</option>
          </select>
        </div>
        {volLoading ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium">By Type</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={volumeByType} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                  <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium">By Severity</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={volumeBySev} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={60} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {volumeBySev.map((entry) => (
                      <Cell key={entry.name} fill={SEV_COLORS[entry.name] ?? "#6b7280"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Readiness Score History */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Readiness Score History</h2>
        </div>
        {rhLoading ? (
          <Skeleton className="h-44 w-full rounded-lg" />
        ) : readinessHistory.length < 2 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            History accumulates as the readiness score is computed over time. Visit <a href="/readiness" className="text-primary hover:underline">/readiness</a> to trigger a computation.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={readinessHistory} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
              {/* Grade boundary reference lines */}
              {[{ y: 90, label: "A" }, { y: 75, label: "B" }, { y: 60, label: "C" }, { y: 40, label: "D" }].map(({ y, label }) => (
                <CartesianGrid key={label} horizontal={false} stroke="hsl(var(--border))" strokeDasharray="2 4" />
              ))}
              <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Readiness Score" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Repeat IOCs */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Repeat2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Repeat IOC Detection</h2>
          <span className="text-xs text-muted-foreground">(IOCs seen in 2+ incidents)</span>
        </div>
        {iocLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
          </div>
        ) : repeatIOCs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No repeat IOCs detected across incidents.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["IOC Value", "Type", "Incidents", "First Seen", "Last Seen"].map((h) => (
                    <th key={h} className="text-left py-2 pr-4 text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {repeatIOCs.map((ioc) => (
                  <tr key={ioc.value + ioc.ioc_type} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-4 font-mono text-foreground max-w-xs truncate">{ioc.value}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{ioc.ioc_type.replace("_", " ")}</td>
                    <td className="py-2 pr-4 font-bold text-red-500">{ioc.incident_count}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{new Date(ioc.first_seen).toLocaleDateString()}</td>
                    <td className="py-2 text-muted-foreground">{timeAgo(ioc.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Post-Mortem Action Item Completion */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Post-Mortem Action Item Completion</h2>
        </div>
        {aiLoading ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : !actionItems || actionItems.total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No post-mortem action items yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Total", value: actionItems.total, color: "text-foreground" },
                { label: "Completed", value: actionItems.completed, color: "text-emerald-600" },
                { label: "Open", value: actionItems.open, color: "text-blue-600" },
                { label: "Overdue", value: actionItems.overdue, color: actionItems.overdue > 0 ? "text-red-500 font-bold" : "text-muted-foreground" },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center rounded-lg border border-border p-3">
                  <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            {actionItems.overdue_items.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Overdue Items</p>
                <div className="space-y-1.5">
                  {actionItems.overdue_items.map((item) => (
                    <Link
                      key={item.id}
                      href={`/incidents/${item.incident_id}/postmortem`}
                      className="flex items-center gap-3 rounded-lg border border-border bg-red-50/50 dark:bg-red-950/20 p-2.5 hover:bg-red-100/50 dark:hover:bg-red-950/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {item.owner_name && <span>{item.owner_name} · </span>}
                          {item.days_overdue !== null && (
                            <span className="text-red-500 font-medium">{item.days_overdue}d overdue</span>
                          )}
                        </p>
                      </div>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        item.priority === "CRITICAL" ? "bg-red-100 text-red-700" :
                        item.priority === "HIGH" ? "bg-orange-100 text-orange-700" :
                        "bg-muted text-muted-foreground"
                      }`}>{item.priority}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<"operational" | "strategic">("operational");

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Operational visibility and strategic intelligence for your IR program
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-border">
        {(["operational", "strategic"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {t === "operational" ? (
              <span className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> Operational</span>
            ) : (
              <span className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Strategic</span>
            )}
          </button>
        ))}
      </div>

      {tab === "operational" ? <OperationalTab /> : <StrategicTab />}
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders**

Navigate to `http://localhost/analytics` — the page should render with both tabs. The Operational tab should show SLA tracking (empty if no open incidents), task velocity chart, workload table, and heat map.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(dashboard\)/analytics/page.tsx
git commit -m "feat: analytics page with operational and strategic tabs"
```

---

### Task 7: Add Analytics to Sidebar Navigation

**Files:**
- Modify: `frontend/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add Analytics to the Response nav section**

Open `frontend/src/components/layout/sidebar.tsx`. Find the `navSections` array. Find the `Response` section:

```tsx
{
  label: "Response",
  items: [
    { href: "/scorecard", label: "IR Scorecard", icon: BarChart3, minRole: "OBSERVER" },
    { href: "/communications", label: "Crisis Comms", icon: MessageSquare, minRole: "ANALYST" },
    { href: "/ransomware", label: "Ransomware Decision", icon: Brain, minRole: "ANALYST" },
    { href: "/documents", label: "Documents", icon: FileText, minRole: "OBSERVER" },
  ],
},
```

Add Analytics as the second item (after IR Scorecard):
```tsx
{
  label: "Response",
  items: [
    { href: "/scorecard", label: "IR Scorecard", icon: BarChart3, minRole: "OBSERVER" },
    { href: "/analytics", label: "Analytics", icon: TrendingUp, minRole: "OBSERVER" },
    { href: "/communications", label: "Crisis Comms", icon: MessageSquare, minRole: "ANALYST" },
    { href: "/ransomware", label: "Ransomware Decision", icon: Brain, minRole: "ANALYST" },
    { href: "/documents", label: "Documents", icon: FileText, minRole: "OBSERVER" },
  ],
},
```

`TrendingUp` is already imported in the sidebar (`import { ..., TrendingUp, ... } from "lucide-react"`). Verify it's in the import list; if not, add it.

- [ ] **Step 2: Verify in browser**

The sidebar should now show "Analytics" under the Response section with a trending-up icon. Clicking it navigates to `/analytics`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/sidebar.tsx
git commit -m "feat: add Analytics to sidebar navigation"
```

---

### Task 8: Add SLA Thresholds Configuration UI to Analytics

**Files:**
- Modify: `frontend/src/app/(dashboard)/analytics/page.tsx`

- [ ] **Step 1: Add SLA settings panel to the Operational tab**

Add a collapsible SLA configuration panel at the top of the `OperationalTab` component. This allows IR leads to adjust the thresholds without going to the admin panel.

Add state and query at the top of `OperationalTab`:
```tsx
const [showSLAConfig, setShowSLAConfig] = useState(false);
const qc = useQueryClient();

const { data: orgSettings } = useQuery({
  queryKey: ["analytics-settings"],
  queryFn: () => api.get<{ sla_thresholds: Record<string, { containment_hours: number; resolution_hours: number }> }>("/analytics/settings").then((r) => r.data),
  staleTime: 300_000,
});

const [slaEdits, setSlaEdits] = useState<Record<string, { containment_hours: number; resolution_hours: number }>>({});

const saveSLAMutation = useMutation({
  mutationFn: (thresholds: typeof slaEdits) => api.patch("/analytics/settings", { sla_thresholds: thresholds }),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ["analytics-settings"] });
    qc.invalidateQueries({ queryKey: ["analytics-sla"] });
    setShowSLAConfig(false);
    toast.success("SLA thresholds updated");
  },
  onError: () => toast.error("Failed to update SLA thresholds"),
});
```

Add the SLA config toggle button after the `<div>` containing the SLA title and breach count badge. Below the SLA incident list, add:

```tsx
<div className="mt-3 pt-3 border-t border-border">
  <button
    onClick={() => {
      if (!showSLAConfig) {
        setSlaEdits(orgSettings?.sla_thresholds ?? {
          CRITICAL: { containment_hours: 4, resolution_hours: 24 },
          HIGH:     { containment_hours: 8, resolution_hours: 48 },
          MEDIUM:   { containment_hours: 24, resolution_hours: 120 },
          LOW:      { containment_hours: 72, resolution_hours: 240 },
        });
      }
      setShowSLAConfig((s) => !s);
    }}
    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
  >
    Configure SLA thresholds {showSLAConfig ? "▲" : "▼"}
  </button>
  {showSLAConfig && (
    <div className="mt-3 space-y-3">
      {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((sev) => {
        const vals = slaEdits[sev] ?? { containment_hours: 0, resolution_hours: 0 };
        return (
          <div key={sev} className="flex items-center gap-4">
            <span className="text-xs font-bold w-16" style={{ color: SEV_COLORS[sev] }}>{sev}</span>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Contain within
              <input
                type="number"
                value={vals.containment_hours}
                onChange={(e) => setSlaEdits((prev) => ({ ...prev, [sev]: { ...prev[sev], containment_hours: Number(e.target.value) } }))}
                className="w-14 px-2 py-1 border border-border rounded text-xs bg-background"
                min={1}
              />
              h
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Resolve within
              <input
                type="number"
                value={vals.resolution_hours}
                onChange={(e) => setSlaEdits((prev) => ({ ...prev, [sev]: { ...prev[sev], resolution_hours: Number(e.target.value) } }))}
                className="w-14 px-2 py-1 border border-border rounded text-xs bg-background"
                min={1}
              />
              h
            </label>
          </div>
        );
      })}
      <div className="flex gap-2">
        <button
          onClick={() => saveSLAMutation.mutate(slaEdits)}
          disabled={saveSLAMutation.isPending}
          className="px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded-lg disabled:opacity-50"
        >
          Save
        </button>
        <button onClick={() => setShowSLAConfig(false)} className="px-3 py-1.5 border border-border text-xs rounded-lg">
          Cancel
        </button>
      </div>
    </div>
  )}
</div>
```

Also add imports at the top of the file: `import { useMutation, useQueryClient } from "@tanstack/react-query";` and `import { toast } from "sonner";`.

- [ ] **Step 2: Verify in browser**

In the Operational tab, click "Configure SLA thresholds" below the SLA section. Edit a threshold and save. The SLA progress bars should update on the next data refresh.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(dashboard\)/analytics/page.tsx
git commit -m "feat: SLA threshold configuration in analytics operational tab"
```
