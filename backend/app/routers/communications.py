import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models.comms import CommsDraft, DraftStatus, CustomJurisdiction
from app.models.user import User, UserRole
from app.schemas.comms import CommsDraftCreate, CommsDraftUpdate, CommsDraftResponse, GenerateDraftRequest, JurisdictionInfo
from app.middleware.auth import get_current_user, require_role

router = APIRouter(prefix="/api/comms", tags=["communications"])

# Built-in jurisdiction database
BUILTIN_JURISDICTIONS: list[dict] = [
    {"code": "SEC_8K", "name": "SEC 8-K (Material Cybersecurity Incident)", "deadline_hours": 96, "threshold": "Material incident", "requirements": ["File Form 8-K Item 1.05 within 4 business days", "Describe nature, scope, timing, and material impact", "State whether material impact has been determined"], "contact_url": "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=8-K", "notes": "Applies to SEC reporting companies. 4-business-day clock starts when incident is determined material."},
    {"code": "GDPR_ART33", "name": "GDPR Article 33 (DPA Notification)", "deadline_hours": 72, "threshold": "Personal data breach", "requirements": ["Notify supervisory authority within 72 hours of awareness", "Describe nature, categories, and approximate number of individuals affected", "Name and contact details of DPO", "Describe likely consequences", "Describe measures taken or proposed"], "contact_url": "https://edpb.europa.eu/about-edpb/about-edpb/members_en", "notes": "Notification to lead DPA. If 72-hour deadline cannot be met, notify with reasons for delay."},
    {"code": "GDPR_ART34", "name": "GDPR Article 34 (Subject Notification)", "deadline_hours": None, "threshold": "High risk to individuals", "requirements": ["Notify affected individuals without undue delay", "Use clear and plain language", "Describe nature of breach", "Provide DPO contact", "Describe likely consequences", "Describe measures taken"], "contact_url": None, "notes": "Required when breach is likely to result in high risk to rights and freedoms of natural persons."},
    {"code": "HIPAA", "name": "HIPAA Breach Notification", "deadline_hours": 1440, "threshold": "500+ individuals in a state: media notification; Any breach: HHS notification", "requirements": ["Notify affected individuals within 60 days of discovery", "Notify HHS Secretary within 60 days", "If 500+ in a state: notify prominent media outlets", "Annual report to HHS if <500 individuals"], "contact_url": "https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html", "notes": "60-day window from date of discovery."},
    {"code": "CCPA", "name": "CCPA/CPRA (California Consumer Privacy Act)", "deadline_hours": None, "threshold": "Unauthorized access to nonencrypted/nonredacted personal information", "requirements": ["Notify affected California residents in the most expedient time possible", "Notification must describe the incident, information involved, and steps consumers can take", "May be required to notify CA AG if 500+ residents affected"], "contact_url": "https://oag.ca.gov/privacy/databreach", "notes": "CCPA provides a private right of action for statutory damages ($100-$750 per consumer per incident)."},
    {"code": "CUSTOMER", "name": "Customer Notification", "deadline_hours": None, "threshold": "Customer data affected", "requirements": ["Timely and transparent communication", "Describe what happened and what data was involved", "Steps taken to protect customers", "Recommended actions for customers", "Contact information for questions"], "contact_url": None, "notes": "Consider tone — factual, empathetic, clear. Avoid speculation."},
    {"code": "EMPLOYEE", "name": "Employee Notification", "deadline_hours": None, "threshold": "Employee data affected or operational impact", "requirements": ["Inform employees of operational impacts", "Describe protective actions they should take", "Do not share attorney-client privileged information", "Coordinate with HR and legal before sending"], "contact_url": None, "notes": "Balance transparency with operational security. Avoid details that could tip off insider threats."},
    {"code": "BOARD", "name": "Board/Executive Notification", "deadline_hours": None, "threshold": "Material incident", "requirements": ["High-level situation summary", "Business and financial impact assessment", "Regulatory/legal obligations triggered", "Response actions and resource needs", "Reputational and customer impact"], "contact_url": None, "notes": "Focus on business impact and decisions needed, not technical details."},
    {"code": "LAW_ENFORCEMENT", "name": "Law Enforcement / FBI IC3", "deadline_hours": None, "threshold": "Criminal activity suspected", "requirements": ["Report to FBI Internet Crime Complaint Center (IC3)", "Contact local FBI field office for active threats", "Preserve evidence before engaging", "Coordinate with legal counsel on disclosure scope"], "contact_url": "https://www.ic3.gov", "notes": "Reporting is generally voluntary but strongly recommended. Coordinate with counsel on what to share."},
    {"code": "STATE_CA", "name": "California AG Breach Notification", "deadline_hours": None, "threshold": "500+ California residents", "requirements": ["Notice in most expedient time possible", "Written notice or electronic notice", "Substitute notice if cost exceeds $250K or 500K+ persons"], "contact_url": "https://oag.ca.gov/privacy/databreach", "notes": "California SB-1386. Most stringent state law — 'most expedient time' standard."},
    {"code": "STATE_NY", "name": "New York SHIELD Act", "deadline_hours": None, "threshold": "NY residents", "requirements": ["Notify in most expedient time possible", "Notify NY AG, Consumer Protection Board, and State Police if 5,000+ NY residents"], "contact_url": "https://ag.ny.gov/resources/individuals/data-breach-notification", "notes": "NY SHIELD Act expands definition of private information."},
    {"code": "STATE_TX", "name": "Texas Identity Theft Enforcement and Protection Act", "deadline_hours": 1440, "threshold": "TX residents", "requirements": ["Notice as quickly as possible, no later than 60 days", "Notify TX AG if 250+ Texas residents affected"], "contact_url": "https://www.texasattorneygeneral.gov/dataprivacy/report-breach", "notes": "60-day deadline."},
    {"code": "STATE_FL", "name": "Florida Information Protection Act (FIPA)", "deadline_hours": 1080, "threshold": "FL residents", "requirements": ["Notice within 30 days of determination of breach", "Notify FL AG if 500+ Florida residents"], "contact_url": "https://csapp.fdacs.gov/csa/PublicDisclosure/Index", "notes": "30-day notification window from determination."},
    {"code": "STATE_IL", "name": "Illinois Personal Information Protection Act (PIPA)", "deadline_hours": None, "threshold": "IL residents", "requirements": ["Notice in most expedient time possible", "Notify IL AG if more than 500 Illinois residents"], "contact_url": "https://illinoisattorneygeneral.gov/", "notes": "Substitute notice allowed if cost exceeds $250,000 or 500,000+ persons."},
]

