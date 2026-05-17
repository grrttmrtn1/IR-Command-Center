from datetime import datetime
from pydantic import BaseModel
from app.models.incident import (
    IncidentType, Severity, IncidentStatus, IncidentPhase,
    IOCType, TaskStatus, Priority,
)


class IncidentCreate(BaseModel):
    title: str
    description: str | None = None
    incident_type: IncidentType
    severity: Severity
    lead_id: str | None = None


class IncidentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    severity: Severity | None = None
    status: IncidentStatus | None = None
    phase: IncidentPhase | None = None
    lead_id: str | None = None
    contained_at: datetime | None = None
    resolved_at: datetime | None = None


class IncidentResponse(BaseModel):
    id: str
    title: str
    description: str | None
    incident_type: IncidentType
    severity: Severity
    status: IncidentStatus
    phase: IncidentPhase
    lead_id: str | None
    started_at: datetime
    contained_at: datetime | None
    resolved_at: datetime | None
    created_by: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class IOCCreate(BaseModel):
    type: IOCType | None = None
    ioc_type: IOCType | None = None
    value: str
    confidence: str = "HIGH"
    source: str | None = None
    notes: str | None = None

    def get_ioc_type(self) -> IOCType:
        return self.ioc_type or self.type or IOCType.OTHER


class IOCResponse(BaseModel):
    id: str
    incident_id: str
    type: IOCType
    value: str
    confidence: str
    source: str | None
    notes: str | None
    created_by: str | None
    created_at: datetime

    @classmethod
    def from_orm_ioc(cls, ioc):
        return cls(
            id=ioc.id,
            incident_id=ioc.incident_id,
            type=ioc.ioc_type,
            value=ioc.value,
            confidence=ioc.confidence,
            source=ioc.source,
            notes=ioc.notes,
            created_by=ioc.created_by,
            created_at=ioc.created_at,
        )

    class Config:
        from_attributes = True


class AssetCreate(BaseModel):
    name: str
    asset_type: str
    identifier: str | None = None
    status: str = "AFFECTED"
    priority: str = "MEDIUM"
    notes: str | None = None


class AssetUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    priority: str | None = None
    notes: str | None = None


class AssetResponse(BaseModel):
    id: str
    incident_id: str
    name: str
    asset_type: str
    identifier: str | None
    status: str
    priority: str
    notes: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class NoteCreate(BaseModel):
    content: str
    is_exec_briefing: bool = False
    is_pinned: bool = False


class NoteResponse(BaseModel):
    id: str
    incident_id: str
    author_id: str
    content: str
    is_exec_briefing: bool
    is_pinned: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TimelineEventCreate(BaseModel):
    event_type: str
    description: str
    occurred_at: datetime


class TimelineEventResponse(BaseModel):
    id: str
    incident_id: str
    actor_id: str | None
    actor: str | None
    event_type: str
    description: str
    occurred_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class EvidenceCreate(BaseModel):
    title: str
    description: str | None = None


class EvidenceResponse(BaseModel):
    id: str
    incident_id: str
    title: str
    description: str | None
    file_path: str | None
    file_size: int | None
    mime_type: str | None
    chain_of_custody: list
    collected_by: str
    collected_at: datetime

    class Config:
        from_attributes = True


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    status: TaskStatus = TaskStatus.TODO
    priority: Priority = Priority.MEDIUM
    assignee_id: str | None = None
    due_at: datetime | None = None
    labels: str = ""
    parent_id: str | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: TaskStatus | None = None
    priority: Priority | None = None
    assignee_id: str | None = None
    due_at: datetime | None = None
    labels: str | None = None
    sort_order: int | None = None


class TaskResponse(BaseModel):
    id: str
    incident_id: str | None
    title: str
    description: str | None
    status: TaskStatus
    priority: Priority
    assignee_id: str | None
    due_at: datetime | None
    sort_order: int
    labels: str
    parent_id: str | None
    created_by: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TaskMoveRequest(BaseModel):
    status: TaskStatus
    sort_order: int
