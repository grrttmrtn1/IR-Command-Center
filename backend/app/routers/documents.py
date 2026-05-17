from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
import aiofiles
import os
import uuid
from app.database import get_db
from app.models.document import Document, DocumentVersion, DocCategory
from app.models.user import User, UserRole
from app.schemas.document import DocumentCreate, DocumentUpdate, DocumentResponse, DocumentVersionResponse
from app.middleware.auth import get_current_user, require_role
from app.config import settings

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    category: str | None = None,
    is_template: bool | None = None,
    search: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Document)
    if category:
        query = query.where(Document.category == category)
    if is_template is not None:
        query = query.where(Document.is_template == is_template)
    if search:
        query = query.where(or_(
            Document.title.ilike(f"%{search}%"),
            Document.description.ilike(f"%{search}%"),
            Document.tags.ilike(f"%{search}%"),
        ))
    result = await db.execute(query.order_by(Document.title))
    return result.scalars().all()


@router.get("/templates", response_model=list[DocumentResponse])
async def list_templates(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Document).where(Document.is_template == True).order_by(Document.title))
    return result.scalars().all()


@router.post("", response_model=DocumentResponse, status_code=201)
async def create_document(
    body: DocumentCreate,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    doc = Document(**body.model_dump(), created_by=user.id)
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.patch("/{doc_id}", response_model=DocumentResponse)
async def update_document(
    doc_id: str,
    body: DocumentUpdate,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Save version before update
    version_record = DocumentVersion(
        document_id=doc.id,
        version=doc.version,
        content=doc.content,
        file_path=doc.file_path,
        changed_by=user.id,
        change_notes=body.change_notes,
    )
    db.add(version_record)

    change_notes = body.change_notes
    for field, value in body.model_dump(exclude_none=True, exclude={"change_notes"}).items():
        setattr(doc, field, value)
    doc.version += 1
    await db.commit()
    await db.refresh(doc)
    return doc


@router.delete("/{doc_id}", status_code=204)
async def delete_document(doc_id: str, user: User = Depends(require_role(UserRole.IR_LEAD)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.is_system_template:
        raise HTTPException(status_code=400, detail="Cannot delete system templates")
    await db.delete(doc)
    await db.commit()


@router.get("/{doc_id}/versions", response_model=list[DocumentVersionResponse])
async def list_versions(doc_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DocumentVersion).where(DocumentVersion.document_id == doc_id).order_by(DocumentVersion.version.desc())
    )
    return result.scalars().all()


@router.post("/{doc_id}/upload", response_model=DocumentResponse)
async def upload_document_file(
    doc_id: str,
    file: UploadFile = File(...),
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    max_size = settings.max_upload_size_mb * 1024 * 1024
    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(status_code=413, detail="File too large")

    file_ext = os.path.splitext(file.filename or "")[1]
    file_name = f"{uuid.uuid4()}{file_ext}"
    dest = os.path.join(settings.upload_dir, "documents")
    os.makedirs(dest, exist_ok=True)
    full_path = os.path.join(dest, file_name)
    async with aiofiles.open(full_path, "wb") as f:
        await f.write(content)

    doc.file_path = full_path
    doc.file_size = len(content)
    doc.mime_type = file.content_type
    await db.commit()
    await db.refresh(doc)
    return doc
