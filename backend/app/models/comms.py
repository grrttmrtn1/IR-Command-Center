import enum
import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, Enum, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB
from app.database import Base


class DraftStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED = "APPROVED"
    SENT = "SENT"
    ARCHIVED = "ARCHIVED"


class CommsDraft(Base):
    __tablename__ = "comms_drafts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    incident_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("incidents.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(500))
    jurisdiction: Mapped[str] = mapped_column(String(50))
    state: Mapped[str | None] = mapped_column(String(2))
    content: Mapped[str] = mapped_column(Text)
    status: Mapped[DraftStatus] = mapped_column(Enum(DraftStatus), default=DraftStatus.DRAFT)
    version: Mapped[int] = mapped_column(Integer, default=1)
    review_notes: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"))
    approved_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"))
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    incident: Mapped["Incident | None"] = relationship(back_populates="comms_drafts")
    notifications: Mapped[list["CommsNotification"]] = relationship(back_populates="draft", cascade="all, delete-orphan")


class CommsNotification(Base):
    __tablename__ = "comms_notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    draft_id: Mapped[str] = mapped_column(String(36), ForeignKey("comms_drafts.id", ondelete="CASCADE"))
    method: Mapped[str] = mapped_column(String(50))
    recipient: Mapped[str] = mapped_column(String(500))
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sent_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))

    draft: Mapped["CommsDraft"] = relationship(back_populates="notifications")


class CustomJurisdiction(Base):
    __tablename__ = "custom_jurisdictions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    deadline_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    threshold: Mapped[str | None] = mapped_column(Text)
    requirements: Mapped[list] = mapped_column(JSONB, default=list)
    contact_url: Mapped[str | None] = mapped_column(String(512))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


from app.models.incident import Incident  # noqa: E402, F401
