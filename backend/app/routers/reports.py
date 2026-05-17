from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone
from app.database import get_db
from app.models.report import ReportSchedule
from app.models.user import User, UserRole
from app.middleware.auth import require_role

router = APIRouter(prefix="/api/admin/reports", tags=["admin"])


class ScheduleUpsert(BaseModel):
    name: str
    enabled: bool = False
    recipients: list[EmailStr] = []


class ScheduleResponse(BaseModel):
    id: str
    name: str
    enabled: bool
    cron_expression: str
    recipients: list[str]
    last_sent_at: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=list[ScheduleResponse])
async def list_schedules(user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ReportSchedule).order_by(ReportSchedule.created_at))
    return result.scalars().all()


@router.post("", response_model=ScheduleResponse, status_code=201)
async def create_schedule(body: ScheduleUpsert, user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    schedule = ReportSchedule(name=body.name, enabled=body.enabled, recipients=body.recipients, created_by=user.id)
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.patch("/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(schedule_id: str, body: ScheduleUpsert, user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ReportSchedule).where(ReportSchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    schedule.name = body.name
    schedule.enabled = body.enabled
    schedule.recipients = body.recipients
    schedule.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.delete("/{schedule_id}", status_code=204)
async def delete_schedule(schedule_id: str, user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ReportSchedule).where(ReportSchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    await db.delete(schedule)
    await db.commit()


@router.post("/{schedule_id}/send-now", status_code=202)
async def send_now(schedule_id: str, user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ReportSchedule).where(ReportSchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if not schedule.recipients:
        raise HTTPException(status_code=400, detail="No recipients configured")
    from app.services.report_generator import build_executive_report_pdf
    from app.services.email import send_email
    from datetime import datetime, timezone
    try:
        pdf = await build_executive_report_pdf(db)
        now = datetime.now(timezone.utc)
        filename = f"ir-exec-report-{now.strftime('%Y-%m-%d')}.pdf"
        await send_email(
            to_addrs=schedule.recipients,
            subject=f"IR Command Center — Executive Report ({now.strftime('%Y-%m-%d')})",
            body_html="<p>Please find the IR executive report attached.</p>",
            attachment_bytes=pdf,
            attachment_name=filename,
        )
        schedule.last_sent_at = now
        await db.commit()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"message": "Report sent"}


@router.get("/preview")
async def preview_report(user: User = Depends(require_role(UserRole.ADMIN)), db: AsyncSession = Depends(get_db)):
    """Download a preview PDF of the current executive report."""
    from app.services.report_generator import build_executive_report_pdf
    from datetime import datetime, timezone
    pdf = await build_executive_report_pdf(db)
    now = datetime.now(timezone.utc)
    filename = f"ir-exec-report-preview-{now.strftime('%Y-%m-%d')}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
