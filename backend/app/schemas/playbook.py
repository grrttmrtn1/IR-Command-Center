from datetime import datetime
from pydantic import BaseModel


class PlaybookStep(BaseModel):
    id: str
    order: int
    title: str
    description: str | None = None
    role: str | None = None
    phase: str | None = None
    is_decision_point: bool = False
    escalation_trigger: str | None = None


class PlaybookCreate(BaseModel):
    title: str
    description: str | None = None
    incident_type: str
    steps: list[PlaybookStep] = []
    tags: list[str] = []


class PlaybookUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    incident_type: str | None = None
    is_active: bool | None = None
    steps: list[PlaybookStep] | None = None
    tags: list[str] | None = None


class PlaybookResponse(BaseModel):
    id: str
    title: str
    description: str | None
    incident_type: str
    is_system: bool
    is_active: bool
    steps: list[dict]
    tags: list[str]
    created_by: str | None
    updated_by: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PlaybookActivateRequest(BaseModel):
    incident_id: str
