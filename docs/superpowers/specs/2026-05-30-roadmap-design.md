# IR Command Center — Feature Roadmap Design

**Date:** 2026-05-30  
**Scope:** Feature improvements, UX enhancements, AI expansion, and analytics capabilities  
**Audience:** Internal security team + open-source community  
**Approach:** Combine depth-first polish of existing features with two major new capability pillars (AI Copilot, Analytics Center)

---

## Context

IR Command Center is a self-hosted, full-stack incident response platform built on FastAPI + Next.js 15. The existing feature set is extensive: war room, IOC/asset/evidence tracking, AI-assisted comms and briefings, tabletop exercises, post-mortems, readiness scoring, playbooks, IR plan, compliance, vendor registry, and full enterprise auth. No major pain points exist in current features — the roadmap expands and elevates rather than fixes.

The platform serves two audiences simultaneously:
- **Internal team** — operational depth, productivity under pressure
- **Open-source community** — polish, onboarding, clear value proposition

---

## Section 1: Foundation Polish

### Rich Text Editing
Replace all `<textarea>` inputs with Tiptap (lightweight ProseMirror wrapper). Affected locations:
- War Room incident notes
- Documents library (inline editor)
- IR Plan section editor
- Post-mortem fields (summary, impact, root cause, lessons learned)
- Playbook step descriptions

Supports markdown shortcuts, inline code, bullet/numbered lists. Notes in the War Room become viable for long-form incident documentation. No new dependencies beyond Tiptap core.

### Skeleton Loaders
Replace all spinner/loading states with content-shaped skeleton screens. Every card, table row, chart container, and list gets a skeleton that matches the actual content layout. This applies globally across all pages.

### Command Palette
`Cmd+K` / `Ctrl+K` opens a global command launcher overlay. Capabilities:
- Jump to any incident by title or ID
- Navigate to any top-level page
- Declare a new incident
- Run a playbook (opens playbook selector)
- Trigger AI Copilot with a pre-filled prompt

Built on top of the existing `GlobalSearch` component at `frontend/src/components/GlobalSearch.tsx`. The current search moves inside the palette; the header search icon becomes the palette trigger.

### Better Empty States
Every zero-data state across the app gets a purpose-built empty state component with:
- A contextual icon
- A clear headline ("No incidents yet" / "No IOCs documented")
- A single actionable CTA button ("Declare First Incident" / "+ Add IOC")
- Optional secondary guidance text

Affected pages: Incidents list, War Room (IOCs, assets, notes), Tasks, Evidence, Timeline, Vendors, Contacts, Documents, Knowledge Base, Compliance, Playbooks.

### First-Run Onboarding Checklist
A dismissible setup checklist widget shown on the dashboard homepage for new installs. Steps:
1. Configure an AI provider (links to `/ai-config`)
2. Add org knowledge (links to `/knowledge`)
3. Create your first playbook (links to `/playbooks`)
4. Add emergency contacts (links to `/contacts`)
5. Review your IR Plan (links to `/ir-plan`)

Tracked in `localStorage` per-user. Disappears once all steps are completed or explicitly dismissed. Targeted at open-source adopters setting up for the first time.

### Design Consistency Pass
A systematic audit and unification of:
- Font size scale (standardize heading/body/caption hierarchy across all pages)
- Spacing (card padding, section gaps, form field spacing)
- Button variants (ensure primary/secondary/destructive/ghost are used consistently)
- Form inputs (unify border radius, focus ring, placeholder color across all inputs/selects/textareas)
- Card styling (border radius, shadow depth, border color uniformity)

No functional changes — visual only.

---

## Section 2: AI Enhancements

### AI Copilot Panel
A persistent, context-aware AI assistant accessible via `Cmd+Shift+A` or a fixed button in the sidebar. Renders as a slide-in drawer (400px wide, full height) that overlays content without displacing the layout.

**Context loading:**
- Inside an incident route (`/incidents/[id]/*`): pre-loads the incident's title, type, severity, phase, status, IOC list, affected assets, recent notes, and timeline summary
- Outside an incident: draws on org knowledge (name, industry, critical systems, regulatory obligations)
- Always available: org knowledge base content

