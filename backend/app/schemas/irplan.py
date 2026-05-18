from datetime import datetime
from pydantic import BaseModel


class IRPlanSectionUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    next_review_at: datetime | None = None


class IRPlanSectionResponse(BaseModel):
    id: str
    section_key: str
    title: str
    content: str | None
    sort_order: int
    last_reviewed_at: datetime | None
    reviewed_by_id: str | None
    next_review_at: datetime | None
    version: int
    updated_by: str | None
    updated_at: datetime

    class Config:
        from_attributes = True


class OnCallRosterEntry(BaseModel):
    order: int
    name: str
    role: str | None = None
    phone: str | None = None
    email: str | None = None
    effective_from: str | None = None
    effective_to: str | None = None
    notes: str | None = None


class OnCallRosterCreate(BaseModel):
    name: str
    description: str | None = None
    is_active: bool = True
    entries: list[OnCallRosterEntry] = []


class OnCallRosterUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    entries: list[OnCallRosterEntry] | None = None


class OnCallRosterResponse(BaseModel):
    id: str
    name: str
    description: str | None
    is_active: bool
    entries: list[dict]
    created_by: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
