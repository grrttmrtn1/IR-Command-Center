"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X, ChevronDown, ChevronUp, Rocket } from "lucide-react";

const STORAGE_KEY = "ircc_onboarding_dismissed";

const STEPS = [
  {
    id: "ai",
    title: "Configure AI Provider",
    description: "Set up an AI model (Anthropic, OpenAI, etc.) to unlock AI-powered features.",
    href: "/settings",
    cta: "Go to Settings",
  },
  {
    id: "contacts",
    title: "Add Your IR Team",
    description: "Import your on-call roster and escalation contacts.",
    href: "/contacts",
    cta: "Add Contacts",
  },
  {
    id: "vendors",
    title: "Register IR Vendors",
    description: "Add your forensics retainer, legal counsel, and cyber insurance.",
    href: "/vendors",
    cta: "Add Vendors",
  },
  {
    id: "ir-plan",
    title: "Write Your IR Plan",
    description: "Document your incident response plan sections and review cadences.",
    href: "/ir-plan",
    cta: "Open IR Plan",
  },
  {
    id: "playbook",
    title: "Review Playbooks",
    description: "Customize the built-in playbooks or create your own for common incident types.",
    href: "/playbooks",
    cta: "View Playbooks",
  },
];

export function OnboardingChecklist() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
  });
  const [completed, setCompleted] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("ircc_onboarding_completed");
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  });
  const [collapsed, setCollapsed] = useState(false);

  if (dismissed) return null;

  function toggleStep(id: string) {
    setCompleted((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem("ircc_onboarding_completed", JSON.stringify(Array.from(next)));
      return next;
    });
  }

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  }

  const doneCount = STEPS.filter((s) => completed.has(s.id)).length;
  const progress = Math.round((doneCount / STEPS.length) * 100);
  const allDone = doneCount === STEPS.length;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Rocket className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {allDone ? "Setup complete!" : "Get started with IR Command Center"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {doneCount}/{STEPS.length} steps complete
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button
            onClick={dismiss}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-5 pb-3">
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-1.5 bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      {!collapsed && (
        <div className="divide-y divide-border/50 border-t border-border/50">
          {STEPS.map((step) => {
            const done = completed.has(step.id);
            return (
              <div key={step.id} className="flex items-start gap-3 px-5 py-3">
                <button
                  onClick={() => toggleStep(step.id)}
                  className="shrink-0 mt-0.5 transition-colors"
                  title={done ? "Mark as not done" : "Mark as done"}
                >
                  {done
                    ? <CheckCircle2 className="h-5 w-5 text-primary" />
                    : <Circle className="h-5 w-5 text-muted-foreground hover:text-primary" />
                  }
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                    {step.title}
                  </p>
                  {!done && <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>}
                </div>
                {!done && (
                  <Link
                    href={step.href}
                    className="shrink-0 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    {step.cta} →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
