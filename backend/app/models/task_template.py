import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, Boolean, Integer, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class TaskTemplate(Base):
    __tablename__ = "task_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    incident_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    priority: Mapped[str] = mapped_column(String(20), default="MEDIUM")
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