# Canned templates for each built-in jurisdiction
CANNED_TEMPLATES: dict[str, str] = {
    "SEC_8K": """Item 1.05. Material Cybersecurity Incidents.

On [DATE], [COMPANY NAME] (the "Company") determined that it was the subject of a cybersecurity incident that is reasonably likely to have a material impact on the Company.

**Nature and Scope of the Incident**
The incident involved [DESCRIBE: unauthorized access / ransomware / data exfiltration] affecting [DESCRIBE AFFECTED SYSTEMS]. The Company became aware of the incident on [DISCOVERY DATE].

**Timing**
The incident is believed to have [begun / occurred] on approximately [ESTIMATED DATE].

**Material Impact**
[Describe: whether the material impact has been determined or whether a determination of materiality is still being assessed.]

**Response Actions**
The Company has taken the following steps in response to this incident:
- Engaged [external cybersecurity firm] to investigate and contain the incident
- Notified relevant law enforcement authorities
- Implemented [CONTAINMENT MEASURES]
- [ADDITIONAL ACTIONS]

**Forward-Looking Statements**
This report may contain forward-looking statements. Actual results may differ materially from those anticipated.

*Filed pursuant to Section 13 or 15(d) of the Securities Exchange Act of 1934*""",

    "GDPR_ART33": """**PERSONAL DATA BREACH NOTIFICATION — Article 33 GDPR**

**To:** [NAME OF SUPERVISORY AUTHORITY / DPA]
**Date of Notification:** [DATE]
**Reference Number:** [IF APPLICABLE]

---

**1. Controller Information**
- Organization: [COMPANY NAME]
- Address: [ADDRESS]
- Data Protection Officer: [DPO NAME], [DPO EMAIL], [DPO PHONE]

**2. Nature of the Breach**
[Describe the nature of the personal data breach, including, where possible, the categories and approximate number of data subjects concerned, and the categories and approximate number of personal data records concerned.]

- Type of breach: [Confidentiality / Integrity / Availability breach]
- Categories of personal data involved: [e.g., names, email addresses, financial data, health data]
- Approximate number of data subjects affected: [NUMBER or UNKNOWN — investigation ongoing]
- Approximate number of records affected: [NUMBER or UNKNOWN]

**3. Likely Consequences**
[Describe the likely consequences of the personal data breach.]

**4. Measures Taken or Proposed**
[Describe the measures taken or proposed to address the personal data breach, including, where appropriate, measures to mitigate its possible adverse effects.]

- Containment actions: [ACTIONS TAKEN]
- Notification of affected individuals: [PLANNED / COMPLETED / NOT REQUIRED — explain why]
- Remediation measures: [ACTIONS]

**5. Notification Timing**
[If notification is made more than 72 hours after becoming aware of the breach, explain reasons for the delay.]

Signed: [NAME, TITLE]
Date: [DATE]""",

    "HIPAA": """**NOTICE OF BREACH OF UNSECURED PROTECTED HEALTH INFORMATION**

[COVERED ENTITY / BUSINESS ASSOCIATE NAME]
[ADDRESS]
[DATE]

Dear [PATIENT NAME / "Valued Patient"],

We are writing to inform you that [COVERED ENTITY NAME] ("we," "us," or "our") recently discovered a breach of unsecured protected health information ("PHI") that may affect you.

**What Happened**
On [DISCOVERY DATE], we discovered that [DESCRIBE INCIDENT — e.g., unauthorized access to our systems, improper disposal of records, etc.]. We believe the breach occurred on or around [ESTIMATED DATE OF BREACH].

**What Information Was Involved**
The following types of PHI may have been accessed or acquired:
- [LIST: e.g., Name, Date of birth, Social Security number, Health plan information, Medical record numbers, Diagnosis/treatment information]

**What We Are Doing**
We have taken the following steps to protect your information and prevent future breaches:
- [ACTION 1]
- [ACTION 2]
- [ACTION 3]
We have also notified the U.S. Department of Health and Human Services (HHS) as required by law.

**What You Can Do**
We recommend you take the following steps to protect yourself:
- Monitor your Explanation of Benefits (EOB) statements for unauthorized charges
- Review your credit reports at annualcreditreport.com
- Contact us with any questions about your medical records
- [IF APPLICABLE] Consider placing a fraud alert with the credit bureaus

**For More Information**
If you have questions, please contact:
[CONTACT NAME / PRIVACY OFFICER]
Phone: [PHONE NUMBER]
Email: [EMAIL]
Hours: [HOURS]

We sincerely apologize for this incident and any concern it may cause you.

Sincerely,
[NAME, TITLE]
[COVERED ENTITY NAME]""",

    "CUSTOMER": """Subject: Important Security Notice Regarding Your Account

Dear [CUSTOMER NAME / "Valued Customer"],

We are writing to inform you of a security incident that may have affected your account with [COMPANY NAME].

**What Happened**
On [DATE], we discovered that [BRIEF DESCRIPTION OF INCIDENT]. We take the security of your information very seriously and want to make sure you have the information you need to protect yourself.

**What Information Was Involved**
The following information may have been affected:
- [LIST AFFECTED DATA TYPES]

Please note: [Passwords / Payment card numbers / etc.] were [not involved / encrypted and not accessible].

**What We Have Done**
As soon as we discovered this incident, we:
- [ACTION 1 — e.g., Secured our systems and launched an investigation]
- [ACTION 2 — e.g., Engaged leading cybersecurity experts]
- [ACTION 3 — e.g., Notified law enforcement]
- [ACTION 4 — e.g., Enhanced security measures]

**What You Can Do**
We recommend taking the following precautions:
- Change your password for your [COMPANY] account and any accounts where you use the same password
- Enable two-factor authentication on your account
- Monitor your accounts and financial statements for any suspicious activity
- Be cautious of unsolicited emails or calls asking for personal information

**We're Here to Help**
We have set up a dedicated support team to answer your questions:
- Phone: [PHONE NUMBER] (Available [HOURS])
- Email: [EMAIL]
- [CREDIT MONITORING OFFER IF APPLICABLE]

We deeply regret this incident and the concern it may cause. Protecting your information is our top priority, and we are committed to doing everything possible to prevent this from happening again.

Sincerely,
[NAME, TITLE]
[COMPANY NAME]""",

    "EMPLOYEE": """**INTERNAL COMMUNICATION — CONFIDENTIAL**

To: All Employees
From: [NAME, TITLE] / [HR / IT / Legal]
Date: [DATE]
Subject: Important Security Incident Update

We are writing to inform you of a cybersecurity incident that has affected our organization. We are committed to keeping you informed while we work to resolve this situation.

**Current Situation**
On [DATE], our security team identified [BRIEF, NON-SENSITIVE DESCRIPTION OF INCIDENT]. We immediately activated our incident response procedures.

**Impact on Operations**
[DESCRIBE OPERATIONAL IMPACTS — e.g., "You may experience slowdowns in [SYSTEM]," or "The following systems are temporarily unavailable:"]
- [SYSTEM/IMPACT 1]
- [SYSTEM/IMPACT 2]

**What You Should Do**
1. **Do not click** on suspicious links or attachments in email
2. **Do not discuss** the details of this incident on social media or with external parties
3. **Report immediately** any suspicious activity to [IT CONTACT / EMAIL / PHONE]
4. [IF PASSWORD RESET REQUIRED] Reset your [SYSTEM] password at [URL] by [DATE]
5. [ADDITIONAL ACTIONS AS APPLICABLE]

**What We Are Doing**
Our IT security team and external experts are working around the clock to:
- Contain and remediate the situation
- Restore normal operations as quickly as possible
- Protect our systems from further impact

**Who to Contact**
- IT Security: [CONTACT / EMAIL / PHONE]
- HR Questions: [HR CONTACT]
- Media Inquiries: Please direct all press inquiries to [PR CONTACT] — do not speak to media

We will provide updates as the situation develops. Thank you for your patience and cooperation.

[NAME, TITLE]""",

    "BOARD": """**BOARD/EXECUTIVE CYBERSECURITY INCIDENT BRIEFING**
**CONFIDENTIAL — ATTORNEY-CLIENT PRIVILEGED**

Date: [DATE]
Prepared by: [CISO / CTO / Incident Commander]
Incident Reference: [INCIDENT ID]

---

## Executive Summary
On [DATE], [COMPANY NAME] experienced a cybersecurity incident involving [BRIEF DESCRIPTION]. This briefing summarizes the business impact, response status, regulatory obligations, and decisions required.

## Situation
- **Incident Type:** [RANSOMWARE / DATA BREACH / DDoS / etc.]
- **Discovery Date:** [DATE]
- **Estimated Incident Start:** [DATE OR "Under investigation"]
- **Current Status:** [CONTAINED / ACTIVE / RECOVERING]
- **Systems Affected:** [HIGH-LEVEL DESCRIPTION]

## Business Impact
| Category | Assessment |
|----------|-----------|
| Revenue Impact | $[AMOUNT]/day or [RANGE] |
| Operational Systems Down | [LIST] |
| Customer Impact | [NUMBER] customers / [DESCRIPTION] |
| Data Exposed | [YES/NO — TYPES] |
| Reputational Risk | [HIGH/MEDIUM/LOW] |

## Regulatory & Legal Obligations
| Obligation | Deadline | Status |
|-----------|---------|--------|
| [e.g., SEC 8-K] | [DATE] | [Filed / Pending] |
| [e.g., GDPR Art. 33] | [DATE] | [Filed / Pending] |
| [e.g., Customer notification] | [DATE] | [Planned / In progress] |

## Response Actions Taken
- [ACTION 1 — with date]
- [ACTION 2 — with date]
- [ACTION 3 — with date]

## Decisions Required
The following decisions require Board/Executive approval:
1. **[DECISION 1]** — [e.g., Authorize cyber insurance claim; Approve customer notification]
2. **[DECISION 2]** — [e.g., Approve budget for forensic investigation: $X]
3. **[DECISION 3]** — [e.g., Engage law firm X for regulatory response]

## Next Update
Next briefing scheduled: [DATE/TIME]
Point of contact for questions: [CISO/Incident Commander — PHONE]""",

    "LAW_ENFORCEMENT": """**CYBERCRIME REPORT — LAW ENFORCEMENT NOTIFICATION**

**Reporting Organization:** [COMPANY NAME]
**Date of Report:** [DATE]
**Contact:** [NAME, TITLE, PHONE, EMAIL]
**Attorney of Record:** [IF APPLICABLE]

---

**Incident Summary**
[COMPANY NAME] is reporting a cybersecurity incident to [FBI / CISA / Local Law Enforcement] that [may involve / appears to involve] criminal activity.

**Incident Details**
- Date first observed: [DATE]
- Estimated date of unauthorized access: [DATE or "Under investigation"]
- Type of incident: [RANSOMWARE / UNAUTHORIZED ACCESS / DATA THEFT / FRAUD]
- Known threat actor: [IF KNOWN, e.g., ransomware group name] or "Unknown at this time"

**Systems Affected**
[HIGH-LEVEL DESCRIPTION — do not include sensitive system details not relevant to investigation]

**Evidence Preserved**
We have preserved the following evidence in accordance with best practices:
- [LOGS TYPE] retained from [DATE RANGE]
- [FORENSIC IMAGES — if applicable]
- [RANSOM NOTES / ATTACKER COMMUNICATIONS — if applicable]
- [ADDITIONAL EVIDENCE]

**Requested Assistance**
We request the following assistance:
- [ ] Investigation and attribution support
- [ ] Threat intelligence on known threat actors
- [ ] Coordination with relevant agencies (CISA, Secret Service, etc.)
- [ ] Assistance with any international coordination required

**Cooperation Statement**
[COMPANY NAME] is committed to full cooperation with law enforcement within the parameters advised by our legal counsel. We understand our obligations and are prepared to provide additional information as requested.

*Note: This report is being made with the advice of legal counsel. Certain information may be protected by attorney-client privilege.*

Signed: [NAME, TITLE]
Date: [DATE]""",

    "GDPR_ART34": """**NOTICE OF PERSONAL DATA BREACH**

[COMPANY NAME]
[ADDRESS]
[DATE]

Dear [DATA SUBJECT NAME / "Valued Customer"],

We are contacting you because a personal data breach has occurred that is likely to result in a high risk to your rights and freedoms. We are required to inform you of this breach under Article 34 of the General Data Protection Regulation (GDPR).

**What Happened**
[DESCRIBE THE BREACH IN PLAIN, CLEAR LANGUAGE — when it happened, how it was discovered, and what occurred.]

**What Personal Data Was Affected**
The following categories of your personal data may have been accessed or disclosed:
- [DATA CATEGORY 1 — e.g., Name and email address]
- [DATA CATEGORY 2 — e.g., Postal address]
- [DATA CATEGORY 3 — e.g., Account information]

**Likely Consequences**
This breach may result in [DESCRIBE REALISTIC RISKS — e.g., unauthorized use of your personal data, identity theft risk, unsolicited contact].

**Steps We Have Taken**
We have taken the following actions to address the breach and mitigate its effects:
- [ACTION 1]
- [ACTION 2]
- [ACTION 3]
We have also notified [YOUR DATA PROTECTION AUTHORITY — e.g., the ICO / CNIL / BfDI] as required.

**Steps You Can Take to Protect Yourself**
- [RECOMMENDATION 1 — e.g., Change any passwords used with our service]
- [RECOMMENDATION 2 — e.g., Be alert to phishing attempts]
- [RECOMMENDATION 3 — e.g., Monitor your financial accounts]

**Contact Us**
If you have any questions, please contact our Data Protection Officer:
[DPO NAME]
Email: [DPO EMAIL]
Phone: [DPO PHONE]
You also have the right to lodge a complaint with your local supervisory authority: [AUTHORITY AND URL]

Sincerely,
[NAME, TITLE]
[COMPANY NAME]""",

    "CCPA": """Subject: Notice of Data Breach — California Residents

[COMPANY NAME]
[DATE]

Dear California Resident,

We are writing to inform you of a data breach that may have affected your personal information.

**What Happened**
[BRIEF DESCRIPTION OF BREACH — plain language, when discovered, what occurred]

**What Information Was Involved**
The following categories of personal information may have been affected:
- [CATEGORY — e.g., Name]
- [CATEGORY — e.g., Email address]
- [CATEGORY — e.g., Social Security number]
- [CATEGORY — e.g., Financial account information]

**What We Are Doing**
We took the following actions upon discovering this breach:
- [ACTION 1]
- [ACTION 2]

**What You Can Do**
California law provides you with certain rights:

*Fraud Alerts and Credit Freezes*
You may place a fraud alert on your credit file by contacting one of the three major credit bureaus:
- Equifax: 1-800-525-6285
- Experian: 1-888-397-3742
- TransUnion: 1-800-680-7289

A credit freeze is free of charge.

*Identity Theft Resources*
- California Office of Privacy Protection: www.oag.ca.gov/idtheft
- Federal Trade Commission: identitytheft.gov

**Contact Us**
[COMPANY NAME]: [PHONE / EMAIL / HOURS]

[IF OFFERING CREDIT MONITORING]:
As a precautionary measure, we are offering [X months] of free credit monitoring through [PROVIDER]. To enroll, visit [URL] and use code [CODE] by [DEADLINE].

Sincerely,
[NAME, TITLE]""",

    "STATE_CA": """Subject: Notice of Data Breach — California Residents (California AG Notification)

**TO: California Attorney General**
Office of the Attorney General
Attn: Privacy Enforcement and Protection Unit
300 South Spring Street, Los Angeles, CA 90013
Email: databreaches@doj.ca.gov

**FROM:** [COMPANY NAME]
[ADDRESS]
[DATE]

---

**Notification of Security Breach — California Civil Code § 1798.82**

[COMPANY NAME] is submitting this notice pursuant to California Civil Code § 1798.82 (SB-1386).

**Affected Individuals:** [APPROXIMATE NUMBER] California residents
**Date Breach Discovered:** [DATE]
**Date Breach Occurred (estimated):** [DATE or "Under investigation"]

**Nature of Breach**
[DESCRIPTION OF THE BREACH — type of incident, how it occurred, how it was discovered]

**Information Involved**
The following categories of personal information were involved:
- [CATEGORY 1]
- [CATEGORY 2]

**Steps Taken**
[COMPANY NAME] has taken the following steps to contain the breach and notify affected individuals:
- [ACTION 1]
- [ACTION 2]
- Individual notifications were sent on [DATE] via [METHOD]

**Contact**
[NAME, TITLE]
[PHONE]
[EMAIL]

*A copy of the individual notification sent to affected California residents is attached.*""",

    "STATE_NY": """Subject: Notice of Data Breach — New York SHIELD Act Notification

**TO: New York Attorney General**
Office of the Attorney General
Bureau of Internet and Technology
28 Liberty Street, New York, NY 10005
Breach Notifications: attorney.general@ag.ny.gov

**FROM:** [COMPANY NAME]
[ADDRESS]
[DATE]

---

**Notification of Security Breach — New York SHIELD Act (NY Gen. Bus. Law § 899-aa)**

[COMPANY NAME] provides this notification pursuant to the New York Stop Hacks and Improve Electronic Data Security (SHIELD) Act.

**Affected New York Residents:** [APPROXIMATE NUMBER]
**Date of Discovery:** [DATE]
**Estimated Date of Breach:** [DATE or "Under investigation"]

**Nature of Breach**
[DESCRIPTION — type of incident, what occurred, how it was discovered]

**Private Information Involved**
| Category | Affected |
|----------|---------|
| [e.g., Social Security Number] | [YES/NO] |
| [e.g., Account Number + access credentials] | [YES/NO] |
| [e.g., Driver's License Number] | [YES/NO] |
| [e.g., Biometric information] | [YES/NO] |

**Response Actions**
- [ACTION 1]
- [ACTION 2]
- Individual notices sent [DATE] by [METHOD]

**Contact for Questions**
[NAME, TITLE] — [PHONE] — [EMAIL]

*Note: Per NY GBL § 899-aa(8), if 500,000+ New York residents are affected, this notice was also sent to the Consumer Protection Board and State Police.*""",

    "STATE_TX": """Subject: Data Breach Notification — Texas Identity Theft Enforcement and Protection Act

**TO: Texas Attorney General**
Consumer Protection Division
P.O. Box 12548
Austin, TX 78711-2548
databreach@oag.texas.gov

**FROM:** [COMPANY NAME]
[ADDRESS]
[DATE]

---

**Notification of Breach of Security — Texas Business & Commerce Code § 521.053**

[COMPANY NAME] is providing this notice pursuant to Texas Business & Commerce Code § 521.053.

**Number of Affected Texas Residents:** [NUMBER — AG notification required if 250+]
**Date Breach Discovered:** [DATE]
**Estimated Date of Breach:** [DATE or "Under investigation"]
**Date Individual Notices Sent:** [DATE — must be within 60 days of determination]

**Nature of Breach**
[DESCRIPTION — what happened, how it was discovered, what systems were involved]

**Sensitive Personal Information Affected**
[List categories per Texas definition: first/last name + SSN, driver's license, account number, etc.]
- [CATEGORY 1]
- [CATEGORY 2]

**Remediation**
[COMPANY NAME] has taken the following actions:
- [ACTION 1 — containment]
- [ACTION 2 — notification]
- [ACTION 3 — monitoring/remediation]

**Contact**
[NAME, TITLE]
[COMPANY NAME]
[PHONE] | [EMAIL]

*Individual consumer notifications have been sent by [METHOD] and a copy is attached.*""",

    "STATE_FL": """Subject: Data Breach Notification — Florida Information Protection Act (FIPA)

**TO: Florida Department of Legal Affairs**
Office of the Attorney General
Consumer Protection Division
PL-01 The Capitol, Tallahassee, FL 32399
databreachreport@myfloridalegal.com

**FROM:** [COMPANY NAME]
[ADDRESS]
[DATE]

---

**Notification of Breach of Security — Florida Statute § 501.171**

[COMPANY NAME] is submitting this notice pursuant to the Florida Information Protection Act (FIPA), Fla. Stat. § 501.171.

**Number of Affected Florida Residents:** [NUMBER — AG notification required if 500+]
**Date Breach Determined:** [DATE — 30-day notification clock starts here]
**Date Individual Notices Sent:** [DATE — must be within 30 days of determination]
**Date of This Notice:** [DATE]

**Nature of the Breach**
[DESCRIPTION — type of incident, systems affected, how discovered, estimated timeframe]

**Personal Information Involved**
[Per FIPA definition: name + SSN, driver's license, financial account, medical, email + security credentials]
- [CATEGORY 1]
- [CATEGORY 2]

**Remediation Measures**
- [ACTION 1]
- [ACTION 2]
- [ACTION 3]

**Contact Information**
[NAME, TITLE]
[COMPANY NAME]
[ADDRESS]
[PHONE] | [EMAIL]

*A copy of the consumer notification sent to affected Florida residents is enclosed.*""",

    "STATE_IL": """Subject: Data Breach Notification — Illinois Personal Information Protection Act (PIPA)

**TO: Illinois Attorney General**
500 South Second Street
Springfield, IL 62701
breachnotification@ilag.gov

**FROM:** [COMPANY NAME]
[ADDRESS]
[DATE]

---

**Notification of Breach of Security — 815 ILCS 530/ (Illinois PIPA)**

[COMPANY NAME] provides this notification pursuant to the Illinois Personal Information Protection Act (815 ILCS 530/).

**Number of Affected Illinois Residents:** [NUMBER — AG notification required if 500+]
**Date Breach Discovered:** [DATE]
**Estimated Date of Breach:** [DATE or "Under investigation"]
**Method of Individual Notification:** [Written / Electronic / Substitute notice]

**Description of the Breach**
[DESCRIPTION — type of breach, what data was involved, how the breach occurred]

**Personal Information Categories Affected**
[Per Illinois definition — name + SSN, driver's license, financial account, medical, biometric, unique identifiers]
- [CATEGORY 1]
- [CATEGORY 2]

**Measures Taken**
[COMPANY NAME] has taken the following steps to address the breach:
- [ACTION 1 — investigation and containment]
- [ACTION 2 — individual notification]
- [ACTION 3 — remediation]

**For More Information**
[NAME, TITLE]
[COMPANY NAME]
[PHONE] | [EMAIL]

*Individual notices were sent to affected Illinois residents on [DATE]. A copy of that notice is attached.*
*Note: Substitute notice (website posting + media release) was used if costs exceeded $250,000 or 500,000+ individuals were affected.*""",
}


