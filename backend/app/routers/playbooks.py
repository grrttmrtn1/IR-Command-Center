import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.playbook import Playbook
from app.models.incident import Incident, IncidentTask, TaskStatus, Priority
from app.models.user import User, UserRole
from app.schemas.playbook import PlaybookCreate, PlaybookUpdate, PlaybookResponse, PlaybookActivateRequest
from app.middleware.auth import get_current_user, require_role

router = APIRouter(prefix="/api/playbooks", tags=["playbooks"])

# ---------------------------------------------------------------------------
# Built-in playbooks seeded on first DB access
# ---------------------------------------------------------------------------

def _step(order: int, title: str, description: str, role: str, phase: str,
          is_decision_point: bool = False, escalation_trigger: str | None = None) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "order": order,
        "title": title,
        "description": description,
        "role": role,
        "phase": phase,
        "is_decision_point": is_decision_point,
        "escalation_trigger": escalation_trigger,
    }


BUILTIN_PLAYBOOKS = [
    {
        "title": "Ransomware Response",
        "description": "End-to-end response playbook for ransomware incidents covering initial isolation through recovery and lessons learned.",
        "incident_type": "RANSOMWARE",
        "tags": ["ransomware", "encryption", "extortion"],
        "steps": [
            _step(1, "Confirm ransomware indicators", "Verify presence of encrypted files, ransom note, and suspicious processes. Capture screenshots of the ransom note before any remediation. Document the timestamp of first indicator.", "Analyst", "DETECTION"),
            _step(2, "Isolate affected systems immediately", "Disconnect affected endpoints from the network (unplug Ethernet, disable Wi-Fi). Do NOT power off — memory forensics may be needed. If VMs, pause rather than power off.", "IR Lead", "DETECTION"),
            _step(3, "Notify key stakeholders", "Alert CISO, Legal, and executive leadership. Engage cyber insurance carrier. Open a war room for coordination.", "IR Lead", "DETECTION", escalation_trigger="If incident scope expands beyond initial estimate → escalate to executive crisis team"),
            _step(4, "Identify ransomware variant and infection vector", "Analyze ransom note, encrypted file extensions, and known TTPs to identify the variant. Determine initial access vector (phishing, RDP, VPN exploit, supply chain).", "Analyst", "ANALYSIS"),
            _step(5, "Determine blast radius", "Identify all systems with encrypted files or suspicious activity. Map network shares, backup systems, and domain controllers for spread. Query EDR/SIEM for lateral movement indicators.", "Analyst", "ANALYSIS"),
            _step(6, "Assess data exfiltration", "Check for outbound data transfers in firewall/proxy logs. Review known exfiltration techniques for this variant. Search dark web monitoring alerts.", "Analyst", "ANALYSIS", is_decision_point=True, escalation_trigger="If data exfiltration confirmed → notify Legal immediately for breach notification assessment"),
            _step(7, "Disable compromised accounts and reset credentials", "Disable all accounts with evidence of compromise. Force password reset for privileged accounts. Rotate service account credentials for affected systems.", "IR Lead", "CONTAINMENT"),
            _step(8, "Block C2 infrastructure", "Block known C2 IP addresses and domains at firewall and DNS. Enable DNS sinkholing if available. Add threat intel IOCs to EDR blocklist.", "Analyst", "CONTAINMENT"),
            _step(9, "Preserve forensic evidence", "Create disk images of critical affected systems. Export firewall, proxy, and EDR logs. Preserve memory dumps if systems are still running.", "Analyst", "CONTAINMENT"),
            _step(10, "Ransom payment decision", "Evaluate: viability of recovery from backups, cost of downtime vs. ransom, whether payment guarantees decryption. Consult legal counsel and cyber insurer before any decision.", "CISO", "CONTAINMENT", is_decision_point=True, escalation_trigger="If payment is being considered → engage legal counsel and cyber insurer immediately; check OFAC sanctions lists"),
            _step(11, "Remove malware and persistence mechanisms", "Use EDR to hunt and remove all malware artifacts. Delete scheduled tasks, registry run keys, and startup items. Remove attacker-created accounts and SSH keys.", "Analyst", "ERADICATION"),
            _step(12, "Patch the initial access vector", "Apply patches for exploited vulnerabilities. Disable RDP/SMB if not required. Enforce MFA on VPN and remote access. Harden the environment to prevent reinfection.", "IR Lead", "ERADICATION"),
            _step(13, "Restore from clean backups", "Identify the last clean backup pre-infection. Restore to isolated environment and verify data integrity. Reconnect to network only after endpoint security validation.", "IR Lead", "RECOVERY"),
            _step(14, "Verify system integrity before reconnection", "Run full AV/EDR scan on restored systems. Validate backup integrity and verify no encrypted files remain. Conduct limited user access testing before full production cutover.", "Analyst", "RECOVERY"),
            _step(15, "Fulfill breach notification obligations", "Assess notification requirements per jurisdiction (GDPR 72hr, state breach notification laws, regulatory bodies). Draft notifications with Legal. Notify affected individuals if PII was exposed.", "Legal", "POST_INCIDENT"),
            _step(16, "Conduct After Action Review", "Document the full incident timeline. Identify root causes and control gaps. Produce lessons learned report. Update IR plan, playbooks, and training based on findings.", "IR Lead", "POST_INCIDENT"),
        ],
    },
    {
        "title": "Data Breach Response",
        "description": "Structured response playbook for unauthorized access to or disclosure of sensitive data, focused on scope determination, containment, and notification compliance.",
        "incident_type": "DATA_BREACH",
        "tags": ["data-breach", "pii", "notification", "gdpr"],
        "steps": [
            _step(1, "Confirm unauthorized access or disclosure", "Verify the breach is real and not a false positive. Identify the data source (database, file share, email, third-party). Document when the breach was discovered vs. when it began.", "Analyst", "DETECTION"),
            _step(2, "Identify data types and sensitivity", "Determine what types of data were involved: PII, PHI, financial records, credentials, IP, trade secrets. Data type determines regulatory notification obligations.", "Analyst", "ANALYSIS"),
            _step(3, "Scope: records, systems, and individuals affected", "Quantify how many records and individuals are affected. Identify all systems that store or processed the breached data. Map data flows to identify downstream exposure.", "Analyst", "ANALYSIS"),
            _step(4, "Identify initial access vector", "Determine how the breach occurred: SQL injection, credential stuffing, insider, misconfigured storage, third-party compromise. Identify the attacker's dwell time.", "Analyst", "ANALYSIS"),
            _step(5, "Assess regulatory notification triggers", "Evaluate breach against GDPR (72-hour notification), HIPAA, PCI-DSS, applicable state breach notification laws, and any sector-specific requirements. Document the assessment.", "Legal", "ANALYSIS", is_decision_point=True, escalation_trigger="If notification is required under GDPR or state law → engage Legal and begin drafting notifications immediately"),
            _step(6, "Revoke compromised credentials and session tokens", "Force logout all active sessions for affected accounts. Revoke API keys and OAuth tokens involved. Reset passwords for all accounts with evidence of compromise.", "IR Lead", "CONTAINMENT"),
            _step(7, "Patch or isolate the exploited vulnerability", "Immediately remediate the vulnerability used for initial access. If patching is not immediately possible, implement WAF rules or network isolation as a temporary control.", "IR Lead", "CONTAINMENT"),
            _step(8, "Enable enhanced monitoring", "Increase logging verbosity on affected systems. Deploy honeypot tokens near sensitive data. Alert on any further access to the affected data stores.", "Analyst", "CONTAINMENT"),
            _step(9, "Engage forensics (if needed)", "For large-scale or legally complex breaches, engage a third-party forensics firm to conduct independent investigation. Preserve chain of custody for all evidence.", "IR Lead", "CONTAINMENT"),
            _step(10, "Remove attacker access and persistence", "Hunt for and remove all backdoors, webshells, and persistence mechanisms. Verify attacker cannot re-enter through alternate paths.", "Analyst", "ERADICATION"),
            _step(11, "Notify legal counsel within 24 hours", "Brief Legal on scope, data types, and affected individuals. Initiate legal hold on all relevant logs and evidence. Assess litigation and regulatory exposure.", "IR Lead", "POST_INCIDENT"),
            _step(12, "Notify cyber insurer", "Report the incident to the cyber insurer per policy terms. Obtain approval for any significant remediation expenditures if required by policy.", "IR Lead", "POST_INCIDENT"),
            _step(13, "Draft and send breach notifications", "Draft notifications per jurisdiction requirements. Include required elements: what happened, what data, what actions taken, and what affected individuals should do. Meet all mandatory deadlines.", "Legal", "POST_INCIDENT"),
            _step(14, "After Action Review and improvements", "Document root cause analysis. Update data inventory and classification. Implement additional technical controls. Brief executive leadership and board if material.", "IR Lead", "POST_INCIDENT"),
        ],
    },
    {
        "title": "Insider Threat Response",
        "description": "Playbook for responding to malicious or negligent insider incidents. Emphasizes evidence preservation, HR/Legal coordination, and minimizing disruption to operations.",
        "incident_type": "INSIDER_THREAT",
        "tags": ["insider", "hr", "legal", "data-theft"],
        "steps": [
            _step(1, "Document initial indicators", "Record all observable indicators: unusual data access patterns, large downloads, after-hours activity, USB usage, policy violations, or third-party tip-offs. Do not alert the subject yet.", "Analyst", "DETECTION"),
            _step(2, "Preserve evidence before subject is aware", "Export access logs, DLP alerts, email records, and endpoint activity immediately. Create forensic copies of relevant systems. Preservation must precede any action against the subject.", "Analyst", "DETECTION"),
            _step(3, "Assess intent: malicious vs. accidental", "Analyze patterns to differentiate between malicious (exfiltration with cover, deliberate policy violations) and accidental (misconfigured sync, unintentional disclosure) activity.", "IR Lead", "ANALYSIS", is_decision_point=True, escalation_trigger="If malicious intent is confirmed → escalate to CISO, Legal, and HR immediately before any action"),
            _step(4, "Determine scope of data accessed or exfiltrated", "Identify all data the subject accessed beyond their normal patterns. Determine if data was copied externally (USB, email, cloud storage, print). Quantify exposure.", "Analyst", "ANALYSIS"),
            _step(5, "Brief HR and Legal — coordinate next steps", "Do NOT take action on the subject without HR and Legal alignment. Brief them on findings. Agree on timing and approach for access revocation, HR process, and potential law enforcement.", "IR Lead", "CONTAINMENT"),
            _step(6, "Restrict access covertly if malicious (if HR/Legal approve)", "If malicious: reduce access scope without fully revoking to avoid tipping off the subject while investigation continues. Monitor for further activity. Document all surveillance with Legal approval.", "IR Lead", "CONTAINMENT"),
            _step(7, "Preserve all forensic artifacts", "Capture email archives, DLP logs, endpoint forensics, badge access records, and physical access logs. Maintain strict chain of custody in case of litigation or law enforcement referral.", "Analyst", "CONTAINMENT"),
            _step(8, "Revoke all access per HR/Legal decision", "At the agreed time (often concurrent with HR action), revoke all system access, disable accounts, recover company devices, and change shared credentials the subject knew.", "IR Lead", "ERADICATION"),
            _step(9, "Identify and recover exfiltrated data if possible", "Contact receiving parties if data was sent externally. Issue legal holds or cease-and-desist if appropriate. Coordinate with Legal on data recovery strategy.", "Legal", "ERADICATION"),
            _step(10, "Coordinate with law enforcement if warranted", "For significant data theft or sabotage, file a police report and consider referring to FBI (for trade secret theft) or other agencies. Legal should lead this engagement.", "Legal", "POST_INCIDENT"),
            _step(11, "Review and tighten access controls", "Conduct a least-privilege access review across the organization. Implement data loss prevention controls. Review offboarding procedures. Evaluate insider threat monitoring tooling.", "IR Lead", "POST_INCIDENT"),
            _step(12, "After Action Review", "Document timeline and root cause. Update insider threat program policies. Brief leadership. Address any cultural or managerial factors that contributed to the incident.", "IR Lead", "POST_INCIDENT"),
        ],
    },
    {
        "title": "DDoS Response",
        "description": "Response playbook for Distributed Denial of Service attacks. Focuses on rapid mitigation, service continuity, and ISP/CDN coordination.",
        "incident_type": "DDOS",
        "tags": ["ddos", "availability", "mitigation"],
        "steps": [
            _step(1, "Confirm DDoS vs. legitimate traffic spike", "Verify this is a DDoS and not a legitimate traffic surge (product launch, news event). Check traffic characteristics: source distribution, request patterns, protocol mix. Review monitoring dashboards.", "Analyst", "DETECTION"),
            _step(2, "Identify attack type and targets", "Classify the attack: volumetric (bandwidth exhaustion), protocol (SYN flood, reflection), or application layer (HTTP flood, slow loris). Identify which services/IPs are targeted.", "Analyst", "ANALYSIS"),
            _step(3, "Assess current business impact", "Determine which services are degraded or unavailable. Quantify user impact and revenue impact if known. Communicate current status to stakeholders.", "IR Lead", "ANALYSIS"),
            _step(4, "Engage upstream ISP for traffic scrubbing", "Contact ISP's DDoS mitigation team. Request null-routing or traffic scrubbing for targeted IPs. Provide attack details and traffic samples. Get estimated mitigation timeline.", "IR Lead", "CONTAINMENT"),
            _step(5, "Activate DDoS mitigation service", "Engage contracted DDoS mitigation provider (e.g., Cloudflare, Akamai, Radware) if available. Redirect traffic through scrubbing center. Enable 'Under Attack' mode on CDN.", "Analyst", "CONTAINMENT"),
            _step(6, "Implement local traffic controls", "Apply rate limiting at load balancers and WAF. Block source IPs and ASNs if attack is narrowly sourced. Implement connection limits and challenge pages for suspicious traffic.", "Analyst", "CONTAINMENT"),
            _step(7, "Failover decision", "Evaluate whether to fail over to backup infrastructure, CDN-only serving, or static degraded mode to maintain some service availability during mitigation.", "IR Lead", "CONTAINMENT", is_decision_point=True, escalation_trigger="If primary infrastructure is completely unavailable → activate business continuity plan and failover procedures"),
            _step(8, "Monitor attack evolution", "Track attack size, vector changes, and mitigation effectiveness in real time. DDoS attacks often shift vectors — maintain monitoring and adjust mitigations accordingly.", "Analyst", "CONTAINMENT"),
            _step(9, "Restore services gradually as attack subsides", "Re-enable services incrementally as traffic normalizes. Monitor for attack resumption. Do not remove mitigations prematurely.", "IR Lead", "RECOVERY"),
            _step(10, "After Action Review and hardening", "Document the attack timeline, peak volumes, and mitigation effectiveness. Evaluate DDoS protection gaps. Review and update the DDoS runbook. Consider additional protective controls.", "IR Lead", "POST_INCIDENT"),
        ],
    },
    {
        "title": "Phishing / Business Email Compromise Response",
        "description": "Response playbook for phishing campaigns and Business Email Compromise (BEC) incidents. Covers scope identification, account remediation, and financial fraud response.",
        "incident_type": "PHISHING",
        "tags": ["phishing", "bec", "email", "credential-theft"],
        "steps": [
            _step(1, "Confirm phishing or BEC activity", "Validate the report: analyze email headers, links, and attachments. Determine if this is a targeted spear-phish, broad campaign, or BEC (account takeover or impersonation for fraud).", "Analyst", "DETECTION"),
            _step(2, "Identify all users who received or interacted with the email", "Search email gateway for similar messages across the organization. Identify users who clicked links, opened attachments, or replied. Export the list for remediation.", "Analyst", "DETECTION"),
            _step(3, "Determine what was delivered or harvested", "Did users enter credentials? Was malware delivered? Was a wire transfer or gift card request made? Answering this determines urgency and next steps.", "Analyst", "ANALYSIS"),
            _step(4, "Assess financial fraud indicators", "For BEC: check for unauthorized wire transfers, changes to vendor banking details, unauthorized access to financial systems, or requests to purchase gift cards.", "IR Lead", "ANALYSIS", is_decision_point=True, escalation_trigger="If financial fraud is confirmed or a wire transfer was made → contact the bank immediately (FBI IC3 recommends within 72 hours) and engage Legal"),
            _step(5, "Block malicious sender, domains, and URLs", "Add malicious sender addresses and domains to email gateway blocklist. Block malicious URLs at web proxy and DNS. Submit phishing samples to email security vendor.", "Analyst", "CONTAINMENT"),
            _step(6, "Force password reset for all users who interacted", "Require immediate password reset for all users who clicked links or may have entered credentials. Enforce this even if credential theft is unconfirmed.", "IR Lead", "CONTAINMENT"),
            _step(7, "Revoke active sessions for compromised accounts", "Invalidate all active sessions and OAuth tokens for accounts with confirmed or suspected credential compromise. This logs out attackers who have already authenticated.", "Analyst", "CONTAINMENT"),
            _step(8, "Notify affected users and provide guidance", "Send a clear communication to affected users explaining what happened, what they should do (change passwords, review sent items, check account rules), and who to contact with questions.", "IR Lead", "CONTAINMENT"),
            _step(9, "Hunt for persistence mechanisms if malware was delivered", "If attachments were opened: scan affected endpoints for malware, review for scheduled tasks, registry persistence, and C2 connections. Engage endpoint remediation as needed.", "Analyst", "ERADICATION"),
            _step(10, "Remove unauthorized email rules and forwarding", "Check all affected accounts for unauthorized forwarding rules, auto-forward, or inbox rules created by attackers. Remove and document any found.", "Analyst", "ERADICATION"),
            _step(11, "Mandatory security awareness training for affected users", "Require affected users to complete phishing awareness training. Consider organization-wide training if the campaign was broad. Run a follow-up simulated phishing exercise within 90 days.", "IR Lead", "POST_INCIDENT"),
            _step(12, "After Action Review", "Document how the phishing email bypassed controls. Review email security configuration (SPF, DKIM, DMARC). Assess MFA coverage. Update phishing reporting procedures.", "IR Lead", "POST_INCIDENT"),
        ],
    },
    {
        "title": "Malware / APT Response",
        "description": "Response playbook for malware infections and Advanced Persistent Threat (APT) activity. Covers detection, scoping, hunting, and full environment recovery.",
        "incident_type": "MALWARE",
        "tags": ["malware", "apt", "c2", "persistence"],
        "steps": [
            _step(1, "Confirm malware presence and catalog IOCs", "Validate alerts. Collect all available IOCs: file hashes, C2 IPs/domains, registry keys, mutex names, process names, and network signatures. Log the timestamp of first detection.", "Analyst", "DETECTION"),
            _step(2, "Classify: opportunistic vs. targeted (APT)", "Analyze malware characteristics, targeting, and TTPs. Commodity malware (ransomware, cryptominer) suggests opportunistic. Custom tooling, low-and-slow behavior, and specific targeting suggests APT.", "Analyst", "ANALYSIS", is_decision_point=True, escalation_trigger="If APT activity is suspected → notify CISO and consider engaging a specialized threat intelligence firm before broad containment"),
            _step(3, "Map C2 infrastructure and communication patterns", "Identify all C2 channels: HTTP/S, DNS tunneling, ICMP, legitimate service abuse (Pastebin, GitHub). Determine communication frequency and data volumes. Block but preserve logs.", "Analyst", "ANALYSIS"),
            _step(4, "Identify persistence mechanisms", "Search for all persistence: scheduled tasks, registry run keys, service installs, startup folders, WMI subscriptions, boot sector modifications. Document all found.", "Analyst", "ANALYSIS"),
            _step(5, "Map lateral movement and compromise scope", "Trace attacker movement: pass-the-hash, pass-the-ticket, Kerberoasting, lateral tool transfer. Identify all compromised accounts, systems, and data accessed. Build a compromise map.", "Analyst", "ANALYSIS"),
            _step(6, "Intelligence gathering decision (APT only)", "For APT: evaluate whether limited monitoring for intelligence gathering is appropriate before full eviction. This can reveal attacker objectives and full scope, but carries risk of further damage.", "CISO", "ANALYSIS", is_decision_point=True, escalation_trigger="If deciding to allow limited continued access for intelligence → require Legal and executive approval; set strict time limit"),
            _step(7, "Isolate confirmed compromised systems", "Network-isolate systems with confirmed compromise. Prioritize systems with active C2 activity or sensitive data access. Coordinate isolation to prevent tipping off the attacker prematurely (for APT).", "IR Lead", "CONTAINMENT"),
            _step(8, "Block C2 at network perimeter", "Add all identified C2 indicators to firewall, IPS, and DNS blocklists. Enable DNS RPZ sinkholing for C2 domains. Monitor for new C2 channels being established.", "Analyst", "CONTAINMENT"),
            _step(9, "Disable compromised accounts", "Disable all accounts with evidence of attacker use. Rotate Kerberos TGT (krbtgt reset if golden ticket suspected). Reset all privileged account credentials.", "IR Lead", "CONTAINMENT"),
            _step(10, "Remove all malware artifacts and persistence", "Execute on all confirmed compromised systems: remove malware binaries, delete persistence mechanisms, clean registry, remove attacker accounts. Verify each system with EDR.", "Analyst", "ERADICATION"),
            _step(11, "Hunt across environment for additional compromise", "Use all collected IOCs to hunt across the entire environment. Check systems not yet identified as compromised. Run threat hunting queries in EDR/SIEM.", "Analyst", "ERADICATION"),
            _step(12, "Rebuild compromised systems from known-good images", "For systems with deep compromise, rebuild from known-good images rather than attempting to clean. Validate no malware artifacts remain before reconnecting.", "IR Lead", "RECOVERY"),
            _step(13, "Rotate all credentials in scope of compromise", "Rotate all passwords, API keys, certificates, and service account credentials that may have been observed by the attacker. Prioritize privileged and externally-used credentials.", "IR Lead", "RECOVERY"),
            _step(14, "Share threat intelligence (if appropriate)", "Consider sharing IOCs with ISACs, government partners (CISA, FBI), and peer organizations after legal review. This helps the broader community defend against the same threat actor.", "CISO", "POST_INCIDENT"),
            _step(15, "After Action Review", "Produce a comprehensive incident report covering attacker TTPs, timeline, impact, and remediation. Identify detection gaps. Update detection rules. Conduct executive briefing.", "IR Lead", "POST_INCIDENT"),
        ],
    },
]


