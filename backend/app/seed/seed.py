"""
Run with: python -m app.seed.seed
Creates initial admin user, seeds assessment questions and document templates.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.config import settings
from app.database import Base
from app.models.user import User, UserRole
from app.models.assessment import AssessmentQuestion
from app.models.document import Document, DocCategory

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ASSESSMENT_QUESTIONS = [
    # Governance & Leadership (weight 1.5)
    ("Governance & Leadership", "Policy", "Does the organization have a documented Incident Response Policy approved by executive leadership?", "Policy should define scope, roles, responsibilities, and authority.", 1.5, 1),
    ("Governance & Leadership", "Sponsorship", "Is there designated executive sponsorship for the IR program?", "An executive sponsor with budget authority and accountability.", 1.5, 2),
    ("Governance & Leadership", "IR Function", "Does the organization have a dedicated incident response function or team?", "Internal IR team, retainer, or MSSP arrangement.", 1.5, 3),
    ("Governance & Leadership", "Budget", "Is there dedicated budget allocated for IR activities including tools, training, and retainers?", "Budget should cover tabletop exercises, IR retainer, and tooling.", 1.2, 4),
    ("Governance & Leadership", "Metrics", "Does the organization track IR metrics (MTTD, MTTR, incident counts) and report them to leadership?", "Regular metrics reporting to CISO and executive leadership.", 1.0, 5),

    # Playbooks & Procedures (weight 1.5)
    ("Playbooks & Procedures", "Coverage", "Are documented playbooks available for the organization's top 5 most likely incident types?", "Each playbook should cover detection, containment, eradication, and recovery steps.", 1.5, 10),
    ("Playbooks & Procedures", "Currency", "Have all playbooks been reviewed and updated within the last 12 months?", "Playbooks should be reviewed after every significant incident and annually.", 1.2, 11),
    ("Playbooks & Procedures", "Testing", "Have playbooks been tested through tabletop exercises within the last 12 months?", "Tabletop exercises validate that procedures work before an actual incident.", 1.5, 12),
    ("Playbooks & Procedures", "Accessibility", "Are playbooks accessible to IR team members offline/during an incident?", "Consider: offline copies, printed versions, out-of-band access.", 1.0, 13),
    ("Playbooks & Procedures", "Ransomware", "Is there a specific ransomware response playbook including decision criteria for legal, insurance, and payment considerations?", "Ransomware playbook is the most critical given prevalence.", 1.5, 14),

    # Detection & Alerting (weight 1.0)
    ("Detection & Alerting", "SIEM", "Is a SIEM or log aggregation solution deployed with correlation rules covering key threat scenarios?", "Coverage for lateral movement, privilege escalation, and data exfil.", 1.0, 20),
    ("Detection & Alerting", "EDR", "Is Endpoint Detection and Response (EDR) deployed on all managed endpoints?", "EDR coverage should include servers and workstations.", 1.0, 21),
    ("Detection & Alerting", "Alerting", "Are alerts routed to a human responder with documented escalation paths and SLAs?", "24/7 alert monitoring with defined escalation and response time SLAs.", 1.2, 22),
    ("Detection & Alerting", "Log Retention", "Are logs retained for a minimum of 12 months with 3 months hot/searchable?", "Regulatory requirements and forensic investigation require long retention.", 0.8, 23),

    # Communications Preparedness (weight 1.0)
    ("Communications Preparedness", "Templates", "Are pre-drafted notification templates available for key jurisdictions (GDPR, SEC 8-K, state AGs)?", "Pre-drafted templates reduce response time during an incident.", 1.2, 30),
    ("Communications Preparedness", "Legal Contacts", "Are legal counsel contacts (external breach counsel) documented and pre-engaged?", "Having a relationship before an incident saves critical time.", 1.2, 31),
    ("Communications Preparedness", "PR Contacts", "Are crisis communications and PR contacts identified and pre-briefed?", "Media management capability for significant incidents.", 1.0, 32),
    ("Communications Preparedness", "Regulatory Knowledge", "Does the IR team have documented knowledge of applicable regulatory notification obligations and timelines?", "GDPR 72h, SEC 4 business days, state AG timelines, HIPAA 60 days.", 1.2, 33),
    ("Communications Preparedness", "Out-of-Band", "Is there an out-of-band communication channel established for use during incidents?", "Assume primary communication channels may be compromised.", 1.0, 34),

    # Evidence & Forensics (weight 0.8)
    ("Evidence & Forensics", "Chain of Custody", "Are documented evidence handling and chain of custody procedures in place?", "Critical for legal admissibility and insurance claims.", 1.0, 40),
    ("Evidence & Forensics", "Forensic Tools", "Does the IR team have access to forensic investigation tools and trained personnel?", "Disk imaging, memory forensics, log analysis capabilities.", 0.8, 41),
    ("Evidence & Forensics", "Preservation", "Is there a documented process for legal hold and evidence preservation?", "Prevent destruction of evidence required for investigation or litigation.", 1.0, 42),

    # Recovery & Continuity (weight 0.8)
    ("Recovery & Continuity", "Backups", "Are backups tested for restoreability on a regular schedule with results documented?", "Untested backups frequently fail during actual recovery.", 1.2, 50),
    ("Recovery & Continuity", "RTO/RPO", "Are Recovery Time Objectives (RTO) and Recovery Point Objectives (RPO) defined and tested for critical systems?", "Know how long recovery should take and how much data loss is acceptable.", 1.0, 51),
    ("Recovery & Continuity", "BCP", "Is a Business Continuity Plan (BCP) in place and tested?", "BCP should cover manual workarounds for key business functions.", 0.8, 52),
    ("Recovery & Continuity", "Backup Isolation", "Are backup systems isolated from the production network to prevent ransomware encryption?", "Offline, air-gapped, or immutable backups are critical for ransomware defense.", 1.2, 53),
]

DOCUMENT_TEMPLATES = [
    ("Incident Response Plan", "Master IR plan covering governance, roles, process, and procedures.", DocCategory.POLICY, """# Incident Response Plan

