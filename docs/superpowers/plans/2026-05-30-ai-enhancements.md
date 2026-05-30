# AI Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent AI Copilot panel accessible from any page, upgrade the exec brief to structured sections, surface existing AI IOC analysis and post-mortem generation in the UI, and make task generation phase-aware.

**Architecture:** A new `POST /api/ai/copilot` endpoint assembles incident context server-side and streams a multi-turn chat response. The Copilot panel is a slide-in drawer mounted in the dashboard layout. All other enhancements improve existing endpoints' prompts or add UI to endpoints that already exist (`/api/ai/analyze-ioc`, `/api/ai/generate-postmortem`). The exec brief prompt in `incidents.py` is upgraded to produce structured sections.

**Tech Stack:** FastAPI (backend), Next.js 15 App Router, React 19, TanStack Query v5, Tailwind CSS, lucide-react

---

### Task 1: Add `/api/ai/copilot` Backend Endpoint

**Files:**
- Modify: `backend/app/routers/ai.py`

- [ ] **Step 1: Add the `CopilotRequest` schema and endpoint**

Open `backend/app/routers/ai.py`. Add the following after the existing `AnalyzeIOCRequest` class (around line 41):

```python
class CopilotMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class CopilotRequest(BaseModel):
    messages: list[CopilotMessage]
    incident_id: str | None = None
    provider: str | None = None
```

Then add the following endpoint after the `@router.post("/analyze-ioc")` handler (before the gap-analysis handler):

```python
@router.post("/copilot")
async def copilot_chat(
    body: CopilotRequest,
    user: User = Depends(require_role(UserRole.ANALYST)),
    db: AsyncSession = Depends(get_db),
):
    provider = await _get_provider_from_db(db, body.provider)

    # Build system context
    context_parts: list[str] = [
        "You are an expert incident responder and security analyst assistant embedded in IR Command Center. "
        "Answer questions, draft communications, suggest next steps, and help the IR team respond effectively. "
        "Be concise, direct, and actionable. Use bullet points for lists. Use markdown formatting.",
    ]

    if body.incident_id:
        from app.models.incident import Incident, IOC, AffectedAsset, IncidentNote, TimelineEvent, IncidentTask
        from sqlalchemy.orm import selectinload
        result = await db.execute(
            select(Incident)
            .options(
                selectinload(Incident.iocs),
                selectinload(Incident.assets),
                selectinload(Incident.notes),
                selectinload(Incident.timeline_events),
                selectinload(Incident.tasks),
            )
            .where(Incident.id == body.incident_id)
        )
        inc = result.scalar_one_or_none()
        if inc:
            elapsed_h = round((datetime.now(timezone.utc) - inc.started_at.replace(tzinfo=timezone.utc)).total_seconds() / 3600, 1)
            ioc_lines = "\n".join([f"  - [{i.ioc_type.value}] {i.value} ({i.confidence})" for i in inc.iocs[:15]])
            asset_lines = "\n".join([f"  - {a.name} ({a.asset_type}, {a.status})" for a in inc.assets[:10]])
            task_summary = f"{sum(1 for t in inc.tasks if t.status == 'DONE')}/{len(inc.tasks)} tasks completed"
            pinned_notes = [n.content for n in inc.notes if n.is_pinned or n.is_exec_briefing][:3]
            notes_lines = "\n".join([f"  - {n[:200]}" for n in pinned_notes])
            recent_events = sorted(inc.timeline_events, key=lambda e: e.occurred_at, reverse=True)[:5]
            timeline_lines = "\n".join([f"  - {e.event_type}: {e.description}" for e in recent_events])

            context_parts.append(f"""
CURRENT INCIDENT CONTEXT:
- Title: {inc.title}
- Type: {inc.incident_type.value}
- Severity: {inc.severity.value}
- Status: {inc.status.value}
- Phase: {inc.phase.value}
- Active: {elapsed_h} hours
- IOCs ({len(inc.iocs)} total, top 15):
{ioc_lines or '  None documented'}
- Affected assets ({len(inc.assets)} total):
{asset_lines or '  None documented'}
- Tasks: {task_summary}
- Recent timeline:
{timeline_lines or '  No events'}
- Pinned notes:
{notes_lines or '  None'}
""")

    # Add org knowledge context
    from app.models.knowledge import OrgKnowledge
    org_result = await db.execute(select(OrgKnowledge).limit(1))
    org = org_result.scalar_one_or_none()
    if org and org.org_name:
        context_parts.append(f"""
ORG CONTEXT:
- Organization: {org.org_name}
- Industry: {org.industry or 'Not specified'}
- Size: {org.size or 'Not specified'}
- Regulatory obligations: {', '.join(org.regulatory_obligations) if org.regulatory_obligations else 'None documented'}
- Critical systems: {', '.join(org.critical_systems[:5]) if org.critical_systems else 'None documented'}
""")

    system_prompt = "\n\n".join(context_parts)
    msgs = [AIMessage(role=m.role, content=m.content) for m in body.messages]

    response = await provider.generate(
        msgs,
        system=system_prompt,
        max_tokens=2048,
        temperature=0.5,
    )
    return {"content": response.content, "provider": response.provider, "model": response.model}
```