async def _seed_builtins(db: AsyncSession) -> None:
    for pb_data in BUILTIN_PLAYBOOKS:
        existing = await db.execute(
            select(Playbook).where(
                Playbook.is_system == True,
                Playbook.incident_type == pb_data["incident_type"],
            )
        )
        if existing.scalar_one_or_none():
            continue
        playbook = Playbook(
            id=str(uuid.uuid4()),
            title=pb_data["title"],
            description=pb_data["description"],
            incident_type=pb_data["incident_type"],
            is_system=True,
            is_active=True,
            steps=pb_data["steps"],
            tags=pb_data["tags"],
        )
        db.add(playbook)
    await db.commit()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[PlaybookResponse])
async def list_playbooks(
    incident_type: str | None = None,
    include_inactive: bool = False,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _seed_builtins(db)
    q = select(Playbook)
    if incident_type:
        q = q.where(Playbook.incident_type == incident_type)
    if not include_inactive:
        q = q.where(Playbook.is_active == True)
    q = q.order_by(Playbook.is_system.desc(), Playbook.title)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=PlaybookResponse, status_code=201)
async def create_playbook(
    body: PlaybookCreate,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    steps = [s.model_dump() for s in body.steps]
    for s in steps:
        if not s.get("id"):
            s["id"] = str(uuid.uuid4())
    playbook = Playbook(
        title=body.title,
        description=body.description,
        incident_type=body.incident_type,
        is_system=False,
        steps=steps,
        tags=body.tags,
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(playbook)
    await db.commit()
    await db.refresh(playbook)
    return playbook


@router.get("/{playbook_id}", response_model=PlaybookResponse)
async def get_playbook(
    playbook_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Playbook).where(Playbook.id == playbook_id))
    pb = result.scalar_one_or_none()
    if not pb:
        raise HTTPException(status_code=404, detail="Playbook not found")
    return pb


@router.patch("/{playbook_id}", response_model=PlaybookResponse)
async def update_playbook(
    playbook_id: str,
    body: PlaybookUpdate,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Playbook).where(Playbook.id == playbook_id))
    pb = result.scalar_one_or_none()
    if not pb:
        raise HTTPException(status_code=404, detail="Playbook not found")

    data = body.model_dump(exclude_none=True)
    if "steps" in data:
        steps = data["steps"]
        for s in steps:
            if not s.get("id"):
                s["id"] = str(uuid.uuid4())
        data["steps"] = steps

    for field, value in data.items():
        setattr(pb, field, value)
    pb.updated_by = user.id
    await db.commit()
    await db.refresh(pb)
    return pb


