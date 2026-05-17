import asyncio
import os
import urllib.parse
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from passlib.context import CryptContext
from app.database import get_db
from app.models.user import User, ApiKey, SSOConfig, UserRole
from app.schemas.admin import (
    UserCreate, UserAdminUpdate,
    ApiKeyCreate, ApiKeyResponse, ApiKeyCreatedResponse,
    SSOConfigCreate, SSOConfigResponse,
)
from app.schemas.auth import UserResponse
from app.middleware.auth import require_role
from app.auth.jwt import generate_api_key
from app.auth.encryption import encrypt, decrypt

router = APIRouter(prefix="/api/admin", tags=["admin"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.get("/users", response_model=list[UserResponse])
async def list_users(user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.email))
    return result.scalars().all()


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(body: UserCreate, user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")
    new_user = User(
        email=body.email,
        name=body.name,
        password_hash=pwd_context.hash(body.password),
        role=body.role,
        must_change_password=True,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, body: UserAdminUpdate, user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    # Protect super admin from demotion by non-super-admin
    if target.role == UserRole.SUPER_ADMIN and user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Cannot modify super admin")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(target, field, value)
    await db.commit()
    await db.refresh(target)
    return target


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: str, user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    if user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Cannot delete super admin")
    await db.delete(target)
    await db.commit()


# --- API Keys ---

@router.get("/api-keys", response_model=list[ApiKeyResponse])
async def list_api_keys(user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ApiKey).order_by(ApiKey.created_at.desc()))
    keys = result.scalars().all()
    return [ApiKeyResponse.from_orm_model(k) for k in keys]


@router.post("/api-keys", response_model=ApiKeyCreatedResponse, status_code=201)
async def create_api_key(body: ApiKeyCreate, user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    plaintext, key_hash, key_prefix = generate_api_key()
    api_key = ApiKey(
        name=body.name,
        key_hash=key_hash,
        key_prefix=key_prefix,
        scopes=",".join(body.scopes),
        expires_at=body.expires_at,
        created_by=user.id,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)
    base = ApiKeyResponse.from_orm_model(api_key)
    return ApiKeyCreatedResponse(**base.model_dump(), plaintext_key=plaintext)


@router.delete("/api-keys/{key_id}", status_code=204)
async def revoke_api_key(key_id: str, user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")
    key.is_active = False
    await db.commit()


# --- SSO Configs ---

@router.get("/sso-configs", response_model=list[SSOConfigResponse])
async def list_sso_configs(user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SSOConfig).order_by(SSOConfig.created_at))
    return result.scalars().all()


@router.post("/sso-configs", response_model=SSOConfigResponse, status_code=201)
async def create_sso_config(body: SSOConfigCreate, user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    if body.type not in ("SAML", "OIDC"):
        raise HTTPException(status_code=400, detail="type must be SAML or OIDC")
    import json
    config = SSOConfig(
        type=body.type,
        name=body.name,
        is_active=body.is_active,
        config_encrypted=encrypt(json.dumps(body.to_config_dict())),
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return config


@router.patch("/sso-configs/{config_id}", response_model=SSOConfigResponse)
async def update_sso_config(config_id: str, body: SSOConfigCreate, user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SSOConfig).where(SSOConfig.id == config_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="SSO config not found")
    import json
    config.name = body.name
    config.is_active = body.is_active
    config.config_encrypted = encrypt(json.dumps(body.to_config_dict()))
    await db.commit()
    await db.refresh(config)
    return config


@router.patch("/sso-configs/{config_id}/toggle", response_model=SSOConfigResponse)
async def toggle_sso_config(config_id: str, user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SSOConfig).where(SSOConfig.id == config_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="SSO config not found")
    config.is_active = not config.is_active
    await db.commit()
    await db.refresh(config)
    return config


@router.delete("/sso-configs/{config_id}", status_code=204)
async def delete_sso_config(config_id: str, user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SSOConfig).where(SSOConfig.id == config_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="SSO config not found")
    await db.delete(config)
    await db.commit()


# --- Database Backup ---

def _parse_db_url(db_url: str) -> dict[str, str]:
    """Extract pg_dump connection parameters from the SQLAlchemy URL."""
    url = db_url.replace("postgresql+asyncpg://", "postgresql://")
    parsed = urllib.parse.urlparse(url)
    params: dict[str, str] = {}
    if parsed.hostname:
        params["host"] = parsed.hostname
    if parsed.port:
        params["port"] = str(parsed.port)
    if parsed.username:
        params["user"] = urllib.parse.unquote(parsed.username)
    if parsed.password:
        params["password"] = urllib.parse.unquote(parsed.password)
    # db name: strip leading /
    params["dbname"] = parsed.path.lstrip("/")
    return params


@router.get("/backup/download")
async def download_backup(user: User = Depends(require_role(UserRole.SUPER_ADMIN)), db: AsyncSession = Depends(get_db)):
    """Stream a pg_dump of the database as a downloadable SQL file. SUPER_ADMIN only."""
    from app.config import settings
    from datetime import datetime, timezone
    from app.models.audit import AuditLog
    audit_entry = AuditLog(user_id=user.id, action="backup:download", resource="database", resource_id="*")
    db.add(audit_entry)
    await db.commit()

    params = _parse_db_url(settings.database_url)

    env = {"PGPASSWORD": params.get("password", "")}
    cmd = [
        "pg_dump",
        "-h", params.get("host", "localhost"),
        "-p", params.get("port", "5432"),
        "-U", params.get("user", "postgres"),
        "-d", params["dbname"],
        "--no-password",
        "--format=plain",
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, **env},
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="pg_dump not found on server")
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="pg_dump timed out")

    if proc.returncode != 0:
        raise HTTPException(status_code=500, detail=f"pg_dump failed: {stderr.decode()[:500]}")

    now = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    filename = f"ircc-backup-{now}.sql"
    return Response(
        content=stdout,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