## 1. Purpose and Scope
This Incident Response Plan (IRP) establishes the organization's approach to detecting, analyzing, containing, eradicating, and recovering from cybersecurity incidents.

## 2. Incident Classification
### Severity Levels
| Severity | Description | Response Time |
|----------|-------------|---------------|
| CRITICAL | Active breach, ransomware, data exfiltration | Immediate (< 1 hour) |
| HIGH | Suspected compromise, significant system impact | < 4 hours |
| MEDIUM | Detected malware, policy violation, limited impact | < 24 hours |
| LOW | Security alerts requiring investigation | < 72 hours |

## 3. Roles and Responsibilities
- **Incident Commander (IC)**: Overall accountability; declaration authority
- **IR Lead**: Technical response coordination
- **Legal Counsel**: Notification obligations; attorney-client privilege
- **Communications Lead**: Internal and external communications
- **CISO**: Executive escalation; resource authorization

## 4. Response Phases
### Phase 1: Detection & Analysis
- Triage and validate the incident
- Classify severity and type
- Activate IR team
- Establish secure communications channel

### Phase 2: Containment
- Isolate affected systems
- Preserve evidence
- Prevent further spread

### Phase 3: Eradication
- Remove threat actor access
- Patch vulnerabilities
- Validate remediation

### Phase 4: Recovery
- Restore systems from clean backups
- Monitor for reinfection
- Validate normal operations

### Phase 5: Post-Incident
- Conduct lessons learned review within 2 weeks
- Update playbooks
- Report metrics to leadership

## 5. Communication Protocol
- Internal: [Secure channel - document here]
- Executive notifications: Within [X hours] for CRITICAL/HIGH
- Legal counsel: Immediate for any potential breach
- Regulatory notifications: Per applicable law timelines

## 6. Document History
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | [DATE] | [AUTHOR] | Initial release |
"""),

    ("Ransomware Response Playbook", "Step-by-step ransomware response procedures.", DocCategory.PLAYBOOK, """# Ransomware Response Playbook

## Immediate Response (First 4 Hours)

### Detection & Validation
- [ ] Confirm ransomware infection (encrypted files, ransom note)
- [ ] Identify patient zero (first infected system)
- [ ] Determine ransomware family if possible
- [ ] Activate Incident Response Plan

### Containment (Do This First)
- [ ] **IMMEDIATELY** isolate affected systems from network (pull network cable or disable NICs)
- [ ] Disable wireless on affected systems
- [ ] Notify IT/Security team — do NOT email if email may be compromised
- [ ] Identify and isolate systems showing abnormal behavior
- [ ] Check for active directory compromise
- [ ] Disable compromised accounts

