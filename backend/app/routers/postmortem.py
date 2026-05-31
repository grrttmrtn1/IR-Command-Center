import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models.postmortem import PostMortem, PostMortemActionItem
from app.models.incident import Incident
from app.models.user import User, UserRole
from app.middleware.auth import get_current_user, require_role

router = APIRouter(prefix="/api/incidents", tags=["postmortem"])


class FiveWhy(BaseModel):
    why: str
    answer: str


class PostMortemUpsert(BaseModel):
    summary: str | None = None
    impact: str | None = None
    timeline_notes: str | None = None
    what_went_well: str | None = None
    what_went_poorly: str | None = None
    root_cause: str | None = None
    five_whys: list[FiveWhy] | None = None
    lessons_learned: str | None = None


class ActionItemCreate(BaseModel):
    title: str
    description: str | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    due_at: datetime | None = None
    priority: str = "MEDIUM"


class ActionItemUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    due_at: datetime | None = None
    priority: str | None = None
    status: str | None = None


def _pm_out(pm: PostMortem, items: list[PostMortemActionItem]) -> dict:
    return {
        "id": pm.id,
        "incident_id": pm.incident_id,
        "summary": pm.summary,
        "impact": pm.impact,
        "timeline_notes": pm.timeline_notes,
        "what_went_well": pm.what_went_well,
        "what_went_poorly": pm.what_went_poorly,
        "root_cause": pm.root_cause,
        "five_whys": pm.five_whys or [],
        "lessons_learned": pm.lessons_learned,
        "ai_generated": pm.ai_generated,
        "created_by": pm.created_by,
        "created_at": pm.created_at.isoformat(),
        "updated_at": pm.updated_at.isoformat(),
        "action_items": [_item_out(i) for i in items],
    }


def _item_out(item: PostMortemActionItem) -> dict:
    return {
        "id": item.id,
        "postmortem_id": item.postmortem_id,
        "title": item.title,
        "description": item.description,
        "owner_id": item.owner_id,
        "owner_name": item.owner_name,
        "due_at": item.due_at.isoformat() if item.due_at else None,
        "priority": item.priority,
        "status": item.status,
        "created_at": item.created_at.isoformat(),
        "updated_at": item.updated_at.isoformat(),
    }


async def _get_pm(incident_id: str, db: AsyncSession) -> PostMortem | None:
    result = await db.execute(
        select(PostMortem)
        .options(selectinload(PostMortem.action_items))
        .where(PostMortem.incident_id == incident_id)
    )
    return result.scalar_one_or_none()


@router.get("/{incident_id}/postmortem")
async def get_postmortem(
    incident_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pm = await _get_pm(incident_id, db)
    if not pm:
        raise HTTPException(status_code=404, detail="No post-mortem found")
    return _pm_out(pm, pm.action_items)


@router.put("/{incident_id}/postmortem")
async def upsert_postmortem(
    incident_id: str,
    body: PostMortemUpsert,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    inc_result = await db.execute(select(Incident).where(Incident.id == incident_id))
    if not inc_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Incident not found")

    pm = await _get_pm(incident_id, db)
    if not pm:
        pm = PostMortem(id=str(uuid.uuid4()), incident_id=incident_id, created_by=user.id)
        db.add(pm)

    for field, value in body.model_dump(exclude_none=True).items():
        if field == "five_whys":
            setattr(pm, field, [w if isinstance(w, dict) else w.model_dump() for w in value])
        else:
            setattr(pm, field, value)

    pm.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(pm)

    pm_fresh = await _get_pm(incident_id, db)
    return _pm_out(pm_fresh, pm_fresh.action_items)


@router.post("/{incident_id}/postmortem/action-items")
async def add_action_item(
    incident_id: str,
    body: ActionItemCreate,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    pm = await _get_pm(incident_id, db)
    if not pm:
        raise HTTPException(status_code=404, detail="Post-mortem not found")

    item = PostMortemActionItem(
        id=str(uuid.uuid4()),
        postmortem_id=pm.id,
        **body.model_dump(),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _item_out(item)


@router.patch("/{incident_id}/postmortem/action-items/{item_id}")
async def update_action_item(
    incident_id: str,
    item_id: str,
    body: ActionItemUpdate,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(PostMortemActionItem).where(PostMortemActionItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    item.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(item)
    return _item_out(item)


@router.delete("/{incident_id}/postmortem/action-items/{item_id}", status_code=204)
async def delete_action_item(
    incident_id: str,
    item_id: str,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(PostMortemActionItem).where(PostMortemActionItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")
    await db.delete(item)
    await db.commit()
