import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, Boolean, Integer, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from app.database import Base


class OrgKnowledge(Base):
    __tablename__ = "org_knowledge"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_name: Mapped[str | None] = mapped_column(String(255))
    industry: Mapped[str | None] = mapped_column(String(100))
    size: Mapped[str | None] = mapped_column(String(50))
    critical_systems: Mapped[list[str] | None] = mapped_column(ARRAY(String), default=list)
    regulatory_obligations: Mapped[list[str] | None] = mapped_column(ARRAY(String), default=list)
    comm_voice: Mapped[str | None] = mapped_column(Text)
    comm_guidelines: Mapped[str | None] = mapped_column(Text)
    key_contacts: Mapped[dict | None] = mapped_column(JSONB)
    insurance_info: Mapped[dict | None] = mapped_column(JSONB)
    legal_counsel: Mapped[dict | None] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AIConfig(Base):
    __tablename__ = "ai_config"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    default_provider: Mapped[str] = mapped_column(String(50), default="anthropic")
    providers_encrypted: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ContactList(Base):
    __tablename__ = "contact_lists"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    secondary_phone: Mapped[str | None] = mapped_column(String(50))
    organization: Mapped[str | None] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(20), default="INTERNAL")
    # LEGAL | INSURANCE | FORENSICS | PR | LAW_ENFORCEMENT | EXEC_TEAM | IR_TEAM | OTHER
    category: Mapped[str] = mapped_column(String(30), default="OTHER")
    escalation_order: Mapped[int | None] = mapped_column(Integer)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
