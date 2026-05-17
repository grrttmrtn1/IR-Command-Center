import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)
_scheduler: AsyncIOScheduler | None = None


async def _send_weekly_reports():
    from app.database import AsyncSessionLocal
    from app.models.report import ReportSchedule
    from app.services.report_generator import build_executive_report_pdf
    from app.services.email import send_email
    from sqlalchemy import select
    from datetime import datetime, timezone

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ReportSchedule).where(ReportSchedule.enabled == True))
        schedules = result.scalars().all()
        for schedule in schedules:
            if not schedule.recipients:
                continue
            try:
                pdf = await build_executive_report_pdf(db)
                now = datetime.now(timezone.utc)
                filename = f"ir-exec-report-{now.strftime('%Y-%m-%d')}.pdf"
                await send_email(
                    to_addrs=schedule.recipients,
                    subject=f"IR Command Center — Weekly Executive Report ({now.strftime('%Y-%m-%d')})",
                    body_html="<p>Please find the weekly IR executive report attached.</p>",
                    attachment_bytes=pdf,
                    attachment_name=filename,
                )
                schedule.last_sent_at = now
                await db.commit()
                logger.info("Executive report sent to %s", schedule.recipients)
            except Exception:
                logger.exception("Failed to send executive report for schedule %s", schedule.id)


def start_scheduler():
    global _scheduler
    _scheduler = AsyncIOScheduler()
    # Check every Monday at 08:00 UTC — individual schedules can override via cron_expression
    _scheduler.add_job(_send_weekly_reports, CronTrigger(day_of_week="mon", hour=8, minute=0))
    _scheduler.start()
    logger.info("APScheduler started")


def stop_scheduler():
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