Also add the missing import at the top of `ai.py`:
```python
from datetime import datetime, timezone
```

- [ ] **Step 2: Verify the endpoint is registered**

The `/api/ai/copilot` endpoint is part of the `ai.router` which is already registered in `main.py`. No changes needed to `main.py`.

Restart the backend and confirm the endpoint appears in Swagger:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart backend
# then visit http://localhost/docs and search for /api/ai/copilot
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/ai.py
git commit -m "feat: add /api/ai/copilot endpoint with incident context assembly"
```

---

### Task 2: Create AICopilot Frontend Drawer Component

**Files:**
- Create: `frontend/src/components/AICopilot.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/components/AICopilot.tsx
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  X, Sparkles, Send, Copy, Plus, ChevronDown, Settings,
} from "lucide-react";
import api from "@/lib/api";
import type { Incident } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_PROMPTS = [
  "Summarize the current incident status",
  "Draft an executive update for this incident",
  "What should we do next in this phase?",
  "List containment steps for this incident type",
  "What notifications are required for this incident?",
];

export function AICopilot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pathname = usePathname();

  // Extract incident ID from URL if on an incident route
  const incidentMatch = pathname.match(/^\/incidents\/([^/]+)/);
  const incidentId = incidentMatch ? incidentMatch[1] : null;

  const { data: incident } = useQuery<Incident>({
    queryKey: ["incident", incidentId],
    queryFn: () => api.get<Incident>(`/incidents/${incidentId}`).then((r) => r.data),
    enabled: !!incidentId,
    staleTime: 30_000,
  });

  // ⌘+Shift+A shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "a") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || loading) return;
    setError(null);
    const newMessages: Message[] = [...messages, { role: "user", content: content.trim() }];
    setMessages(newMessages);
    setDraft("");
    setLoading(true);

    try {
      const res = await api.post<{ content: string }>("/ai/copilot", {
        messages: newMessages,
        incident_id: incidentId ?? undefined,
      });
      setMessages([...newMessages, { role: "assistant", content: res.data.content }]);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      const msg = e.response?.data?.detail ?? "AI is unavailable. Check your AI configuration.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, incidentId]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(draft);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  function clearConversation() {
    setMessages([]);
    setError(null);
  }

  return (
    <>
      {/* Trigger button — fixed bottom-right */}
      <button
        onClick={() => setOpen(true)}
        title="AI Copilot (⌘⇧A)"
        className={cn(
          "fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all duration-200",
          "bg-gradient-to-br from-purple-600 to-purple-800 text-white hover:from-purple-500 hover:to-purple-700",
          open && "opacity-0 pointer-events-none"
        )}
      >
        <Sparkles className="h-4 w-4" />
        <span className="text-sm font-medium">AI Copilot</span>
      </button>

      {/* Drawer overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="absolute inset-y-0 right-0 w-full max-w-md flex flex-col bg-background border-l border-border shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-purple-700">
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold">AI Copilot</p>
                  {incident && (
                    <p className="text-xs text-muted-foreground truncate max-w-48">{incident.title}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={clearConversation}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Clear conversation"
                  >
                    <Plus className="h-4 w-4 rotate-45" />
                  </button>
                )}
                <a
                  href="/ai-config"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="AI Configuration"
                >
                  <Settings className="h-4 w-4" />
                </a>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Context badge */}
            {incident && (
              <div className="px-4 py-2 bg-purple-50/50 dark:bg-purple-950/20 border-b border-border shrink-0">
                <p className="text-xs text-muted-foreground">
                  Context loaded: <span className="font-medium text-foreground">{incident.severity} {incident.incident_type}</span>
                  {" · "}{incident.phase.replace("_", " ")} phase
                </p>
              </div>
            )}

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 && !loading && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground text-center">
                    {incident
                      ? `Ask anything about "${incident.title}" or get help with your response.`
                      : "Ask anything about incident response or get help navigating the platform."}
                  </p>
                  <div className="space-y-1.5">
                    {SUGGESTED_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => sendMessage(prompt)}
                        className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-xl px-3 py-2.5 text-sm",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <div className="space-y-1">
                        <div className="prose prose-sm dark:prose-invert max-w-none text-sm whitespace-pre-wrap">
                          {msg.content}
                        </div>
                        <div className="flex justify-end mt-1">
                          <button
                            onClick={() => copyToClipboard(msg.content)}
                            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors opacity-60 hover:opacity-100"
                            title="Copy response"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-xl px-4 py-3 flex items-center gap-2">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">Thinking…</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 px-4 py-3">
                  <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                  {error.includes("not configured") && (
                    <a href="/ai-config" className="text-xs text-primary hover:underline mt-1 block">
                      Configure AI →
                    </a>
                  )}
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input area */}
            <div className="shrink-0 border-t border-border px-4 py-3 bg-card">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
                  rows={2}
                  disabled={loading}
                  className="flex-1 resize-none px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                />
                <button
                  onClick={() => sendMessage(draft)}
                  disabled={!draft.trim() || loading}
                  className="p-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                AI can make mistakes. Verify critical information independently.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Mount AICopilot in dashboard layout**

