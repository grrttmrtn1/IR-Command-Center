import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from app.config import settings

ALGORITHM = "HS256"


def create_access_token(user_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": user_id, "role": role, "exp": expire, "type": "access"},
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def create_refresh_token() -> tuple[str, str]:
    """Returns (plaintext_token, hashed_token)."""
    token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    return token, token_hash


def decode_access_token(token: str) -> dict:
    payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    if payload.get("type") != "access":
        raise JWTError("Invalid token type")
    return payload


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def generate_api_key() -> tuple[str, str, str]:
    """Returns (plaintext_key, key_hash, key_prefix)."""
    key = "ircc_" + secrets.token_urlsafe(32)
    key_hash = hash_api_key(key)
    key_prefix = key[:12]
    return key, key_hash, key_prefix
