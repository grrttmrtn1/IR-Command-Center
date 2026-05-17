from datetime import datetime, timezone, timedelta
from html import escape
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func


async def build_executive_report_html(db: AsyncSession) -> str:
    from app.models.incident import Incident, IncidentStatus, IncidentTask, TaskStatus

    now = datetime.now(timezone.utc)
    generated = now.strftime("%Y-%m-%d %H:%M UTC")

    # Open incidents
    open_result = await db.execute(
        select(Incident).where(Incident.status != IncidentStatus.CLOSED).order_by(Incident.severity)
    )
    open_incidents = open_result.scalars().all()

    # Task backlog
    backlog_result = await db.execute(
        select(IncidentTask.status, func.count(IncidentTask.id)).group_by(IncidentTask.status)
    )
    task_counts: dict[str, int] = {row[0].value if hasattr(row[0], 'value') else str(row[0]): row[1] for row in backlog_result}

    # MTTR — closed incidents in the last 30 days
    since_30d = now - timedelta(days=30)
    mttr_result = await db.execute(
        select(Incident).where(
            Incident.status == IncidentStatus.CLOSED,
            Incident.resolved_at != None,
            Incident.resolved_at >= since_30d,
        )
    )
    closed = mttr_result.scalars().all()
    mttr_hours: float | None = None
    if closed:
        durations = [
            (inc.resolved_at - inc.started_at).total_seconds() / 3600
            for inc in closed
            if inc.resolved_at and inc.started_at
        ]
        if durations:
            mttr_hours = round(sum(durations) / len(durations), 1)

    sev_color = {"CRITICAL": "#dc2626", "HIGH": "#f97316", "MEDIUM": "#eab308", "LOW": "#3b82f6"}

    incident_rows = "".join(
        f"<tr><td>{escape(inc.title)}</td>"
        f"<td><span style='color:{sev_color.get(inc.severity.value, \"#6b7280\")};font-weight:bold'>{escape(inc.severity.value)}</span></td>"
        f"<td>{escape(inc.status.value)}</td>"
        f"<td>{escape(inc.phase.value)}</td>"
        f"<td>{inc.started_at.strftime('%Y-%m-%d')}</td></tr>"
        for inc in open_incidents
    )

    total_tasks = sum(task_counts.values())
    task_row = "".join(
        f"<tr><td>{status}</td><td>{count}</td><td>{round(count/total_tasks*100) if total_tasks else 0}%</td></tr>"
        for status, count in sorted(task_counts.items())
    )

    mttr_display = f"{mttr_hours}h" if mttr_hours is not None else "N/A"

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body {{ font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 40px; }}
  h1 {{ font-size: 20px; margin-bottom: 2px; color: #1e3a5f; }}
  h2 {{ font-size: 14px; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; margin-top: 28px; color: #1e3a5f; }}
  .meta {{ color: #6b7280; font-size: 11px; margin-bottom: 24px; }}
  .kpi {{ display: inline-block; margin-right: 32px; text-align: center; }}
  .kpi-val {{ font-size: 28px; font-weight: bold; color: #1e3a5f; }}
  .kpi-label {{ font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: .5px; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
  th {{ background: #f3f4f6; text-align: left; padding: 6px 8px; font-size: 11px; }}
  td {{ padding: 5px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }}
  .footer {{ margin-top: 40px; font-size: 10px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 12px; }}
</style></head><body>
<h1>IR Command Center — Weekly Executive Report</h1>
<div class="meta">Generated: {generated} &bull; Covers rolling 30-day window</div>

<div>
  <div class="kpi"><div class="kpi-val">{len(open_incidents)}</div><div class="kpi-label">Open Incidents</div></div>
  <div class="kpi"><div class="kpi-val">{total_tasks}</div><div class="kpi-label">Total Tasks</div></div>
  <div class="kpi"><div class="kpi-val">{task_counts.get("DONE", 0)}</div><div class="kpi-label">Tasks Done</div></div>
  <div class="kpi"><div class="kpi-val">{mttr_display}</div><div class="kpi-label">Avg MTTR (30d)</div></div>
</div>

<h2>Open Incidents ({len(open_incidents)})</h2>
<table><thead><tr><th>Title</th><th>Severity</th><th>Status</th><th>Phase</th><th>Started</th></tr></thead>
<tbody>{incident_rows or "<tr><td colspan='5' style='color:#6b7280'>No open incidents</td></tr>"}</tbody></table>

<h2>Task Backlog</h2>
<table><thead><tr><th>Status</th><th>Count</th><th>%</th></tr></thead>
<tbody>{task_row or "<tr><td colspan='3' style='color:#6b7280'>No tasks</td></tr>"}</tbody></table>

<div class="footer">IR Command Center &bull; Confidential — For authorized recipients only</div>
</body></html>"""

    return html


async def build_executive_report_pdf(db: AsyncSession) -> bytes:
    html = await build_executive_report_html(db)
    try:
        import weasyprint
        return weasyprint.HTML(string=html).write_pdf()
    except ImportError:
        return html.encode()
