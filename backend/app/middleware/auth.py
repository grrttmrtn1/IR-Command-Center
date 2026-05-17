from datetime import datetime, timezone
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.auth.jwt import decode_access_token, hash_api_key
from app.database import get_db
from app.models.user import User, ApiKey, UserRole

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = None

    # Try Authorization header first
    if credentials:
        token = credentials.credentials

    # Fall back to cookie
    if not token:
        token = request.cookies.get("access_token")

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    request.state.user = user
    return user


async def get_api_key_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> ApiKey:
    """For external v1 API: validates API key (expiration + active flag). Returns ApiKey."""
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key required")

    key_hash = hash_api_key(credentials.credentials)
    result = await db.execute(
        select(ApiKey).where(ApiKey.key_hash == key_hash, ApiKey.is_active == True)
    )
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")

    if api_key.expires_at and api_key.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key expired")

    api_key.last_used_at = datetime.now(timezone.utc)
    await db.commit()

    request.state.api_key = api_key
    return api_key


def require_role(*roles: UserRole):
    async def checker(user: User = Depends(get_current_user)) -> User:
        role_order = [UserRole.OBSERVER, UserRole.ANALYST, UserRole.IR_LEAD, UserRole.ADMIN, UserRole.SUPER_ADMIN]
        min_role = min(roles, key=lambda r: role_order.index(r))
        if role_order.index(user.role) < role_order.index(min_role):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user
    return checker


def require_api_scope(scope: str):
    async def checker(api_key: ApiKey = Depends(get_api_key_user)) -> ApiKey:
        if scope not in api_key.scopes_list:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing scope: {scope}")
        return api_key
    return checker
