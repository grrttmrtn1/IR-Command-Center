import enum
import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, Enum, ForeignKey, Boolean, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class DocCategory(str, enum.Enum):
    PLAYBOOK = "PLAYBOOK"
    PROCEDURE = "PROCEDURE"
    POLICY = "POLICY"
    TEMPLATE = "TEMPLATE"
    EVIDENCE = "EVIDENCE"
    LEGAL = "LEGAL"
    COMMUNICATION = "COMMUNICATION"
    TRAINING = "TRAINING"
    OTHER = "OTHER"


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[DocCategory] = mapped_column(Enum(DocCategory))
    content: Mapped[str | None] = mapped_column(Text)
    file_path: Mapped[str | None] = mapped_column(String(1024))
    file_size: Mapped[int | None] = mapped_column(Integer)
    mime_type: Mapped[str | None] = mapped_column(String(255))
    is_template: Mapped[bool] = mapped_column(Boolean, default=False)
    is_system_template: Mapped[bool] = mapped_column(Boolean, default=False)
    tags: Mapped[str] = mapped_column(String(1024), default="")
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    doc_versions: Mapped[list["DocumentVersion"]] = relationship(back_populates="document", cascade="all, delete-orphan")

    @property
    def tags_list(self) -> list[str]:
        return [t.strip() for t in self.tags.split(",") if t.strip()]


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id", ondelete="CASCADE"))
    version: Mapped[int] = mapped_column(Integer)
    content: Mapped[str | None] = mapped_column(Text)
    file_path: Mapped[str | None] = mapped_column(String(1024))
    changed_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    change_notes: Mapped[str | None] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document: Mapped["Document"] = relationship(back_populates="doc_versions")
