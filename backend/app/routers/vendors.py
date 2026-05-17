import uuid
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models.vendor import Vendor, VendorEngagement, VendorType
from app.models.user import User, UserRole
from app.middleware.auth import get_current_user, require_role

router = APIRouter(prefix="/api/vendors", tags=["vendors"])


class VendorCreate(BaseModel):
    name: str
    vendor_type: VendorType
    sla_response_hours: int | None = None
    primary_contact_name: str | None = None
    primary_contact_phone: str | None = None
    primary_contact_email: str | None = None
    secondary_contact_name: str | None = None
    secondary_contact_phone: str | None = None
    secondary_contact_email: str | None = None
    contract_start: date | None = None
    contract_expiry: date | None = None
    notes: str | None = None


class VendorUpdate(BaseModel):
    name: str | None = None
    vendor_type: VendorType | None = None
    sla_response_hours: int | None = None
    primary_contact_name: str | None = None
    primary_contact_phone: str | None = None
    primary_contact_email: str | None = None
    secondary_contact_name: str | None = None
    secondary_contact_phone: str | None = None
    secondary_contact_email: str | None = None
    contract_start: date | None = None
    contract_expiry: date | None = None
    notes: str | None = None


class VendorResponse(BaseModel):
    id: str
    name: str
    vendor_type: VendorType
    sla_response_hours: int | None
    primary_contact_name: str | None
    primary_contact_phone: str | None
    primary_contact_email: str | None
    secondary_contact_name: str | None
    secondary_contact_phone: str | None
    secondary_contact_email: str | None
    contract_start: date | None
    contract_expiry: date | None
    notes: str | None
    expiry_warning: bool
    created_by: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EngagementCreate(BaseModel):
    incident_id: str | None = None
    notes: str | None = None


class EngagementResponse(BaseModel):
    id: str
    vendor_id: str
    incident_id: str | None
    engaged_at: datetime
    resolved_at: datetime | None
    notes: str | None
    created_by: str
    created_at: datetime

    class Config:
        from_attributes = True


def _to_response(v: Vendor) -> VendorResponse:
    warning = False
    if v.contract_expiry:
        days_left = (v.contract_expiry - date.today()).days
        warning = days_left <= 30
    return VendorResponse(
        id=v.id,
        name=v.name,
        vendor_type=v.vendor_type,
        sla_response_hours=v.sla_response_hours,
        primary_contact_name=v.primary_contact_name,
        primary_contact_phone=v.primary_contact_phone,
        primary_contact_email=v.primary_contact_email,
        secondary_contact_name=v.secondary_contact_name,
        secondary_contact_phone=v.secondary_contact_phone,
        secondary_contact_email=v.secondary_contact_email,
        contract_start=v.contract_start,
        contract_expiry=v.contract_expiry,
        notes=v.notes,
        expiry_warning=warning,
        created_by=v.created_by,
        created_at=v.created_at,
        updated_at=v.updated_at,
    )


@router.get("/", response_model=list[VendorResponse])
async def list_vendors(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(Vendor).order_by(Vendor.vendor_type, Vendor.name))).scalars().all()
    return [_to_response(v) for v in rows]


@router.post("/", response_model=VendorResponse)
async def create_vendor(
    body: VendorCreate,
    user: User = Depends(require_role(UserRole.IR_LEAD)),
    db: AsyncSession = Depends(get_db),
):
    v = Vendor(id=str(uuid.uuid4()), created_by=user.id, **body.model_dump())
    db.add(v)
    await db.commit()
    await db.refresh(v)
    return _to_response(v)


@router.patch("/{vendor_id}", response_model=VendorResponse)
async def update_vendor(
    vendor_id: str,
    body: VendorUpdate,
    user: User = Depends(require_role(UserRole.IR_LEAD)),
    db: AsyncSession = Depends(get_db),
):
    v = (await db.execute(select(Vendor).where(Vendor.id == vendor_id))).scalar_one_or_none()
    if not v:
        raise HTTPException(status_code=404, detail="Vendor not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(v, field, value)
    await db.commit()
    await db.refresh(v)
    return _to_response(v)


@router.delete("/{vendor_id}")
async def delete_vendor(
    vendor_id: str,
    user: User = Depends(require_role(UserRole.IR_LEAD)),
    db: AsyncSession = Depends(get_db),
):
    v = (await db.execute(select(Vendor).where(Vendor.id == vendor_id))).scalar_one_or_none()
    if not v:
        raise HTTPException(status_code=404, detail="Vendor not found")
    await db.delete(v)
    await db.commit()
    return {"ok": True}


@router.post("/{vendor_id}/engagements", response_model=EngagementResponse)
async def create_engagement(
    vendor_id: str,
    body: EngagementCreate,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    v = (await db.execute(select(Vendor).where(Vendor.id == vendor_id))).scalar_one_or_none()
    if not v:
        raise HTTPException(status_code=404, detail="Vendor not found")
    eng = VendorEngagement(
        id=str(uuid.uuid4()),
        vendor_id=vendor_id,
        incident_id=body.incident_id,
        notes=body.notes,
        created_by=user.id,
    )
    db.add(eng)
    await db.commit()
    await db.refresh(eng)
    return eng


@router.get("/engaged/{incident_id}", response_model=list[EngagementResponse])
async def engagements_for_incident(
    incident_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(VendorEngagement).where(VendorEngagement.incident_id == incident_id)
    )).scalars().all()
    return rows