### Preserve Evidence Before Remediation
- [ ] Capture memory dumps of affected systems before shutdown
- [ ] Preserve system logs (Windows Event Logs, Sysmon, AV logs)
- [ ] Photograph ransom note screen
- [ ] Document all encrypted file extensions and locations

## Short-Term Actions (4-24 Hours)

### Assessment
- [ ] Inventory all affected systems and data
- [ ] Assess backup integrity — are backups clean and intact?
- [ ] Check for data exfiltration indicators (pre-encryption outbound traffic)
- [ ] Identify initial access vector
- [ ] Check threat actor group for known decryptors (nomoreransom.org)

### Notify Required Parties
- [ ] Legal counsel — immediately
- [ ] Cyber insurance carrier — immediately (per policy terms)
- [ ] CISO and executive leadership
- [ ] FBI IC3 (ic3.gov) — recommended
- [ ] CISA if critical infrastructure

### Decision Framework
Work through the Ransomware Decision Support tool with legal counsel and leadership.

## Recovery Planning

### Option A: Restore from Backup
- Verify backup integrity before starting
- Build clean environment if possible
- Restore and validate each system
- Monitor for reinfection
- Estimated timeline: [Based on your RTO]

### Option B: Rebuild
- Used when backups are insufficient or unavailable
- Estimated timeline: [Document per system]

## Post-Incident
- [ ] Root cause analysis
- [ ] Remediate initial access vector
- [ ] Implement detection for TTPs used
- [ ] Update this playbook
- [ ] Executive briefing
- [ ] Regulatory notifications (assess obligations)
"""),

    ("Data Breach Response Playbook", "Procedures for responding to unauthorized data access or exfiltration.", DocCategory.PLAYBOOK, """# Data Breach Response Playbook

## Immediate Actions (0-4 Hours)

### Confirm and Scope the Breach
- [ ] Validate the breach (rule out false positive)
- [ ] Identify affected systems and data repositories
- [ ] Determine data types involved:
  - PII (names, SSNs, addresses)
  - PHI (health information)
  - Financial data (credit cards, bank accounts)
  - Credentials
  - Intellectual property
  - Other sensitive data

### Containment
- [ ] Revoke unauthorized access
- [ ] Patch exploited vulnerability or close attack vector
- [ ] Preserve logs and evidence

### Notify
- [ ] Legal counsel — immediately
- [ ] Cyber insurance carrier — immediately
- [ ] CISO and executive leadership

## Assessment (4-72 Hours)

### Data Inventory
- [ ] Estimated number of individuals affected
- [ ] Jurisdictions where affected individuals reside
- [ ] Data types confirmed exposed
- [ ] Timeline of unauthorized access

### Notification Obligation Assessment
| Jurisdiction | Trigger | Deadline | Required? |
|-------------|---------|----------|-----------|
| GDPR Art. 33 | Personal data breach | 72 hours | [ ] |
| SEC 8-K | Material incident | 4 business days | [ ] |
| HIPAA | PHI breach | 60 days | [ ] |
| CA (CCPA) | CA residents affected | Expedient | [ ] |
| [Other states] | Residents affected | [Per state law] | [ ] |

## Notifications

### Regulatory/Government
- [ ] GDPR supervisory authority (if applicable)
- [ ] SEC filing (if public company and material)
- [ ] HHS OCR (if HIPAA applies)
- [ ] State AG notifications (per applicable state laws)

### Affected Individuals
- [ ] Draft notification letter with legal review
- [ ] Determine delivery method (mail, email, substitute notice)
- [ ] Establish call center / FAQ page
- [ ] Consider credit monitoring offer

### Partners/Vendors
- [ ] Notify per contractual obligations
- [ ] Assess if third-party data was involved

## Recovery
- [ ] Remediate all vulnerabilities
- [ ] Implement additional monitoring
- [ ] Document all actions taken
- [ ] Post-incident review
"""),

    ("Evidence Chain of Custody Form", "Template for documenting evidence collection and handling.", DocCategory.EVIDENCE, """# Evidence Chain of Custody Form

**Incident ID:** _______________
**Date/Time of Collection:** _______________
**Collected By:** _______________
**Location of Evidence:** _______________

## Evidence Description

| Item # | Description | Identifier (Hash/Serial) | Size | Media Type |
|--------|-------------|--------------------------|------|------------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

## Collection Method
- [ ] Disk image (tool used: _______________)
- [ ] Memory dump (tool used: _______________)
- [ ] Log export
- [ ] Screenshot/Photo
- [ ] Physical device seizure
- [ ] Network capture
- [ ] Other: _______________

