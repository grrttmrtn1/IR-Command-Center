import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB
from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"))
    api_key_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("api_keys.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(100))
    resource: Mapped[str] = mapped_column(String(100))
    resource_id: Mapped[str | None] = mapped_column(String(36))
    details: Mapped[dict | None] = mapped_column(JSONB)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