**Capabilities:**
- Free-form chat with full conversation history within the session
- Suggested prompts shown on open: "Summarize current incident status", "Draft an exec update", "What should we do next in this phase?", "List containment steps for this incident type"
- Copy-to-clipboard on any AI response
- "Insert into note" action that appends the response as a new War Room note

**Graceful degradation:** When no AI provider is configured, the panel opens and shows a prompt to configure AI at `/ai-config`. The button is never hidden.

**Backend:** New `POST /api/ai/copilot` endpoint accepts `incident_id` (optional), `messages[]`, and assembles the system prompt server-side from incident data + org knowledge. Uses the existing `_get_provider_from_db` pattern.

### Smarter Exec Brief
Upgrades the existing "AI Exec Brief" button in the War Room (`/incidents/[id]`).

Current behavior: single prompt → freeform text pinned as a note.

New behavior: structured multi-section output rendered as a formatted note:
- **Situation** — 2-3 sentence summary of what happened and current status
- **Impact** — affected systems/assets with their status, estimated business impact
- **Indicators** — top IOCs with type and confidence level
- **Actions Taken** — completed tasks and phase progress
- **Recommended Next Steps** — phase-appropriate actions
- **Timeline Highlights** — 3-5 key events with timestamps

The note is still pinned and marked `is_exec_briefing=true`. The AI prompt is rebuilt server-side to pull structured data from the incident (IOCs, assets, tasks, timeline) rather than asking AI to infer everything from a text description.

### AI Post-Mortem Generation
The existing post-mortem page (`/incidents/[id]/postmortem`) gets a "Generate from Incident Data" button that replaces the current minimal AI generation.

The new generation analyzes:
- Full incident timeline events
- Completed and uncompleted tasks
- IOC list and asset impact
- War Room notes
- Incident duration and phase progression

And populates all post-mortem fields:
- Summary, Impact, Timeline Notes
- What Went Well / What Went Poorly (inferred from task completion, note sentiment, phase timing)
- Root Cause (synthesized from IOCs, assets, and notes)
- 5 Whys (generated as a structured chain)
- Lessons Learned

Each generated field is individually editable after generation. Existing manually-filled fields are not overwritten — the button only populates empty fields unless the user confirms an overwrite.

### Smarter Task Generation
Upgrades the existing AI task generation (currently triggered when creating a new incident).

New behavior:
- Task suggestions are **phase-aware** — generating for CONTAINMENT produces different tasks than RECOVERY
- Task suggestions are **incident-type-aware** — RANSOMWARE generates tasks like "Isolate affected endpoints", "Contact cyber insurance carrier"; DATA_BREACH generates "Identify data scope", "Prepare breach notification"
- Each generated task includes: suggested priority, suggested assignee role (not user — role label like "IR Lead", "Analyst"), and a phase tag
- The task generation button is also available from the Tasks tab at any point during the incident, not just at creation

**Backend:** The `POST /api/ai/generate-tasks` endpoint receives `phase` as an additional parameter and uses a richer prompt template per incident type × phase combination.

### AI-Assisted IOC Analysis
Each IOC entry in the War Room IOC panel and the dedicated `/incidents/[id]/iocs` page gets an "Analyze" action (small button or context menu item).

Clicking it sends the IOC type, value, and incident context to AI and returns:
- Known threat actor or malware family associations (if any)
- Typical attack pattern context for this IOC type
- Recommended immediate containment actions
- Confidence note (AI acknowledges it may not have current threat intel)

The analysis is appended as structured text in the IOC's `notes` field and displayed inline. One analysis per IOC — re-analyzing overwrites. Falls back gracefully when AI is unconfigured.

---

## Section 3: Analytics Center

### New `/analytics` Page
A new top-level navigation item added under the **Response** section in the sidebar, between Scorecard and Crisis Comms. Two tab views: **Operational** and **Strategic**.

### Operational Tab

**SLA/SLO Tracking**
- Configurable per-severity SLA thresholds stored in org settings (e.g. CRITICAL: contain within 4h, resolve within 24h; HIGH: contain within 8h)
- Each open incident displays a progress bar against its containment and resolution SLA
- Color coded: green (>50% time remaining), amber (25–50%), red (<25% or breached)
- Breached SLAs surface as a count badge on the Analytics nav item

**Task Velocity**
- Tasks opened vs. closed per day over the last 14 days, shown as a stacked bar chart
- Filterable by incident
- Shows net backlog trend (is the team keeping up or falling behind?)

