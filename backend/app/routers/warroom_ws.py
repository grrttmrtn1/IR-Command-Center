import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError
from app.auth.jwt import decode_access_token
from app.services.ws_manager import manager
from app.services.redis_client import get_redis

router = APIRouter(tags=["warroom-ws"])


@router.websocket("/api/incidents/{incident_id}/ws")
async def warroom_websocket(incident_id: str, websocket: WebSocket):
    # Auth: get token from cookie or query param
    token = (
        websocket.cookies.get("access_token")
        or websocket.query_params.get("token")
    )
    if not token:
        await websocket.close(code=4001)
        return

    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=4001)
            return
    except JWTError:
        await websocket.close(code=4001)
        return

    await manager.connect(incident_id, websocket)
    redis = await get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(f"incident:{incident_id}:events")

    async def redis_listener():
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg and msg.get("type") == "message":
                try:
                    data = json.loads(msg["data"])
                    await manager.broadcast(incident_id, data)
                except Exception:
                    pass
            await asyncio.sleep(0.1)

    listener_task = asyncio.create_task(redis_listener())

    try:
        while True:
            # Keep connection alive; client can send pings
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        listener_task.cancel()
        manager.disconnect(incident_id, websocket)
        await pubsub.unsubscribe(f"incident:{incident_id}:events")
        await pubsub.aclose()