Open `frontend/src/app/(dashboard)/layout.tsx`. Add the import and render the component:

```tsx
import { AICopilot } from "@/components/AICopilot";
```

Inside the layout's main JSX (after the `<Sidebar />` and the main content area, before the closing `</div>`):
```tsx
<AICopilot />
```

- [ ] **Step 3: Verify in browser**

Navigate to any page — a purple "AI Copilot" button should appear at the bottom-right. Click it to open the drawer. Press `Cmd+Shift+A` to toggle. Navigate to an incident and open the copilot — the context badge should show the incident's severity and type. Send a message and confirm a response arrives.

If no AI is configured, the response should show an error with a link to `/ai-config`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/AICopilot.tsx \
        frontend/src/app/\(dashboard\)/layout.tsx
git commit -m "feat: AI Copilot drawer with incident context and ⌘⇧A shortcut"
```

---

### Task 3: Upgrade Exec Brief to Structured Sections

**Files:**
- Modify: `backend/app/routers/incidents.py`

- [ ] **Step 1: Find the exec brief endpoint**

Open `backend/app/routers/incidents.py` and find the `generate_exec_brief` function (around line 528). Locate the `prompt` variable.

- [ ] **Step 2: Replace the prompt with a structured version**

Replace this block:
```python
prompt = f"""Create a concise executive briefing for the following incident. Be factual, clear, and avoid technical jargon. Structure it with: Situation, Impact, Current Status, Immediate Actions Taken, and Next Steps.
...
Key Notes:
{exec_notes or 'No pinned notes yet'}"""
```

With:
```python
    # Fetch timeline for the brief
    from app.models.incident import TimelineEvent
    from sqlalchemy.orm import selectinload as _selectinload
    tl_result = await db.execute(
        select(TimelineEvent)
        .where(TimelineEvent.incident_id == incident_id)
        .order_by(TimelineEvent.occurred_at.desc())
        .limit(8)
    )
    timeline_events = tl_result.scalars().all()
    timeline_lines = "\n".join([
        f"  - [{e.occurred_at.strftime('%H:%M UTC')}] {e.event_type}: {e.description}"
        for e in reversed(timeline_events)
    ]) or "  No events recorded"

    # Fetch task completion
    from app.models.incident import IncidentTask
    task_result = await db.execute(
        select(IncidentTask).where(IncidentTask.incident_id == incident_id)
    )
    all_tasks = task_result.scalars().all()
    done_tasks = [t for t in all_tasks if t.status == "DONE"]
    open_tasks = [t for t in all_tasks if t.status not in ("DONE", "CANCELLED")]

    elapsed_h = round((datetime.now(timezone.utc) - incident.started_at.replace(tzinfo=timezone.utc)).total_seconds() / 3600, 1)

    prompt = f"""You are writing a structured executive briefing for a security incident. Write clearly, avoid jargon, be factual and concise. Use markdown headers for each section.

INCIDENT DATA:
- Title: {incident.title}
- Type: {incident.incident_type.value}
- Severity: {incident.severity.value}
- Status: {incident.status.value}
- Phase: {incident.phase.value}
- Active: {elapsed_h} hours
- IOCs documented: {len(incident.iocs)}
- Affected assets: {len(incident.assets)}
- Tasks: {len(done_tasks)} completed, {len(open_tasks)} open

TOP IOCs (up to 10):
{chr(10).join([f"  - [{i.ioc_type.value}] {i.value} ({i.confidence} confidence)" for i in incident.iocs[:10]]) or "  None documented"}

AFFECTED ASSETS (up to 8):
{chr(10).join([f"  - {a.name} ({a.asset_type}) — {a.status}" for a in incident.assets[:8]]) or "  None documented"}

COMPLETED TASKS (up to 8):
{chr(10).join([f"  - {t.title}" for t in done_tasks[:8]]) or "  None completed yet"}

OPEN TASKS (up to 5):
{chr(10).join([f"  - {t.title} [{t.priority}]" for t in open_tasks[:5]]) or "  None"}

TIMELINE HIGHLIGHTS:
{timeline_lines}

PINNED NOTES:
{exec_notes or "  No pinned notes"}

Write a structured executive briefing using EXACTLY these markdown sections:

## Situation
(2-3 sentences: what happened, when it was detected, current status)

## Impact
(Affected systems, data at risk, business impact, estimated scope)

## Indicators of Compromise
(Key IOCs with type and confidence — bullets)

## Actions Taken
(Completed response steps — bullets)

## Recommended Next Steps
(Phase-appropriate priority actions — numbered list)

## Timeline Highlights
(3-5 key events with times — bullets)

Be specific. Use the data provided above. Do not invent facts not supported by the data."""
```

Also add the missing import at the top of the function scope:
```python
from datetime import datetime, timezone
```

(Check if already imported at module level in incidents.py — if so, skip.)

- [ ] **Step 3: Verify in browser**

Open an incident with some IOCs and tasks. Click "AI Exec Brief" — the resulting pinned note should now have `## Situation`, `## Impact`, etc. sections in it. The note should render in the War Room notes panel.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/incidents.py
git commit -m "feat: structured multi-section exec brief with full incident data"
```

---

### Task 4: Add IOC Analysis Button to War Room and IOC Tab

**Files:**
- Modify: `frontend/src/app/(dashboard)/incidents/[id]/page.tsx`
- Modify: `frontend/src/app/(dashboard)/incidents/[id]/iocs/page.tsx`

- [ ] **Step 1: Add analysis to War Room IOC panel**

Open `frontend/src/app/(dashboard)/incidents/[id]/page.tsx`.

Add state for IOC analysis:
```tsx
const [analyzingIOC, setAnalyzingIOC] = useState<string | null>(null);
const [iocAnalyses, setIocAnalyses] = useState<Record<string, string>>({});
```

Add the `analyzeIOC` function:
```tsx
async function analyzeIOC(ioc: IOC) {
  setAnalyzingIOC(ioc.id);
  try {
    const res = await api.post<{ analysis: string }>("/ai/analyze-ioc", {
      ioc_type: ioc.type,
      value: ioc.value,
      context: `Incident: ${incident?.title}, Type: ${incident?.incident_type}, Severity: ${incident?.severity}`,
    });
    setIocAnalyses((prev) => ({ ...prev, [ioc.id]: res.data.analysis }));
    toast.success("IOC analysis complete");
  } catch (err: unknown) {
    const e = err as { response?: { data?: { detail?: string } } };
    toast.error(e.response?.data?.detail ?? "AI not configured");
  } finally {
    setAnalyzingIOC(null);
  }
}
```

Add `Sparkles` to the lucide-react import.

Find the IOC list render (the `iocs.map((ioc) => ...)` block). Inside each IOC item, add an analyze button and analysis display after the existing IOC metadata:

```tsx
{iocs.map((ioc) => (
  <div key={ioc.id} className="px-4 py-2.5">
    <div className="flex items-start gap-2">
      <span className="text-sm shrink-0 mt-0.5">{IOC_TYPE_ICONS[ioc.type] ?? "❓"}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono text-foreground truncate">{ioc.value}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{ioc.type.replace("_", " ")}</span>
          <span className={`text-xs font-medium ${ioc.confidence === "HIGH" ? "text-red-500" : ioc.confidence === "MEDIUM" ? "text-yellow-500" : "text-green-500"}`}>
            {ioc.confidence}
          </span>
          {canAnalyst && (
            <button
              onClick={() => analyzeIOC(ioc)}
              disabled={analyzingIOC === ioc.id}
              className="text-[10px] text-purple-600 hover:text-purple-700 dark:text-purple-400 flex items-center gap-0.5 disabled:opacity-50"
            >
              <Sparkles className="h-2.5 w-2.5" />
              {analyzingIOC === ioc.id ? "Analyzing…" : iocAnalyses[ioc.id] ? "Re-analyze" : "Analyze"}
            </button>
          )}
        </div>
        {iocAnalyses[ioc.id] && (
          <div className="mt-2 p-2 rounded bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900">
            <p className="text-[11px] text-foreground whitespace-pre-wrap leading-relaxed">{iocAnalyses[ioc.id]}</p>
          </div>
        )}
      </div>
    </div>
  </div>
))}
```

- [ ] **Step 2: Verify the Analyze button works**

Open an incident with IOCs. Click "Analyze" next to an IOC. It should show "Analyzing…" then display the AI analysis inline below the IOC. Requires AI to be configured.

- [ ] **Step 3: Add analysis button to the dedicated IOC tab**

Open `frontend/src/app/(dashboard)/incidents/[id]/iocs/page.tsx`. Read the current structure to understand how IOCs are rendered there.

Add the same `analyzeIOC` state and function pattern, and add the "Analyze" button with `Sparkles` icon to each IOC row in the IOC tab table/list.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(dashboard\)/incidents/\[id\]/page.tsx \
        frontend/src/app/\(dashboard\)/incidents/\[id\]/iocs/page.tsx
git commit -m "feat: AI IOC analysis button in war room and IOC tab"
```

