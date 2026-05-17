import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models.chat import IncidentChatMessage
from app.models.incident import Incident
from app.models.user import User, UserRole
from app.middleware.auth import get_current_user, require_role
from app.services.ws_manager import publish_incident_event

router = APIRouter(prefix="/api/incidents", tags=["chat"])


class ChatMessageCreate(BaseModel):
    message: str


class ChatMessageResponse(BaseModel):
    id: str
    incident_id: str
    author_id: str
    author_name: str
    author_initials: str
    message: str
    created_at: datetime

    class Config:
        from_attributes = True


def _make_response(msg: IncidentChatMessage) -> ChatMessageResponse:
    author = msg.author
    name = author.name or author.email if author else msg.author_id
    initials = "".join(p[0].upper() for p in (name or "?").split()[:2]) or "?"
    return ChatMessageResponse(
        id=msg.id,
        incident_id=msg.incident_id,
        author_id=msg.author_id,
        author_name=name,
        author_initials=initials,
        message=msg.message,
        created_at=msg.created_at,
    )


@router.get("/{incident_id}/chat", response_model=list[ChatMessageResponse])
async def list_chat(
    incident_id: str,
    before_id: str | None = None,
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(IncidentChatMessage).where(IncidentChatMessage.incident_id == incident_id)
    if before_id:
        ref = (await db.execute(
            select(IncidentChatMessage.created_at).where(IncidentChatMessage.id == before_id)
        )).scalar_one_or_none()
        if ref:
            q = q.where(IncidentChatMessage.created_at < ref)
    q = q.order_by(IncidentChatMessage.created_at.asc()).limit(limit)
    rows = (await db.execute(q)).scalars().all()
    return [_make_response(m) for m in rows]


@router.post("/{incident_id}/chat", response_model=ChatMessageResponse)
async def post_chat(
    incident_id: str,
    body: ChatMessageCreate,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    inc = (await db.execute(select(Incident).where(Incident.id == incident_id))).scalar_one_or_none()
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    msg = IncidentChatMessage(
        id=str(uuid.uuid4()),
        incident_id=incident_id,
        author_id=user.id,
        message=body.message.strip(),
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    resp = _make_response(msg)

    await publish_incident_event(incident_id, {
        "type": "chat_message",
        "data": resp.model_dump(mode="json"),
    })

    return resp


@router.delete("/{incident_id}/chat/{message_id}")
async def delete_chat(
    incident_id: str,
    message_id: str,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    msg = (await db.execute(
        select(IncidentChatMessage).where(
            IncidentChatMessage.id == message_id,
            IncidentChatMessage.incident_id == incident_id,
        )
    )).scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    role_order = [UserRole.OBSERVER, UserRole.ANALYST, UserRole.IR_LEAD, UserRole.ADMIN, UserRole.SUPER_ADMIN]
    is_admin = role_order.index(user.role) >= role_order.index(UserRole.ADMIN)
    if msg.author_id != user.id and not is_admin:
        raise HTTPException(status_code=403, detail="Cannot delete another user's message")

    await db.delete(msg)
    await db.commit()
    return {"ok": True}
