from datetime import datetime
from pydantic import BaseModel
from app.models.document import DocCategory


class DocumentCreate(BaseModel):
    title: str
    description: str | None = None
    category: DocCategory
    content: str | None = None
    tags: str = ""
    is_template: bool = False


class DocumentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    category: DocCategory | None = None
    content: str | None = None
    tags: str | None = None
    change_notes: str | None = None


class DocumentResponse(BaseModel):
    id: str
    title: str
    description: str | None
    category: DocCategory
    content: str | None
    file_path: str | None
    file_size: int | None
    mime_type: str | None
    is_template: bool
    is_system_template: bool
    tags: str
    version: int
    created_by: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DocumentVersionResponse(BaseModel):
    id: str
    document_id: str
    version: int
    content: str | None
    changed_by: str
    change_notes: str | None
    created_at: datetime

    class Config:
        from_attributes = True