@router.delete("/{playbook_id}", status_code=204)
async def delete_playbook(
    playbook_id: str,
    user: User = Depends(require_role(UserRole.IR_LEAD)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Playbook).where(Playbook.id == playbook_id))
    pb = result.scalar_one_or_none()
    if not pb:
        raise HTTPException(status_code=404, detail="Playbook not found")
    if pb.is_system:
        raise HTTPException(status_code=403, detail="Cannot delete a system playbook — deactivate it instead")
    await db.delete(pb)
    await db.commit()


@router.post("/{playbook_id}/activate", status_code=201)
async def activate_playbook(
    playbook_id: str,
    body: PlaybookActivateRequest,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    """Seed an incident's task board from this playbook's steps."""
    pb_result = await db.execute(select(Playbook).where(Playbook.id == playbook_id))
    pb = pb_result.scalar_one_or_none()
    if not pb:
        raise HTTPException(status_code=404, detail="Playbook not found")

    inc_result = await db.execute(select(Incident).where(Incident.id == body.incident_id))
    incident = inc_result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    created_tasks = []
    for step in sorted(pb.steps, key=lambda s: s.get("order", 0)):
        priority = Priority.HIGH if step.get("is_decision_point") else Priority.MEDIUM
        task = IncidentTask(
            incident_id=body.incident_id,
            title=step.get("title", ""),
            description=step.get("description"),
            status=TaskStatus.TODO,
            priority=priority,
            sort_order=step.get("order", 0),
            labels=f"playbook:{pb.title[:30]}",
            created_by=user.id,
        )
        db.add(task)
        created_tasks.append(task)

    await db.commit()
    return {"created": len(created_tasks), "incident_id": body.incident_id, "playbook_id": playbook_id}
