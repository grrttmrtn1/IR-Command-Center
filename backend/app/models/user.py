import enum
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Enum, Text, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    IR_LEAD = "IR_LEAD"
    ANALYST = "ANALYST"
    OBSERVER = "OBSERVER"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(255))
    password_hash: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.ANALYST)
    sso_provider: Mapped[str | None] = mapped_column(String(50))
    sso_id: Mapped[str | None] = mapped_column(String(255))
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mfa_secret: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    sessions: Mapped[list["Session"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    mfa_backup_codes: Mapped[list["MFABackupCode"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    api_keys: Mapped[list["ApiKey"]] = relationship(back_populates="created_by_user", foreign_keys="ApiKey.created_by")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="sessions")


class MFABackupCode(Base):
    __tablename__ = "mfa_backup_codes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"))
    code_hash: Mapped[str] = mapped_column(String(255))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="mfa_backup_codes")


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255))
    key_hash: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    key_prefix: Mapped[str] = mapped_column(String(12))
    scopes: Mapped[str] = mapped_column(Text, default="")  # comma-separated
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    created_by_user: Mapped["User"] = relationship(back_populates="api_keys", foreign_keys=[created_by])

    @property
    def scopes_list(self) -> list[str]:
        return [s.strip() for s in self.scopes.split(",") if s.strip()]


class SSOConfig(Base):
    __tablename__ = "sso_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    type: Mapped[str] = mapped_column(String(10))  # SAML | OIDC
    name: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    config_encrypted: Mapped[str] = mapped_column(Text)  # AES-256-GCM encrypted JSON
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
