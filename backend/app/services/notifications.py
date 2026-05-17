import json
import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.notification import Notification, NotificationType
from app.services.redis_client import get_redis


async def publish_notification(
    db: AsyncSession,
    user_id: str,
    type_: NotificationType,
    title: str,
    body: str | None = None,
    incident_id: str | None = None,
) -> None:
    notif = Notification(
        id=str(uuid.uuid4()),
        user_id=user_id,
        type=type_,
        title=title,
        body=body,
        incident_id=incident_id,
    )
    db.add(notif)
    await db.flush()

    redis = await get_redis()
    payload = {
        "id": notif.id,
        "type": type_.value,
        "title": title,
        "body": body,
        "incident_id": incident_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await redis.publish(f"notifications:{user_id}", json.dumps(payload))


async def publish_notification_to_all(
    db: AsyncSession,
    user_ids: list[str],
    type_: NotificationType,
    title: str,
    body: str | None = None,
    incident_id: str | None = None,
) -> None:
    for user_id in user_ids:
        await publish_notification(db, user_id, type_, title, body, incident_id)
