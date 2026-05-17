import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey, Float, Integer, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Assessment(Base):
    __tablename__ = "assessments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(500))
    overall_score: Mapped[float | None] = mapped_column(Float)
    maturity_level: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="in_progress")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    answers: Mapped[list["AssessmentAnswer"]] = relationship(back_populates="assessment", cascade="all, delete-orphan")


class AssessmentQuestion(Base):
    __tablename__ = "assessment_questions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    category: Mapped[str] = mapped_column(String(100))
    subcategory: Mapped[str | None] = mapped_column(String(100))
    question: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    weight: Mapped[float] = mapped_column(Float, default=1.0)
    sort_order: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    answers: Mapped[list["AssessmentAnswer"]] = relationship(back_populates="question")


class AssessmentAnswer(Base):
    __tablename__ = "assessment_answers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assessment_id: Mapped[str] = mapped_column(String(36), ForeignKey("assessments.id", ondelete="CASCADE"))
    question_id: Mapped[str] = mapped_column(String(36), ForeignKey("assessment_questions.id"))
    score: Mapped[int] = mapped_column(Integer)  # 0-4
    notes: Mapped[str | None] = mapped_column(Text)
    evidence_doc_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("documents.id", ondelete="SET NULL"))

    assessment: Mapped["Assessment"] = relationship(back_populates="answers")
    question: Mapped["AssessmentQuestion"] = relationship(back_populates="answers")