---

### Task 5: Add Phase Parameter to Task Generation

**Files:**
- Modify: `backend/app/routers/ai.py`
- Modify: `frontend/src/app/(dashboard)/incidents/[id]/tasks/page.tsx`

- [ ] **Step 1: Add phase to the backend request schema**

In `backend/app/routers/ai.py`, find the `GenerateTasksRequest` class:
```python
class GenerateTasksRequest(BaseModel):
    incident_title: str
    incident_type: str
    incident_description: str | None = None
    provider: str | None = None
```

Add the `phase` field:
```python
class GenerateTasksRequest(BaseModel):
    incident_title: str
    incident_type: str
    incident_description: str | None = None
    phase: str | None = None
    provider: str | None = None
```

- [ ] **Step 2: Update the task generation prompt to be phase-aware**

Find the `generate_tasks` endpoint. Replace the `prompt` variable:

```python
    phase_context = ""
    if body.phase and body.phase not in ("PREPARATION", "POST_INCIDENT"):
        phase_context = f"\nCurrent response phase: {body.phase.replace('_', ' ')} — generate tasks appropriate for THIS phase specifically, not the full lifecycle."

    prompt = f"""Generate a focused task list for an active incident response. Return ONLY a JSON array of task objects.

Incident: {body.incident_title}
Type: {body.incident_type}{phase_context}
{f'Description: {body.incident_description}' if body.incident_description else ''}

Each task object must have:
- title: string (clear, actionable, imperative verb)
- priority: one of CRITICAL | HIGH | MEDIUM | LOW
- description: string (1-2 sentences: what to do and why)
- role: string (suggested role: "IR Lead" | "Analyst" | "Legal" | "Comms" | "Executive" — who should own this)

{f'Focus on tasks relevant to the {body.phase.replace("_", " ")} phase. Do not include tasks for earlier phases.' if body.phase else 'Include tasks across all phases of the response lifecycle.'}

Return only valid JSON array, no other text."""
```

