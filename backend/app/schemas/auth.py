from datetime import datetime
from pydantic import BaseModel
from app.models.user import UserRole


class LoginRequest(BaseModel):
    email: str
    password: str
    mfa_code: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    role: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str | None
    role: UserRole
    mfa_enabled: bool
    is_active: bool
    must_change_password: bool = False
    sso_provider: str | None = None
    last_login_at: datetime | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    name: str | None = None
    email: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class MFASetupResponse(BaseModel):
    secret: str
    qr_code_b64: str
    backup_codes: list[str]


class MFAVerifyRequest(BaseModel):
    code: str
