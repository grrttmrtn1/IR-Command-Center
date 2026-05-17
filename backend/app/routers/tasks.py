from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.incident import IncidentTask, TaskStatus
from app.models.user import User, UserRole
from app.schemas.incident import TaskCreate, TaskUpdate, TaskResponse, TaskMoveRequest
from app.middleware.auth import get_current_user, require_role

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskResponse])
async def list_org_tasks(
    status: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(IncidentTask).where(IncidentTask.incident_id == None)
    if status:
        query = query.where(IncidentTask.status == status)
    query = query.order_by(IncidentTask.sort_order)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=TaskResponse, status_code=201)
async def create_org_task(
    body: TaskCreate,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    task = IncidentTask(**body.model_dump(), incident_id=None, created_by=user.id)
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: str,
    body: TaskUpdate,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(IncidentTask).where(IncidentTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(task, field, value)
    await db.commit()
    await db.refresh(task)
    return task


@router.patch("/{task_id}/move", response_model=TaskResponse)
async def move_task(
    task_id: str,
    body: TaskMoveRequest,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(IncidentTask).where(IncidentTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.status = body.status
    task.sort_order = body.sort_order
    await db.commit()
    await db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: str,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(IncidentTask).where(IncidentTask.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.delete(task)
    await db.commit()
