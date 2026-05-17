from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import AsyncSessionLocal
from app.models.audit import AuditLog

SKIP_PATHS = {"/api/auth/me", "/api/auth/refresh", "/docs", "/redoc", "/openapi.json"}
READ_METHODS = {"GET", "HEAD", "OPTIONS"}


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        path = request.url.path
        method = request.method

        if method in READ_METHODS or path in SKIP_PATHS or not path.startswith("/api/"):
            return response

        if response.status_code >= 400:
            return response

        user_id = None
        api_key_id = None

        if hasattr(request.state, "user"):
            user_id = request.state.user.id
        if hasattr(request.state, "api_key"):
            api_key_id = request.state.api_key.id

        parts = path.strip("/").split("/")
        resource = parts[1] if len(parts) > 1 else path
        resource_id = parts[2] if len(parts) > 2 else None

        action_map = {"POST": "create", "PATCH": "update", "PUT": "update", "DELETE": "delete"}
        action = action_map.get(method, method.lower())

        async with AsyncSessionLocal() as db:
            log = AuditLog(
                user_id=user_id,
                api_key_id=api_key_id,
                action=f"{action}:{resource}",
                resource=resource,
                resource_id=resource_id,
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
            )
            db.add(log)
            await db.commit()

        return response