## Hash Verification
| Item # | Hash Algorithm | Hash Value | Verified By |
|--------|---------------|------------|-------------|
| 1 | SHA-256 | | |
| 2 | SHA-256 | | |

## Chain of Custody Log

| Date/Time | Action | By | To | Reason |
|-----------|--------|----|----|--------|
| | Collected | | IR Lead | Initial collection |
| | | | | |
| | | | | |

## Storage Location
Current location of evidence: _______________
Access restricted to: _______________

## Signatures
Collected by: _______________ Date: _______________
Received by: _______________ Date: _______________
"""),

    ("Post-Incident Review Report", "Template for documenting lessons learned after an incident.", DocCategory.PROCEDURE, """# Post-Incident Review Report

**Incident Title:** _______________
**Incident ID:** _______________
**Review Date:** _______________
**Facilitator:** _______________
**Attendees:** _______________

## Executive Summary
[2-3 paragraph summary of the incident, impact, and key findings]

## Incident Timeline
| Date/Time | Event |
|-----------|-------|
| | Detection |
| | IR Team Activated |
| | Containment Achieved |
| | Recovery Complete |
| | Incident Closed |

**Mean Time to Detect (MTTD):** _______________
**Mean Time to Respond (MTTR):** _______________
**Mean Time to Recover:** _______________

## Root Cause Analysis
### Technical Root Cause
[How the attacker gained access / how the incident occurred]

### Contributing Factors
1.
2.
3.

## What Went Well
1.
2.
3.

## What Could Be Improved
1.
2.
3.

## Action Items
| # | Action Item | Owner | Due Date | Priority |
|---|-------------|-------|----------|----------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

## Regulatory & Legal Outcomes
- Notifications made:
- Regulatory inquiries:
- Legal actions:
- Insurance claims:

## Approvals
CISO: _______________ Date: _______________
Legal: _______________ Date: _______________
"""),

    ("Executive Briefing Template", "Template for executive-level incident briefings.", DocCategory.COMMUNICATION, """# Incident Executive Briefing

**Classification:** CONFIDENTIAL — FOR EXECUTIVE REVIEW ONLY
**Date/Time:** _______________
**Prepared By:** _______________

---

## Situation Summary
[2-3 sentences: What happened, when, and initial scope]

## Business Impact
- **Systems Affected:**
- **Operations Impacted:**
- **Estimated Financial Impact:**
- **Customer Impact:**

## Current Status
**Incident Phase:** [Detection / Analysis / Containment / Eradication / Recovery]
**Containment Achieved:** [ ] Yes  [ ] No  [ ] Partial

## Actions Taken
1.
2.
3.

## Immediate Next Steps (Next 24-48 Hours)
1.
2.
3.

## Decisions Required from Leadership
1. [ ]
2. [ ]

## Regulatory/Legal Obligations
- Notification obligations triggered:
- Legal counsel engaged: [ ] Yes  [ ] No
- Insurance carrier notified: [ ] Yes  [ ] No

## Next Briefing
**Scheduled:** _______________
**IR Lead Contact:** _______________

---
*This document is subject to attorney-client privilege. Do not forward without counsel approval.*
"""),

    ("GDPR Article 33 Notification Template", "Template for notifying supervisory authority under GDPR Article 33.", DocCategory.COMMUNICATION, """# GDPR Article 33 Supervisory Authority Notification

**To:** [Supervisory Authority / Lead DPA]
**Date:** [DATE — must be within 72 hours of awareness]
**Organization:** [ORGANIZATION NAME]
**DPO:** [NAME, EMAIL, PHONE]

---

## 1. Nature of the Personal Data Breach

**Date/Time of Breach:** _______________
**Date/Time Organization Became Aware:** _______________
**Categories of Personal Data Involved:**
- [ ] Name and contact information
- [ ] Financial data
- [ ] Health data (special category)
- [ ] Criminal record data (special category)
- [ ] Children's data
- [ ] Authentication credentials
- [ ] Other: _______________

**Approximate Number of Data Subjects Affected:** _______________
**Approximate Number of Records Affected:** _______________

**Description of the Breach:**
[Describe what happened — how the breach occurred, what systems were involved, and how data was exposed]

## 2. Categories and Approximate Number of Data Subjects

**Data Subject Categories:**
- [ ] Customers/Clients
- [ ] Employees
- [ ] Partners/Vendors
- [ ] Other: _______________

