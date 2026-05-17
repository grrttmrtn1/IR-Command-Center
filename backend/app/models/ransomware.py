import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB
from app.database import Base


class RansomwareSession(Base):
    __tablename__ = "ransomware_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    incident_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("incidents.id", ondelete="CASCADE"))
    answers: Mapped[dict] = mapped_column(JSONB, default=dict)
    decision: Mapped[str | None] = mapped_column(Text)
    decision_rationale: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
