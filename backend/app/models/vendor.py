import enum
import uuid
from datetime import date, datetime
from sqlalchemy import String, Text, Date, DateTime, Enum, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class VendorType(str, enum.Enum):
    LEGAL = "LEGAL"
    FORENSICS = "FORENSICS"
    PR = "PR"
    INSURANCE = "INSURANCE"
    RANSOM_NEGOTIATOR = "RANSOM_NEGOTIATOR"
    BREACH_COACH = "BREACH_COACH"
    OTHER = "OTHER"


class Vendor(Base):
    __tablename__ = "vendors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(500))
    vendor_type: Mapped[VendorType] = mapped_column(Enum(VendorType))
    sla_response_hours: Mapped[int | None] = mapped_column(Integer)
    primary_contact_name: Mapped[str | None] = mapped_column(String(255))
    primary_contact_phone: Mapped[str | None] = mapped_column(String(50))
    primary_contact_email: Mapped[str | None] = mapped_column(String(255))
    secondary_contact_name: Mapped[str | None] = mapped_column(String(255))
    secondary_contact_phone: Mapped[str | None] = mapped_column(String(50))
    secondary_contact_email: Mapped[str | None] = mapped_column(String(255))
    contract_start: Mapped[date | None] = mapped_column(Date)
    contract_expiry: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class VendorEngagement(Base):
    __tablename__ = "vendor_engagements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    vendor_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendors.id", ondelete="CASCADE"))
    incident_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("incidents.id", ondelete="SET NULL"))
    engaged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