**Responder Workload**
- Per-user table: open task count, overdue task count, tasks completed in last 7 days, last activity timestamp
- Sortable by each column
- Helps IR leads identify who is overloaded or idle

**Active Incident Heat Map**
- Grid: severity (rows) × phase (columns)
- Each cell shows count of incidents in that state
- Click a cell to navigate to a filtered incident list

### Strategic Tab

**MTTD / MTTR Trends**
- Line chart: monthly MTTD and MTTR averages over the last 12 months
- Month-over-month delta indicators (↑ / ↓ with percentage)
- Overlaid with incident volume as a bar series on a secondary axis

**Incident Volume Breakdown**
- Configurable time range (last 30d / 90d / 6mo / 12mo / all time)
- Stacked bar by incident type
- Stacked bar by severity
- Closed vs. open split

**Readiness Score History**
- Line chart of total readiness score over time
- Requires that score snapshots are persisted on each calculation (new `readiness_snapshots` table)
- Shows grade boundaries as reference lines (A/B/C/D/F)

**Repeat IOC Detection**
- Table of IOC values that have appeared in more than one incident
- Columns: IOC value, type, incident count, first seen, last seen, confidence levels
- Sorted by incident count descending
- Links each row to a filtered IOC search

**Post-Mortem Action Item Completion Rate**
- Donut chart: completed vs. overdue vs. open action items across all post-mortems
- Table of overdue action items with owner, due date, source incident, and days overdue
- Click-through to the source post-mortem

### Scheduled Executive Reports
Admins configure weekly or monthly email digests delivered to a list of recipients.

Report PDF content:
- Date range covered
- Open incidents summary (count, severity breakdown, any SLA breaches)
- MTTD / MTTR for the period vs. prior period
- Readiness score (current + trend)
- Critical overdue post-mortem action items
- Top 3 repeat IOCs

Configuration UI in Admin panel: toggle on/off, frequency (weekly/monthly), day of week/month, recipient email list.

Uses the existing `scheduler.py` (APScheduler) and `report_generator.py` infrastructure. New `POST /api/admin/reports/schedule` endpoint for configuration.

**Backend:** New `readiness_snapshots` table stores `(score, grade, dimensions_json, created_at)` rows. The readiness router writes a snapshot each time a score is computed. Analytics endpoints are a new `/api/analytics/` router.

---

## Architecture Notes

- All new AI endpoints follow the existing `_get_provider_from_db` pattern in `routers/ai.py`
- The AI Copilot panel lives at `frontend/src/components/AICopilot.tsx`, mounted in the dashboard layout (`frontend/src/app/(dashboard)/layout.tsx`)
- The Analytics page lives at `frontend/src/app/(dashboard)/analytics/page.tsx` with `operational.tsx` and `strategic.tsx` sub-components
- Tiptap replaces raw `<textarea>` inputs — a shared `RichTextEditor.tsx` component wraps Tiptap with a consistent toolbar
- The command palette lives at `frontend/src/components/CommandPalette.tsx`, mounted in the root dashboard layout
- Skeleton loaders use a shared `Skeleton.tsx` component (simple `animate-pulse` div)
- SLA thresholds stored as a JSON column on a new `org_settings` table (separate from `AIConfig` — org settings are distinct from AI provider config)

---

## Implementation Sequence

1. **Foundation Polish** — Skeleton loaders, empty states, design consistency (no backend changes)
2. **Rich Text Editor + Command Palette** — Frontend-only, can ship independently
3. **First-Run Onboarding Checklist** — Frontend-only
4. **AI Enhancements** — Copilot panel (requires new backend endpoint), then smarter exec brief, post-mortem, task gen, IOC analysis
5. **Analytics Center** — New backend router + `readiness_snapshots` table + frontend Analytics page
6. **Scheduled Reports** — Builds on analytics backend; last because it depends on data being accumulated

---

## Success Criteria

- Open-source users can go from `docker compose up` to first incident declared with AI configured in under 15 minutes (onboarding checklist)
- AI Copilot produces useful, contextually accurate responses for an active incident without requiring the user to re-explain the situation
- The Analytics Center's Operational tab is useful during a live P1 incident (SLA visibility, workload)
- The Strategic tab produces a report meaningful enough to replace a manually assembled exec slide deck