- [ ] **Step 3: Update the task generation UI to pass phase**

Open `frontend/src/app/(dashboard)/incidents/[id]/tasks/page.tsx`. Read the current structure to find where `generate-tasks` is called (look for `api.post("/ai/generate-tasks")`).

Find the task generation call and add `phase: incident?.phase` to the request body:
```tsx
const res = await api.post("/ai/generate-tasks", {
  incident_title: incident?.title,
  incident_type: incident?.incident_type,
  incident_description: incident?.description ?? undefined,
  phase: incident?.phase,  // ADD THIS
});
```

Also, add a UI indicator showing which phase tasks are being generated for. Find the "Generate Tasks" button and add context text:
```tsx
<button
  onClick={generateTasks}
  disabled={generatingTasks || !incident}
  className="flex items-center gap-1.5 px-3 py-2 border border-border text-sm font-medium rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
>
  <Sparkles className="h-4 w-4" />
  {generatingTasks ? "Generating…" : `Generate Tasks${incident?.phase ? ` (${incident.phase.replace("_", " ")})` : ""}`}
</button>
```

- [ ] **Step 4: Verify in browser**

Open an incident in CONTAINMENT phase. Click "Generate Tasks" — the generated tasks should be relevant to containment (e.g. "Isolate affected systems", "Block IOC at firewall") rather than generic lifecycle tasks.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/ai.py \
        frontend/src/app/\(dashboard\)/incidents/\[id\]/tasks/page.tsx
