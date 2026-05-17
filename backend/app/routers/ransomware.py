"""
Ransomware Decision Support — structured conversation framework with session persistence.
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models.ransomware import RansomwareSession
from app.models.user import User, UserRole
from app.middleware.auth import get_current_user, require_role

router = APIRouter(prefix="/api/ransomware", tags=["ransomware"])

FRAMEWORK = {
    "phases": [
        {
            "id": "initial_triage",
            "title": "Initial Triage",
            "color": "red",
            "description": "Establish the basic facts before any decisions are made. These answers determine the urgency and shape every downstream decision.",
            "why_it_matters": "Accurate scoping prevents both under-reaction (missing affected systems) and over-reaction (paying ransom when backups are viable). Document everything — it is evidence.",
            "questions": [
                {
                    "id": "enc_scope",
                    "question": "What systems and data have been encrypted?",
                    "guidance": "List every affected system, its business criticality (production/dev/DR), and data types (PII, financial, IP, PHI). Categorise by tier.",
                    "risk_signal": "If Tier-1 production systems or PHI/PII are involved, assume regulatory notification is required and legal must be looped in immediately.",
                },
                {
                    "id": "backups_status",
                    "question": "What is the status of your backups?",
                    "guidance": "Confirm backups are isolated from the affected network. Test restore if time permits. Determine the most recent verified clean restore point and what data loss that represents.",
                    "risk_signal": "Compromised or absent backups dramatically change the cost-benefit calculus for ransom payment. This is the single most important technical factor.",
                },
                {
                    "id": "attacker_contact",
                    "question": "Has the attacker made contact? What are their demands?",
                    "guidance": "Preserve all communications verbatim. Do not respond without legal counsel present. Note the wallet address, demanded amount, and any 'proof of life' decryption they offer.",
                    "risk_signal": "Rapid escalating demands or a named leak site indicate a sophisticated actor with greater leverage. Silence from the attacker can mean they're still in the environment.",
                },
                {
                    "id": "ransom_deadline",
                    "question": "Is there a stated deadline? When?",
                    "guidance": "Note the deadline but do not treat it as absolute — threat actors routinely extend. Deadlines are a pressure tactic. Do not let artificial urgency rush legal or technical analysis.",
                    "risk_signal": None,
                },
                {
                    "id": "data_exfil",
                    "question": "Is there evidence of data exfiltration prior to encryption?",
                    "guidance": "Review firewall logs, DLP alerts, and cloud egress for anomalous outbound transfers in the 2–4 weeks prior. Many groups exfiltrate before encrypting to enable double-extortion.",
                    "risk_signal": "Confirmed exfiltration triggers breach notification obligations regardless of whether ransom is paid. It also removes the attacker's sole negotiating leverage.",
                },
            ],
        },
        {
            "id": "legal",
            "title": "Legal & Regulatory",
            "color": "purple",
            "description": "Questions your legal team should work through with you. Conduct these discussions under attorney-client privilege where possible.",
            "why_it_matters": "Payment decisions, notification timing, and evidence preservation all have legal consequences. Missteps here can compound the incident into regulatory enforcement actions.",
            "questions": [
                {
                    "id": "notification_obligations",
                    "question": "What regulatory and contractual notification obligations have been triggered?",
                    "guidance": "Map each data type and jurisdiction. Key deadlines: GDPR Art.33 = 72h to supervisory authority; SEC 8-K = 4 business days if material; HIPAA Breach Rule = 60 days; state AG laws vary 30–90 days. Check cyber insurance policy notification requirements separately.",
                    "risk_signal": "Missing a regulatory notification window is a separate enforcement action on top of the breach. Prioritise the 72-hour GDPR window immediately.",
                },
                {
                    "id": "law_enforcement",
                    "question": "Should you engage law enforcement? Which agency?",
                    "guidance": "FBI IC3 (ic3.gov) and CISA are standard first contacts. FBI field offices often have dedicated cyber squads with threat intelligence on specific groups. Law enforcement engagement can unlock classified decryptors and complicate attacker operations.",
                    "risk_signal": "Law enforcement cannot force you to share information but may require it as a condition of assistance. Weigh operational security carefully.",
                },
                {
                    "id": "payment_legality",
                    "question": "Are there OFAC sanctions implications to consider for any payment?",
                    "guidance": "OFAC's SDN list includes several ransomware groups. Paying a designated entity — even unknowingly — violates US law. Your counsel and a specialist IR firm (Coveware, Mandiant, etc.) must screen the threat actor before any payment discussion.",
                    "risk_signal": "This is a hard legal blocker. If the group is OFAC-designated, payment is not a legal option regardless of business impact.",
                },
                {
                    "id": "legal_privilege",
                    "question": "Are IR communications and findings protected under attorney-client privilege?",
                    "guidance": "Engage the IR firm through legal counsel where possible. Use 'Prepared at the direction of counsel in anticipation of litigation' headers on reports. Avoid documenting candid assessments in email threads outside privilege.",
                    "risk_signal": None,
                },
                {
                    "id": "civil_liability",
                    "question": "What civil liability exposure exists?",
                    "guidance": "Affected customers, partners, and regulators may have claims. Document every response action and decision with timestamps. Demonstrating reasonable care is essential even when breach notification is unavoidable.",
                    "risk_signal": None,
                },
            ],
        },
        {
            "id": "insurance",
            "title": "Insurance",
            "color": "blue",
            "description": "Your cyber insurance policy has specific requirements. Failing to follow them can void coverage.",
            "why_it_matters": "A $10M ransomware event with $5M coverage is manageable. A $10M event where coverage is voided due to late notification or unapproved vendors is a company-threatening scenario.",
            "questions": [
                {
                    "id": "policy_notified",
                    "question": "Has your cyber insurance carrier been notified per policy terms?",
                    "guidance": "Most policies require notification within 24–72 hours of discovery. Contact your broker immediately. Request a coverage summary call. Do not make major decisions without understanding your coverage position.",
                    "risk_signal": "Delayed notification is the most common reason claims are disputed. Do this today, before the forensic analysis is complete.",
                },
                {
                    "id": "coverage_scope",
                    "question": "What does your policy cover?",
                    "guidance": "Review: ransom payment coverage (amount and conditions), business interruption (waiting period, sublimit), forensic costs, notification/credit monitoring, legal defense, regulatory fines. Know your retention (deductible) and sublimits by category.",
                    "risk_signal": None,
                },
                {
                    "id": "approved_vendors",
                    "question": "Does your policy require use of carrier-approved IR vendors?",
                    "guidance": "Many policies only cover expenses from vendors on an approved panel. Using an unapproved vendor — even an excellent one — may result in uncovered costs. Confirm before engaging.",
                    "risk_signal": "Engaging an unapproved vendor is a common, costly mistake. Verify the panel before signing any IR firm engagement letters.",
                },
                {
                    "id": "cooperation",
                    "question": "What cooperation does the carrier require during the response?",
                    "guidance": "Carriers typically require access to investigation findings and may deploy their own forensic team. Understand what you are obligated to share and whether it conflicts with privilege protections.",
                    "risk_signal": None,
                },
                {
                    "id": "payment_coverage",
                    "question": "If ransom payment is considered, what is the carrier's role and coverage?",
                    "guidance": "Some carriers have pre-established relationships with professional negotiators and can run the negotiation process. Coverage for payment may require carrier approval, OFAC screening, and proof no alternatives existed. Get this in writing before proceeding.",
                    "risk_signal": "Paying ransom without carrier approval may void the ransom payment portion of coverage.",
                },
            ],
        },
        {
            "id": "technical",
            "title": "Technical Assessment",
            "color": "green",
            "description": "Technical factors that directly inform the business decision. Get honest, documented estimates — not optimistic projections.",
            "why_it_matters": "If recovery from backups takes 3 days, the business decision is different than if it takes 3 weeks. Technical honesty here determines whether payment is a viable alternative.",
            "questions": [
                {
                    "id": "recovery_feasibility",
                    "question": "What is the realistic recovery timeline from backups, and what data loss is acceptable?",
                    "guidance": "Get honest estimates from your technical team — add 50% buffer for unexpected issues. Include: time to rebuild infrastructure, restore data, patch the initial access vector, and verify integrity. Compare to business interruption cost.",
                    "risk_signal": "If backup recovery will take longer than 2–3 weeks for critical systems, the financial case for exploring decryption strengthens significantly.",
                },
                {
                    "id": "decryption_tools",
                    "question": "Are public decryption tools available for this ransomware family?",
                    "guidance": "Check the No More Ransom Project (nomoreransom.org), ID Ransomware (id-ransomware.malwarehunterteam.com), and your IR firm's threat intelligence. Some families have published or leaked decryptors following law enforcement action.",
                    "risk_signal": "A working free decryptor changes the entire calculus — verify it before any other discussion.",
                },
                {
                    "id": "decryptor_reliability",
                    "question": "If paying were considered, how reliable are decryptors from this threat actor?",
                    "guidance": "Research the group's track record. Reputable IR firms track payment outcomes by ransomware family. Some groups (e.g., LockBit, Conti at peak) reliably provided working decryptors; others do not, especially opportunistic groups or those under law enforcement pressure.",
                    "risk_signal": "Groups facing imminent law enforcement action may be unable or unwilling to deliver decryptors even after payment.",
                },
                {
                    "id": "root_cause",
                    "question": "Has the initial access vector been identified and closed?",
                    "guidance": "Restoring from backup or decrypting without addressing root cause risks re-encryption within hours. Common vectors: unpatched VPN (Fortinet, Pulse, Cisco), RDP exposure, phishing + credential compromise, supply chain.",
                    "risk_signal": "Do not begin restoration until root cause is confirmed and the vector is closed or monitored. Re-encryption is not covered as a second event by most policies.",
                },
                {
                    "id": "persistence",
                    "question": "Is there evidence of persistent access mechanisms left by the attacker?",
                    "guidance": "Hunt for: additional backdoors (webshells, remote access tools), added admin/domain accounts, scheduled tasks, modified Group Policy, changed MFA settings, and tampered EDR configurations. This is a pre-condition for safe restoration.",
                    "risk_signal": "Attackers routinely maintain access after deployment. Assume persistence exists until proven otherwise through forensic analysis.",
                },
            ],
        },
        {
            "id": "business",
            "title": "Business Impact",
            "color": "orange",
            "description": "Quantify the business impact to set the upper bound for response costs and inform the final decision.",
            "why_it_matters": "The decision is ultimately a financial and reputational risk calculation. This section provides the numerators and denominators for that equation.",
            "questions": [
                {
                    "id": "operational_impact",
                    "question": "What operations are currently halted or degraded?",
                    "guidance": "Document specific business processes by category: revenue-generating, customer-facing, regulatory/compliance, supply chain. Assign a daily cost estimate to each. This is the core business interruption metric.",
                    "risk_signal": None,
                },
                {
                    "id": "financial_exposure",
                    "question": "What is the estimated total financial exposure from continued downtime?",
                    "guidance": "Calculate: daily revenue impact × projected recovery days + forensic/IR costs + notification/monitoring costs + regulatory fines (worst case) + legal defense. This is the total cost of non-payment route. Compare to ransom demand plus payment-route costs.",
                    "risk_signal": None,
                },
                {
                    "id": "reputational",
                    "question": "What is the reputational and market impact if this becomes public?",
                    "guidance": "Consider: customer trust (B2C vs B2B differs), media cycle duration, stock impact (if public — assume material disclosure regardless of payment), competitive implications, government contract implications.",
                    "risk_signal": "Public companies: SEC 8-K disclosure is mandatory if material. The disclosure itself — not the decision to pay — drives market reaction.",
                },
                {
                    "id": "third_parties",
                    "question": "Are third parties (customers, partners, suppliers) affected or at risk?",
                    "guidance": "Downstream impact creates contractual obligations, accelerates notification requirements, and may trigger your customers' own incident response protocols. Proactive notification to key partners often preserves relationships better than reactive disclosure.",
                    "risk_signal": "If you supply critical infrastructure or healthcare systems, downstream impacts may trigger mandatory reporting obligations for those sectors.",
                },
                {
                    "id": "critical_data",
                    "question": "Is there data that, if unrecoverable, would permanently impair operations?",
                    "guidance": "Identify: proprietary manufacturing formulas, source code, irreplaceable research data, litigation-hold documents, customer records with no secondary copy. These create a floor below which restoration is not fully viable.",
                    "risk_signal": "Truly irreplaceable data that cannot be reconstructed changes the recovery calculus fundamentally. Document it specifically.",
                },
            ],
        },
    ],
    "decision_options": [
        {"value": "DO_NOT_PAY", "label": "Do Not Pay — Restore from Backup/Rebuild", "description": "Viable when backups are intact, recovery timeline is acceptable, and technical root cause is addressed."},
        {"value": "PAY", "label": "Pay Ransom — After Legal/Insurance/OFAC Clearance", "description": "Considered when backups are unavailable or recovery timeline is catastrophic, and all legal/sanctions checks are clear."},
        {"value": "DEFER", "label": "Defer Decision — Gather More Information", "description": "When critical facts (backup viability, root cause, legal/OFAC status) are not yet confirmed."},
        {"value": "HYBRID", "label": "Hybrid — Parallel Tracks", "description": "Negotiate/stall the attacker while simultaneously pursuing backup recovery. Preserves options."},
        {"value": "UNDECIDED", "label": "Not Yet Determined", "description": "Initial state — decision pending."},
    ],
    "decision_documentation_fields": [
        {"id": "decision_makers", "label": "Who was involved in the decision?", "placeholder": "Names, titles, and organisations of all decision-makers present"},
        {"id": "legal_consulted", "label": "Legal counsel consulted", "placeholder": "Firm name, attorney name, date consulted"},
        {"id": "insurance_consulted", "label": "Insurance carrier/broker consulted", "placeholder": "Carrier, broker, date, coverage position confirmed"},
        {"id": "law_enforcement", "label": "Law enforcement notified/engaged", "placeholder": "Agency, agent name, case number, date"},
        {"id": "alternatives_considered", "label": "Alternatives considered and why rejected", "placeholder": "Document each alternative and the specific reason it was deemed insufficient"},
        {"id": "decision_time", "label": "Date and time decision was reached", "placeholder": "YYYY-MM-DD HH:MM timezone"},
    ],
}


class SessionCreate(BaseModel):
    incident_id: str | None = None


class SessionUpdate(BaseModel):
    answers: dict | None = None
    decision: str | None = None
    decision_rationale: str | None = None
    doc_fields: dict | None = None
    complete: bool = False


@router.get("/framework")
async def get_framework(user: User = Depends(require_role(UserRole.ANALYST))):
    return FRAMEWORK


@router.get("/sessions")
async def list_sessions(
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(
            select(RansomwareSession)
            .where(RansomwareSession.created_by == user.id)
            .order_by(RansomwareSession.created_at.desc())
        )
        return result.scalars().all()
    except Exception:
        return []


@router.post("/sessions", status_code=201)
async def create_session(
    body: SessionCreate,
    user: User = Depends(require_role(UserRole.IR_LEAD)),
    db: AsyncSession = Depends(get_db),
):
    try:
        session = RansomwareSession(
            id=str(uuid.uuid4()),
            incident_id=body.incident_id,
            answers={},
            created_by=user.id,
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        return session
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=503, detail="Session storage unavailable — database migration may be pending") from e


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(RansomwareSession).where(RansomwareSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.patch("/sessions/{session_id}")
async def update_session(
    session_id: str,
    body: SessionUpdate,
    user: User = Depends(require_role(UserRole.IR_LEAD)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(RansomwareSession).where(RansomwareSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if body.answers is not None:
        session.answers = body.answers
    if body.decision is not None:
        session.decision = body.decision
    if body.decision_rationale is not None:
        session.decision_rationale = body.decision_rationale
    if body.doc_fields is not None:
        # Store doc fields within answers under reserved prefix
        merged = dict(session.answers or {})
        for k, v in body.doc_fields.items():
            merged[f"_doc_{k}"] = v
        session.answers = merged
    if body.complete and not session.completed_at:
        session.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(session)
    return session


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    user: User = Depends(require_role(UserRole.IR_LEAD)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(RansomwareSession).where(RansomwareSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()


# Legacy endpoint — kept for backwards compatibility
@router.post("/session")
async def start_session_legacy(user: User = Depends(require_role(UserRole.IR_LEAD))):
    return {
        "framework": FRAMEWORK,
        "disclaimer": "This tool structures your decision-making process. It does not provide legal, financial, or operational advice. All decisions should be made in consultation with qualified counsel, your incident response team, and your insurance carrier.",
    }
