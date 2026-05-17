from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.database import get_db
from app.models.user import User
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/compliance", tags=["compliance"])

# ─── Framework taxonomy ─────────────────────────────────────────────────────

FRAMEWORKS: dict[str, dict] = {
    "NIST_CSF": {
        "name": "NIST CSF 2.0",
        "categories": [
            {"id": "GV.OC", "label": "Organizational Context", "function": "GOVERN"},
            {"id": "GV.RM", "label": "Risk Management Strategy", "function": "GOVERN"},
            {"id": "GV.RR", "label": "Roles, Responsibilities & Authorities", "function": "GOVERN"},
            {"id": "ID.AM", "label": "Asset Management", "function": "IDENTIFY"},
            {"id": "ID.RA", "label": "Risk Assessment", "function": "IDENTIFY"},
            {"id": "ID.IM", "label": "Improvement", "function": "IDENTIFY"},
            {"id": "PR.AA", "label": "Identity Management & Access Control", "function": "PROTECT"},
            {"id": "PR.AT", "label": "Awareness & Training", "function": "PROTECT"},
            {"id": "PR.DS", "label": "Data Security", "function": "PROTECT"},
            {"id": "PR.PS", "label": "Platform Security", "function": "PROTECT"},
            {"id": "PR.IR", "label": "Technology Infrastructure Resilience", "function": "PROTECT"},
            {"id": "DE.AE", "label": "Adverse Event Analysis", "function": "DETECT"},
            {"id": "DE.CM", "label": "Continuous Monitoring", "function": "DETECT"},
            {"id": "RS.MA", "label": "Incident Management", "function": "RESPOND"},
            {"id": "RS.AN", "label": "Incident Analysis", "function": "RESPOND"},
            {"id": "RS.CO", "label": "Incident Response Reporting & Communication", "function": "RESPOND"},
            {"id": "RS.MI", "label": "Incident Mitigation", "function": "RESPOND"},
            {"id": "RC.RP", "label": "Incident Recovery Plan Execution", "function": "RECOVER"},
            {"id": "RC.CO", "label": "Incident Recovery Communication", "function": "RECOVER"},
        ],
    },
    "ISO_27001": {
        "name": "ISO 27001:2022 Annex A",
        "categories": [
            {"id": "A.5.1", "label": "Policies for information security", "function": "Organizational"},
            {"id": "A.5.2", "label": "Information security roles and responsibilities", "function": "Organizational"},
            {"id": "A.5.24", "label": "IS incident management planning and preparation", "function": "Organizational"},
            {"id": "A.5.25", "label": "Assessment and decision on IS events", "function": "Organizational"},
            {"id": "A.5.26", "label": "Response to information security incidents", "function": "Organizational"},
            {"id": "A.5.27", "label": "Learning from IS incidents", "function": "Organizational"},
            {"id": "A.5.28", "label": "Collection of evidence", "function": "Organizational"},
            {"id": "A.5.29", "label": "IS during disruption", "function": "Organizational"},
            {"id": "A.6.1", "label": "Screening", "function": "People"},
            {"id": "A.6.3", "label": "IS awareness, education and training", "function": "People"},
            {"id": "A.7.1", "label": "Physical security perimeters", "function": "Physical"},
            {"id": "A.8.1", "label": "User endpoint devices", "function": "Technological"},
            {"id": "A.8.7", "label": "Protection against malware", "function": "Technological"},
            {"id": "A.8.15", "label": "Logging", "function": "Technological"},
            {"id": "A.8.16", "label": "Monitoring activities", "function": "Technological"},
            {"id": "A.8.20", "label": "Networks security", "function": "Technological"},
        ],
    },
    "SOC2": {
        "name": "SOC 2 Trust Services Criteria",
        "categories": [
            {"id": "CC1.1", "label": "COSO Principle 1: Integrity and ethical values", "function": "Common Criteria"},
            {"id": "CC2.1", "label": "COSO Principle 13: Board oversight", "function": "Common Criteria"},
            {"id": "CC3.1", "label": "COSO Principle 6: Specify suitable objectives", "function": "Common Criteria"},
            {"id": "CC4.1", "label": "COSO Principle 16: Conduct ongoing and/or separate evaluations", "function": "Common Criteria"},
            {"id": "CC5.1", "label": "COSO Principle 10: Select and develop control activities", "function": "Common Criteria"},
            {"id": "CC6.1", "label": "Logical and physical access controls", "function": "Common Criteria"},
            {"id": "CC6.6", "label": "Threat and vulnerability management", "function": "Common Criteria"},
            {"id": "CC7.1", "label": "Detect and monitor for configuration changes", "function": "Common Criteria"},
            {"id": "CC7.2", "label": "Monitor system components for anomalies", "function": "Common Criteria"},
            {"id": "CC7.3", "label": "Evaluate security events to determine incidents", "function": "Common Criteria"},
            {"id": "CC7.4", "label": "Respond to security incidents", "function": "Common Criteria"},
            {"id": "CC7.5", "label": "Identify, develop, and implement actions to recover", "function": "Common Criteria"},
            {"id": "CC8.1", "label": "Manage change processes", "function": "Common Criteria"},
            {"id": "CC9.1", "label": "Identify, select, and develop risk mitigation activities", "function": "Common Criteria"},
            {"id": "A1.1", "label": "Current processing capacity to meet commitments", "function": "Availability"},
            {"id": "C1.1", "label": "Identify and maintain confidential information", "function": "Confidentiality"},
        ],
    },
}


