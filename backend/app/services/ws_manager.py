import json
from fastapi import WebSocket
from app.services.redis_client import get_redis


class IncidentWSManager:
    def __init__(self) -> None:
        self.connections: dict[str, list[WebSocket]] = {}

    async def connect(self, incident_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.setdefault(incident_id, []).append(websocket)

    def disconnect(self, incident_id: str, websocket: WebSocket) -> None:
        conns = self.connections.get(incident_id, [])
        if websocket in conns:
            conns.remove(websocket)
        if not conns:
            self.connections.pop(incident_id, None)

    async def broadcast(self, incident_id: str, message: dict) -> None:
        dead = []
        for ws in self.connections.get(incident_id, []):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(incident_id, ws)


manager = IncidentWSManager()


async def publish_incident_event(incident_id: str, event: dict) -> None:
    redis = await get_redis()
    await redis.publish(f"incident:{incident_id}:events", json.dumps(event))