## 3. Contact Details of DPO or Other Contact Point

**Name:** _______________
**Title:** Data Protection Officer
**Email:** _______________
**Phone:** _______________

## 4. Likely Consequences of the Breach

[Describe the likely consequences — identity theft risk, financial harm, discrimination risk, reputational harm, etc.]

## 5. Measures Taken or Proposed

**Containment actions taken:**
1.
2.
3.

**Mitigation measures:**
1.
2.

**Measures to address adverse effects:**
1.
2.

---

*Note: If this notification is being provided in phases per Article 33(4), indicate reason for delay and expected timeline for complete notification.*

**Notified By:** _______________
**Title:** _______________
**Signature:** _______________
"""),

    ("SEC 8-K Cybersecurity Incident Draft", "Draft template for SEC Form 8-K Item 1.05 cybersecurity incident disclosure.", DocCategory.COMMUNICATION, """# UNITED STATES SECURITIES AND EXCHANGE COMMISSION
# Washington, D.C. 20549

# FORM 8-K

## CURRENT REPORT
**Pursuant to Section 13 or 15(d) of The Securities Exchange Act of 1934**

**Date of Report (Date of earliest event reported):** [DATE INCIDENT DETERMINED MATERIAL]

**[COMPANY NAME]**
(Exact name of registrant as specified in its charter)

[State of Incorporation] | [Commission File Number] | [IRS EIN]

[Address]
[City, State, ZIP]
[(Phone)]

---

## Item 1.05 Material Cybersecurity Incidents

On [DATE], [COMPANY NAME] (the "Company") determined that it was the subject of a cybersecurity incident that [the Company believes is/may be] material (the "Incident").

### Nature of the Incident
[Describe the nature and scope of the incident — what occurred, when it was discovered, what systems were affected]

### Timing
The Company first detected the Incident on approximately [DATE]. Upon detection, the Company [describe immediate response actions].

### Scope and Impact
[Describe the scope of the incident — what data or systems were affected. Describe any material impact on operations, finances, customers, or other stakeholders]

### Materiality Assessment
The Company has determined that the Incident [is/may be] material based on [describe the factors considered in the materiality determination].

### Response
The Company has taken the following actions in response to the Incident:
1. [Action 1]
2. [Action 2]
3. [Action 3]

The Company has engaged [outside cybersecurity experts/counsel] to assist with the investigation and response.

### Forward-Looking Statements
This report contains forward-looking statements within the meaning of [applicable securities law]. Actual results may differ materially...

---

*DRAFT — SUBJECT TO LEGAL REVIEW — DO NOT FILE WITHOUT COUNSEL APPROVAL*

*Note: This disclosure must be filed within 4 business days of determining the incident is material under SEC rules effective December 18, 2023.*
"""),
]


async def seed():
    engine = create_async_engine(settings.database_url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    async with SessionLocal() as db:
        # Create super admin user
        from sqlalchemy import select
        result = await db.execute(select(User).where(User.email == "admin@ircc.local"))
        admin = result.scalar_one_or_none()
        if not admin:
            admin = User(
                email="admin@ircc.local",
                name="IR Command Center Admin",
                password_hash=pwd_context.hash("ChangeMe123!"),
                role=UserRole.SUPER_ADMIN,
            )
            db.add(admin)
            await db.flush()
            print("Created admin user: admin@ircc.local / ChangeMe123!")

        # Seed assessment questions
        result = await db.execute(select(AssessmentQuestion).limit(1))
        if not result.scalar_one_or_none():
            for cat, subcat, question, desc, weight, order in ASSESSMENT_QUESTIONS:
                db.add(AssessmentQuestion(
                    category=cat,
                    subcategory=subcat,
                    question=question,
                    description=desc,
                    weight=weight,
                    sort_order=order,
                ))
            print(f"Seeded {len(ASSESSMENT_QUESTIONS)} assessment questions")

        # Seed document templates
        result = await db.execute(select(Document).where(Document.is_system_template == True).limit(1))
        if not result.scalar_one_or_none():
            for title, description, category, content in DOCUMENT_TEMPLATES:
                db.add(Document(
                    title=title,
                    description=description,
                    category=category,
                    content=content,
                    is_template=True,
                    is_system_template=True,
                    tags="template,system",
                    created_by=admin.id,
                ))
            print(f"Seeded {len(DOCUMENT_TEMPLATES)} document templates")

        await db.commit()

    await engine.dispose()
    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