@router.get("/frameworks")
async def get_frameworks(user: User = Depends(get_current_user)):
    return FRAMEWORKS


@router.get("/coverage")
async def get_coverage(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return tag coverage counts across all incidents (timeline events + tasks)."""
    tag_counts: dict[str, int] = {}

    timeline_result = await db.execute(
        text("SELECT tags FROM timeline_events WHERE tags IS NOT NULL AND jsonb_array_length(tags) > 0")
    )
    for (tags,) in timeline_result:
        for tag in (tags or []):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1

    task_result = await db.execute(
        text("SELECT framework_tags FROM incident_tasks WHERE framework_tags IS NOT NULL AND jsonb_array_length(framework_tags) > 0")
    )
    for (tags,) in task_result:
        for tag in (tags or []):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1

    coverage = {}
    for fw_key, fw in FRAMEWORKS.items():
        covered = []
        uncovered = []
        for cat in fw["categories"]:
            tag_id = f"{fw_key}:{cat['id']}"
            count = tag_counts.get(tag_id, 0)
            entry = {**cat, "tag": tag_id, "count": count}
            (covered if count > 0 else uncovered).append(entry)
        coverage[fw_key] = {
            "name": fw["name"],
            "covered": covered,
            "uncovered": uncovered,
            "coverage_pct": round(len(covered) / len(fw["categories"]) * 100) if fw["categories"] else 0,
        }

    return coverage


@router.get("/incidents/{incident_id}/coverage")
async def get_incident_coverage(
    incident_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Coverage breakdown for a single incident."""
    tag_counts: dict[str, int] = {}

    timeline_result = await db.execute(
        text("SELECT tags FROM timeline_events WHERE incident_id = :iid AND jsonb_array_length(tags) > 0"),
        {"iid": incident_id},
    )
    for (tags,) in timeline_result:
        for tag in (tags or []):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1

    task_result = await db.execute(
        text("SELECT framework_tags FROM incident_tasks WHERE incident_id = :iid AND jsonb_array_length(framework_tags) > 0"),
        {"iid": incident_id},
    )
    for (tags,) in task_result:
        for tag in (tags or []):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1

    coverage = {}
    for fw_key, fw in FRAMEWORKS.items():
        covered = []
        uncovered = []
        for cat in fw["categories"]:
            tag_id = f"{fw_key}:{cat['id']}"
            count = tag_counts.get(tag_id, 0)
            entry = {**cat, "tag": tag_id, "count": count}
            (covered if count > 0 else uncovered).append(entry)
        coverage[fw_key] = {
            "name": fw["name"],
            "covered": covered,
            "uncovered": uncovered,
            "coverage_pct": round(len(covered) / len(fw["categories"]) * 100) if fw["categories"] else 0,
        }

    return coverage