class CustomJurisdictionCreate(BaseModel):
    code: str
    name: str
    deadline_hours: int | None = None
    threshold: str | None = None
    requirements: list[str] = []
    contact_url: str | None = None
    notes: str | None = None


class CustomJurisdictionUpdate(BaseModel):
    name: str | None = None
    deadline_hours: int | None = None
    threshold: str | None = None
    requirements: list[str] | None = None
    contact_url: str | None = None
    notes: str | None = None


@router.get("/jurisdictions", response_model=list[JurisdictionInfo])
async def list_jurisdictions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    custom_list = []
    try:
        custom_result = await db.execute(select(CustomJurisdiction).order_by(CustomJurisdiction.name))
        custom = custom_result.scalars().all()
        custom_list = [
            {
                "code": c.code, "name": c.name, "deadline_hours": c.deadline_hours,
                "threshold": c.threshold, "requirements": c.requirements or [],
                "contact_url": c.contact_url, "notes": c.notes,
            }
            for c in custom
        ]
    except Exception:
        pass
    return BUILTIN_JURISDICTIONS + custom_list


@router.post("/jurisdictions", status_code=201)
async def create_jurisdiction(
    body: CustomJurisdictionCreate,
    user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    # Validate code uniqueness (builtin + custom)
    all_codes = {j["code"] for j in BUILTIN_JURISDICTIONS}
    existing = await db.execute(select(CustomJurisdiction).where(CustomJurisdiction.code == body.code))
    if existing.scalar_one_or_none() or body.code in all_codes:
        raise HTTPException(status_code=409, detail="Jurisdiction code already exists")
    jur = CustomJurisdiction(
        id=str(uuid.uuid4()),
        code=body.code,
        name=body.name,
        deadline_hours=body.deadline_hours,
        threshold=body.threshold,
        requirements=body.requirements,
        contact_url=body.contact_url,
        notes=body.notes,
        created_by=user.id,
    )
    db.add(jur)
    await db.commit()
    await db.refresh(jur)
    return {"code": jur.code, "name": jur.name, "deadline_hours": jur.deadline_hours,
            "threshold": jur.threshold, "requirements": jur.requirements,
            "contact_url": jur.contact_url, "notes": jur.notes}


@router.patch("/jurisdictions/{code}")
async def update_jurisdiction(
    code: str,
    body: CustomJurisdictionUpdate,
    user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CustomJurisdiction).where(CustomJurisdiction.code == code))
    jur = result.scalar_one_or_none()
    if not jur:
        raise HTTPException(status_code=404, detail="Custom jurisdiction not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(jur, field, value)
    await db.commit()
    await db.refresh(jur)
    return {"code": jur.code, "name": jur.name, "deadline_hours": jur.deadline_hours,
            "threshold": jur.threshold, "requirements": jur.requirements,
            "contact_url": jur.contact_url, "notes": jur.notes}


@router.delete("/jurisdictions/{code}", status_code=204)
async def delete_jurisdiction(
    code: str,
    user: User = Depends(require_role(UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CustomJurisdiction).where(CustomJurisdiction.code == code))
    jur = result.scalar_one_or_none()
    if not jur:
        raise HTTPException(status_code=404, detail="Custom jurisdiction not found (built-in jurisdictions cannot be deleted)")
    await db.delete(jur)
    await db.commit()


@router.get("/jurisdictions/{code}/template")
async def get_jurisdiction_template(code: str, user: User = Depends(get_current_user)):
    template = CANNED_TEMPLATES.get(code)
    return {"code": code, "template": template, "has_template": template is not None}


@router.get("/drafts", response_model=list[CommsDraftResponse])
async def list_drafts(incident_id: str | None = None, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    query = select(CommsDraft).order_by(CommsDraft.created_at.desc())
    if incident_id:
        query = query.where(CommsDraft.incident_id == incident_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/drafts", response_model=CommsDraftResponse, status_code=201)
async def create_draft(body: CommsDraftCreate, user: User = Depends(require_role(UserRole.ANALYST)), db: AsyncSession = Depends(get_db)):
    content = body.content if body.content else CANNED_TEMPLATES.get(body.jurisdiction, "")
    draft = CommsDraft(**{**body.model_dump(), "content": content}, created_by=user.id)
    db.add(draft)
    await db.commit()
    await db.refresh(draft)
    return draft


@router.get("/drafts/{draft_id}", response_model=CommsDraftResponse)
async def get_draft(draft_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CommsDraft).where(CommsDraft.id == draft_id))
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft


@router.patch("/drafts/{draft_id}", response_model=CommsDraftResponse)
async def update_draft(draft_id: str, body: CommsDraftUpdate, user: User = Depends(require_role(UserRole.ANALYST)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CommsDraft).where(CommsDraft.id == draft_id))
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(draft, field, value)
    await db.commit()
    await db.refresh(draft)
    return draft


@router.delete("/drafts/{draft_id}", status_code=204)
async def delete_draft(draft_id: str, user: User = Depends(require_role(UserRole.ANALYST)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CommsDraft).where(CommsDraft.id == draft_id))
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    await db.delete(draft)
    await db.commit()


@router.post("/drafts/{draft_id}/approve", response_model=CommsDraftResponse)
async def approve_draft(draft_id: str, user: User = Depends(require_role(UserRole.IR_LEAD)), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CommsDraft).where(CommsDraft.id == draft_id))
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    draft.status = DraftStatus.APPROVED
    draft.approved_by = user.id
    await db.commit()
    await db.refresh(draft)
    return draft


@router.post("/drafts/{draft_id}/generate", response_model=CommsDraftResponse)
async def ai_generate_draft(
    draft_id: str,
    body: "GenerateDraftRequest",
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CommsDraft).where(CommsDraft.id == draft_id))
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    from app.models.knowledge import AIConfig, OrgKnowledge
    ai_result = await db.execute(select(AIConfig).limit(1))
    ai_cfg = ai_result.scalar_one_or_none()
    if not ai_cfg or not ai_cfg.providers_encrypted:
        raise HTTPException(status_code=400, detail="AI provider not configured")

    knowledge_result = await db.execute(select(OrgKnowledge).limit(1))
    knowledge = knowledge_result.scalar_one_or_none()
    voice = knowledge.comm_voice if knowledge else None
    guidelines = knowledge.comm_guidelines if knowledge else None

    # Find jurisdiction info (check builtin first, then custom)
    jur_info = next((j for j in BUILTIN_JURISDICTIONS if j["code"] == draft.jurisdiction), None)
    if not jur_info:
        custom_result = await db.execute(select(CustomJurisdiction).where(CustomJurisdiction.code == draft.jurisdiction))
        custom_jur = custom_result.scalar_one_or_none()
        if custom_jur:
            jur_info = {
                "name": custom_jur.name, "requirements": custom_jur.requirements or [],
                "deadline_hours": custom_jur.deadline_hours,
            }

    from app.auth.encryption import decrypt
    from app.services.ai import get_provider, AIMessage
    providers_config = decrypt(ai_cfg.providers_encrypted)
    provider = get_provider(
        {"default_provider": body.provider or ai_cfg.default_provider, "providers": providers_config},
        provider_name=body.provider,
    )

    system_prompt = "You are an expert incident response communications specialist. Write clear, professional notifications."
    if voice:
        system_prompt += f"\n\nOrganization communication voice/tone: {voice}"
    if guidelines:
        system_prompt += f"\n\nAdditional guidelines: {guidelines}"

    canned = CANNED_TEMPLATES.get(draft.jurisdiction, "")
    prompt = f"""Draft a {draft.title} for jurisdiction: {jur_info['name'] if jur_info else draft.jurisdiction}.

Requirements for this jurisdiction:
{chr(10).join(f'- {r}' for r in (jur_info.get('requirements', []) if jur_info else []))}
{f'Deadline: {jur_info["deadline_hours"]} hours' if jur_info and jur_info.get("deadline_hours") else ''}

{f'Additional context: {body.context}' if body.context else ''}

{f'Reference template structure (improve upon this):{chr(10)}{canned}' if canned and not draft.content else f'Current draft content to improve upon:{chr(10)}{draft.content}' if draft.content else 'Create a complete draft from scratch.'}

Write a complete, professional notification that satisfies all requirements. Use [PLACEHOLDER] for specific details that need to be filled in (dates, counts, specific systems, etc.). Use markdown formatting for structure."""

    response = await provider.generate(
        [AIMessage(role="user", content=prompt)],
        system=system_prompt,
        max_tokens=2500,
        temperature=0.4,
    )

    draft.content = response.content
    draft.version += 1
    await db.commit()
    await db.refresh(draft)
    return draft
