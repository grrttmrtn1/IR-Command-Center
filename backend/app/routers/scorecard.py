from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models.assessment import Assessment, AssessmentQuestion, AssessmentAnswer
from app.models.user import User, UserRole
from app.middleware.auth import get_current_user, require_role

router = APIRouter(prefix="/api/scorecard", tags=["scorecard"])


class AssessmentCreate(BaseModel):
    title: str


class AssessmentUpdate(BaseModel):
    title: str


class AnswerUpsert(BaseModel):
    question_id: str
    score: int  # 0-4
    notes: str | None = None
    evidence_doc_id: str | None = None


class AnswersUpdate(BaseModel):
    answers: list[AnswerUpsert]


class AssessmentResponse(BaseModel):
    id: str
    title: str
    overall_score: float | None
    maturity_level: int | None
    status: str
    created_by: str

    class Config:
        from_attributes = True


@router.get("", response_model=list[AssessmentResponse])
async def list_assessments(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Assessment).order_by(Assessment.created_at.desc()))
    return result.scalars().all()


@router.get("/questions")
async def get_questions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AssessmentQuestion).where(AssessmentQuestion.is_active == True).order_by(AssessmentQuestion.category, AssessmentQuestion.sort_order))
    questions = result.scalars().all()
    grouped: dict = {}
    for q in questions:
        if q.category not in grouped:
            grouped[q.category] = []
        grouped[q.category].append({
            "id": q.id, "question": q.question, "description": q.description,
            "weight": q.weight, "subcategory": q.subcategory,
        })
    return grouped


@router.post("", response_model=AssessmentResponse, status_code=201)
async def create_assessment(body: AssessmentCreate, user: User = Depends(require_role(UserRole.ANALYST)), db: AsyncSession = Depends(get_db)):
    assessment = Assessment(title=body.title, created_by=user.id)
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)
    return assessment


@router.get("/{assessment_id}", response_model=AssessmentResponse)
async def get_assessment(assessment_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return a


@router.patch("/{assessment_id}", response_model=AssessmentResponse)
async def update_assessment(assessment_id: str, body: AssessmentUpdate, user: User = Depends(require_role(UserRole.ANALYST)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    assessment.title = body.title
    await db.commit()
    await db.refresh(assessment)
    return assessment


@router.delete("/{assessment_id}", status_code=204)
async def delete_assessment(assessment_id: str, user: User = Depends(require_role(UserRole.ANALYST)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    await db.delete(assessment)
    await db.commit()


@router.get("/{assessment_id}/answers")
async def get_answers(assessment_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Assessment not found")
    answers_result = await db.execute(
        select(AssessmentAnswer).where(AssessmentAnswer.assessment_id == assessment_id)
    )
    answers = answers_result.scalars().all()
    return [{"question_id": a.question_id, "score": a.score, "notes": a.notes} for a in answers]


@router.patch("/{assessment_id}/answers")
async def upsert_answers(
    assessment_id: str,
    body: AnswersUpdate,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    for ans in body.answers:
        existing_result = await db.execute(
            select(AssessmentAnswer).where(
                AssessmentAnswer.assessment_id == assessment_id,
                AssessmentAnswer.question_id == ans.question_id,
            )
        )
        existing = existing_result.scalar_one_or_none()
        if existing:
            existing.score = ans.score
            existing.notes = ans.notes
            existing.evidence_doc_id = ans.evidence_doc_id
        else:
            db.add(AssessmentAnswer(
                assessment_id=assessment_id,
                question_id=ans.question_id,
                score=ans.score,
                notes=ans.notes,
                evidence_doc_id=ans.evidence_doc_id,
            ))

    await db.commit()
    return {"message": "Answers saved"}


@router.post("/{assessment_id}/submit")
async def submit_assessment(
    assessment_id: str,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Assessment).options(selectinload(Assessment.answers).selectinload(AssessmentAnswer.question))
        .where(Assessment.id == assessment_id)
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    if not assessment.answers:
        raise HTTPException(status_code=400, detail="No answers recorded")

    total_weighted = 0.0
    total_weight = 0.0
    for answer in assessment.answers:
        w = answer.question.weight
        total_weighted += (answer.score / 4.0) * w
        total_weight += w

    overall_score = (total_weighted / total_weight * 100) if total_weight > 0 else 0.0

    if overall_score >= 90:
        maturity = 5
    elif overall_score >= 70:
        maturity = 4
    elif overall_score >= 50:
        maturity = 3
    elif overall_score >= 25:
        maturity = 2
    else:
        maturity = 1

    from datetime import datetime, timezone
    assessment.overall_score = round(overall_score, 1)
    assessment.maturity_level = maturity
    assessment.status = "completed"
    assessment.completed_at = datetime.now(timezone.utc)
    await db.commit()

    return {"overall_score": overall_score, "maturity_level": maturity}
