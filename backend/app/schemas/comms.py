from datetime import datetime
from pydantic import BaseModel
from app.models.comms import DraftStatus


class CommsDraftCreate(BaseModel):
    incident_id: str | None = None
    title: str
    jurisdiction: str
    state: str | None = None
    content: str = ""


class CommsDraftUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    status: DraftStatus | None = None
    review_notes: str | None = None


class CommsDraftResponse(BaseModel):
    id: str
    incident_id: str | None
    title: str
    jurisdiction: str
    state: str | None
    content: str
    status: DraftStatus
    version: int
    review_notes: str | None
    reviewed_by: str | None
    approved_by: str | None
    created_by: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GenerateDraftRequest(BaseModel):
    provider: str | None = None
    context: str | None = None


class JurisdictionInfo(BaseModel):
    code: str
    name: str
    deadline_hours: int | None
    threshold: str | None
    requirements: list[str]
    contact_url: str | None
    notes: str | None