git commit -m "feat: phase-aware task generation with role suggestions"
```

---

### Task 6: Improve Post-Mortem Generation UI

**Files:**
- Modify: `frontend/src/app/(dashboard)/incidents/[id]/postmortem/page.tsx`

- [ ] **Step 1: Read the current post-mortem page structure**

The post-mortem page uses `EditableSection` components for each field and has an AI generation trigger. The AI generation endpoint `/api/ai/generate-postmortem` already exists and returns all post-mortem fields.

Find where the AI generation is called. Currently it should call `api.post("/ai/generate-postmortem", ...)` and set the result. If the generate button doesn't exist yet, add it.

- [ ] **Step 2: Add a prominent "Generate from Incident Data" button**

Find the main action area (near the top of the page, next to other action buttons). Add:

```tsx
const [generating, setGenerating] = useState(false);
const [confirmOverwrite, setConfirmOverwrite] = useState(false);

async function handleGenerate() {
  if (postmortem && (postmortem.summary || postmortem.root_cause)) {
    setConfirmOverwrite(true);
    return;
  }
  await runGenerate();
}

async function runGenerate() {
  setConfirmOverwrite(false);
  setGenerating(true);
  try {
    const res = await api.post<{
      summary: string; impact: string; timeline_notes: string;
      what_went_well: string; what_went_poorly: string; root_cause: string;
      five_whys: Array<{ why: string; answer: string }>; lessons_learned: string;
    }>("/ai/generate-postmortem", { incident_id: id });

    // Populate all fields via the existing upsert mutation
    await upsertMutation.mutateAsync({
      summary: res.data.summary,
      impact: res.data.impact,
      timeline_notes: res.data.timeline_notes,
      what_went_well: res.data.what_went_well,
      what_went_poorly: res.data.what_went_poorly,
      root_cause: res.data.root_cause,
      five_whys: res.data.five_whys,
      lessons_learned: res.data.lessons_learned,
    });
    toast.success("Post-mortem generated from incident data");
  } catch (err: unknown) {
    const e = err as { response?: { data?: { detail?: string } } };
    toast.error(e.response?.data?.detail ?? "Generation failed. Check AI configuration.");
  } finally {
    setGenerating(false);
  }
}
```

Add the button in the page header actions area:
```tsx
{canEdit && (
  <button
    onClick={handleGenerate}
    disabled={generating}
    className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
  >
    <Sparkles className="h-4 w-4" />
    {generating ? "Generating…" : "Generate from Incident Data"}
  </button>
)}
```

Add the overwrite confirmation modal:
```tsx
{confirmOverwrite && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-background rounded-xl border border-border p-6 max-w-sm w-full mx-4 shadow-xl">
      <h3 className="font-semibold mb-2">Overwrite existing content?</h3>
      <p className="text-sm text-muted-foreground mb-4">
        This post-mortem already has content. Generating will replace all fields with AI-generated content.
      </p>
      <div className="flex gap-2 justify-end">
        <button onClick={() => setConfirmOverwrite(false)} className="px-4 py-2 border border-border text-sm rounded-lg">Cancel</button>
        <button onClick={runGenerate} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg">
          Overwrite
        </button>
      </div>
    </div>
  </div>
)}
```

Make sure the `upsertMutation` (the PATCH mutation for the post-mortem) is correctly typed to accept all fields including `five_whys`.

- [ ] **Step 3: Verify in browser**

Open a closed incident → Post-Mortem tab. Click "Generate from Incident Data". All sections should populate with AI-generated content. Click the pencil to edit any section and confirm the `RichTextEditor` shows the generated content.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/\(dashboard\)/incidents/\[id\]/postmortem/page.tsx
git commit -m "feat: improved post-mortem generation with overwrite confirmation"
```
