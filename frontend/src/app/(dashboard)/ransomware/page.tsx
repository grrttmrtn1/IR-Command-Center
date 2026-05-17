"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth, hasRole } from "@/lib/auth";
import { toast } from "sonner";
import {
  AlertTriangle, Plus, Download, CheckCircle, Clock,
  Trash2, Lightbulb, ChevronRight, ChevronDown,
  Save, Flag, FileText, X, Phone, Mail, Building2,
} from "lucide-react";
import type { Vendor } from "@/lib/types";

const RETAINER_TYPES: Array<Vendor["vendor_type"]> = ["RANSOM_NEGOTIATOR", "FORENSICS", "LEGAL"];
const RETAINER_LABELS: Record<string, string> = {
  RANSOM_NEGOTIATOR: "Ransom Negotiator",
  FORENSICS: "Forensics",
  LEGAL: "Legal Counsel",
};

interface Question {
  id: string;
  question: string;
  guidance: string;
  risk_signal: string | null;
}

interface Phase {
  id: string;
  title: string;
  color: string;
  description: string;
  why_it_matters: string;
  questions: Question[];
}

interface DecisionOption {
  value: string;
  label: string;
  description: string;
}

interface DocField {
  id: string;
  label: string;
  placeholder: string;
}

interface Framework {
  phases: Phase[];
  decision_options: DecisionOption[];
  decision_documentation_fields: DocField[];
}

interface Session {
  id: string;
  incident_id: string | null;
  answers: Record<string, string>;
  decision: string | null;
  decision_rationale: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

const PHASE_COLORS: Record<string, string> = {
  red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800",
};

const PHASE_BORDER: Record<string, string> = {
  red: "border-l-red-400",
  purple: "border-l-purple-400",
  blue: "border-l-blue-400",
  green: "border-l-green-400",
  orange: "border-l-orange-400",
};

const DECISION_COLORS: Record<string, string> = {
  DO_NOT_PAY: "border-green-500 bg-green-50 dark:bg-green-950/20",
  PAY: "border-red-500 bg-red-50 dark:bg-red-950/20",
  DEFER: "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20",
  HYBRID: "border-blue-500 bg-blue-50 dark:bg-blue-950/20",
  UNDECIDED: "border-border bg-muted/20",
};

export default function RansomwareDecisionPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canWrite = hasRole(user, "IR_LEAD");

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [decision, setDecision] = useState("UNDECIDED");
  const [rationale, setRationale] = useState("");
  const [expandedPhase, setExpandedPhase] = useState<string | null>("initial_triage");
  const [showDecision, setShowDecision] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [showNewConfirm, setShowNewConfirm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["vendors"],
    queryFn: () => api.get<Vendor[]>("/vendors").then((r) => r.data),
  });

  const retainers = vendors.filter((v) => RETAINER_TYPES.includes(v.vendor_type));

  const { data: framework } = useQuery<Framework>({
    queryKey: ["ransomware-framework"],
    queryFn: () => api.get<Framework>("/ransomware/framework").then((r) => r.data),
  });

  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ["ransomware-sessions"],
    queryFn: () => api.get<Session[]>("/ransomware/sessions").then((r) => r.data),
  });

  const { data: activeSession } = useQuery<Session>({
    queryKey: ["ransomware-session", activeSessionId],
    queryFn: () => api.get<Session>(`/ransomware/sessions/${activeSessionId}`).then((r) => r.data),
    enabled: !!activeSessionId,
  });

  useEffect(() => {
    if (activeSession) {
      setAnswers(activeSession.answers ?? {});
      setDecision(activeSession.decision ?? "UNDECIDED");
      setRationale(activeSession.decision_rationale ?? "");
    }
  }, [activeSession?.id]);

  const createMutation = useMutation({
    mutationFn: () => api.post<Session>("/ransomware/sessions", {}).then((r) => r.data),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["ransomware-sessions"] });
      setActiveSessionId(s.id);
      setAnswers({});
      setDecision("UNDECIDED");
      setRationale("");
      setExpandedPhase("initial_triage");
      setShowNewConfirm(false);
      toast.success("New session started");
    },
    onError: () => toast.error("Failed to create session"),
  });

  const saveMutation = useMutation({
    mutationFn: (data: object) => api.patch(`/ransomware/sessions/${activeSessionId}`, data),
    onSuccess: () => {
      setSaveStatus("saved");
      qc.invalidateQueries({ queryKey: ["ransomware-sessions"] });
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      api.patch(`/ransomware/sessions/${activeSessionId}`, {
        answers,
        decision,
        decision_rationale: rationale,
        complete: true,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ransomware-sessions"] });
      qc.invalidateQueries({ queryKey: ["ransomware-session", activeSessionId] });
      toast.success("Session marked complete and documented");
    },
    onError: () => toast.error("Failed to complete session"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ransomware/sessions/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["ransomware-sessions"] });
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setAnswers({});
        setDecision("UNDECIDED");
        setRationale("");
      }
      setDeleteId(null);
      toast.success("Session deleted");
    },
    onError: () => toast.error("Failed to delete session"),
  });

  const scheduleAutoSave = useCallback(
    (newAnswers: Record<string, string>) => {
      if (!activeSessionId || !canWrite) return;
      setSaveStatus("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveMutation.mutate({ answers: newAnswers });
      }, 1200);
    },
    [activeSessionId, canWrite]
  );

  function setAnswer(questionId: string, value: string) {
    const updated = { ...answers, [questionId]: value };
    setAnswers(updated);
    scheduleAutoSave(updated);
  }

  function saveDecision() {
    if (!activeSessionId) return;
    saveMutation.mutate({ answers, decision, decision_rationale: rationale });
  }

  function exportSummary() {
    if (!framework) return;
    const lines = [
      "# Ransomware Decision Support — Session Summary",
      "",
      `Date exported: ${new Date().toLocaleString()}`,
      `Session ID: ${activeSessionId}`,
      `Decision: ${decision ?? "Undecided"}`,
      "",
    ];
    for (const phase of framework.phases) {
      lines.push(`## ${phase.title}`, "");
      for (const q of phase.questions) {
        lines.push(`### ${q.question}`, "", answers[q.id] || "_No response recorded_", "");
      }
    }
    lines.push("## Decision Rationale", "", rationale || "_Not documented_", "");
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ransomware-session-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalQuestions = framework?.phases.flatMap((p) => p.questions).length ?? 0;
  const answeredCount = Object.entries(answers).filter(([k, v]) => !k.startsWith("_doc_") && v.trim()).length;
  const progress = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const isComplete = !!activeSession?.completed_at;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Ransomware Decision Support</h1>
          <p className="text-muted-foreground mt-1">Structured decision framework — not legal or financial advice</p>
        </div>
        {canWrite && (
          <button
            onClick={() => setShowNewConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Session
          </button>
        )}
      </div>

      {/* Disclaimer */}
      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-4 mb-6 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800 dark:text-amber-400">
          <strong>Disclaimer:</strong> This tool structures your decision-making process. It does not provide legal, financial, or operational advice. All decisions should be made in consultation with qualified legal counsel, your incident response firm, and your insurance carrier.
        </p>
      </div>

      {/* Available Retainers */}
      <div className="rounded-xl border border-border bg-card mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Available Retainers</p>
          </div>
          <a href="/vendors" className="text-xs text-primary hover:underline">Manage vendors →</a>
        </div>
        {retainers.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-muted-foreground">
            No retainer vendors configured. <a href="/vendors" className="text-primary hover:underline">Add vendors</a> to surface them here.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {retainers.map((v) => (
              <div key={v.id} className="px-5 py-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{v.name}</p>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 shrink-0">
                      {RETAINER_LABELS[v.vendor_type] ?? v.vendor_type}
                    </span>
                    {v.expiry_warning && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 shrink-0">
                        Expiring soon
                      </span>
                    )}
                    {v.sla_response_hours != null && (
                      <span className="text-xs text-muted-foreground">SLA: {v.sla_response_hours}h</span>
                    )}
                  </div>
                  {v.primary_contact_name && (
                    <p className="text-xs text-muted-foreground mt-1">{v.primary_contact_name}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0 items-end">
                  {v.primary_contact_phone && (
                    <a
                      href={`tel:${v.primary_contact_phone}`}
                      className="flex items-center gap-1.5 text-xs text-foreground hover:text-primary transition-colors"
                    >
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      {v.primary_contact_phone}
                    </a>
                  )}
                  {v.primary_contact_email && (
                    <a
                      href={`mailto:${v.primary_contact_email}`}
                      className="flex items-center gap-1.5 text-xs text-foreground hover:text-primary transition-colors"
                    >
                      <Mail className="h-3 w-3 text-muted-foreground" />
                      {v.primary_contact_email}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New session confirm */}
      {showNewConfirm && (
        <div className="rounded-xl border border-border bg-card p-5 mb-6 flex items-center justify-between gap-4">
          <p className="text-sm">Start a new decision session? Any unsaved changes to the current session will remain in the database.</p>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg">
              Start New
            </button>
            <button onClick={() => setShowNewConfirm(false)} className="px-4 py-2 border border-border text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {/* Sessions list */}
      {sessions.length > 0 && (
        <div className="rounded-xl border border-border bg-card mb-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/30">
            <p className="text-sm font-semibold">Saved Sessions</p>
          </div>
          <div className="divide-y divide-border">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors cursor-pointer ${activeSessionId === s.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                onClick={() => { setActiveSessionId(s.id); setShowDecision(false); }}
              >
                <div className="flex items-center gap-3">
                  {s.completed_at ? (
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      Session — {new Date(s.created_at).toLocaleDateString()}
                      {s.completed_at && <span className="ml-2 text-xs text-green-600 dark:text-green-400">Completed</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.decision ? `Decision: ${s.decision.replace(/_/g, " ")}` : "Decision pending"}
                      {" · "}Updated {new Date(s.updated_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {activeSessionId === s.id && (
                    <span className="text-xs text-primary font-medium">Active</span>
                  )}
                  {deleteId === s.id ? (
                    <div className="flex gap-1">
                      <button onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(s.id); }} className="px-2 py-1 text-xs bg-red-500 text-white rounded">Delete</button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteId(null); }} className="px-2 py-1 text-xs border border-border rounded">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteId(s.id); }}
                      className="p-1.5 text-muted-foreground hover:text-red-500 rounded transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!activeSessionId && sessions.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-muted/10 flex flex-col items-center justify-center py-16 gap-3 text-center mb-6">
          <FileText className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No decision sessions yet</p>
          <p className="text-sm text-muted-foreground max-w-sm">Start a new session to work through the structured decision framework. Sessions are saved automatically as you work.</p>
          {canWrite && (
            <button onClick={() => createMutation.mutate()} className="mt-2 px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg">
              Start First Session
            </button>
          )}
        </div>
      )}

      {/* Active session workspace */}
      {activeSessionId && framework && (
        <>
          {/* Session toolbar */}
          <div className="rounded-xl border border-border bg-card p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">{answeredCount}/{totalQuestions} questions addressed</span>
                {saveStatus === "saving" && <span className="text-xs text-muted-foreground">Saving…</span>}
                {saveStatus === "saved" && <span className="text-xs text-green-600">Saved</span>}
                {isComplete && <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">Session Complete</span>}
              </div>
              <div className="flex gap-2">
                <button onClick={exportSummary} className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-sm rounded-lg hover:bg-muted transition-colors">
                  <Download className="h-3.5 w-3.5" />
                  Export
                </button>
                {canWrite && !isComplete && (
                  <button
                    onClick={() => setShowDecision(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    <Flag className="h-3.5 w-3.5" />
                    Document Decision
                  </button>
                )}
              </div>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div className="bg-primary h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Decision documentation panel */}
          {(showDecision || isComplete) && (
            <div className={`rounded-xl border-2 p-5 mb-5 ${DECISION_COLORS[decision] ?? DECISION_COLORS.UNDECIDED}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Decision Documentation</h3>
                {!isComplete && canWrite && (
                  <button onClick={() => setShowDecision(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Decision Reached</label>
                  {isComplete ? (
                    <p className="text-sm font-semibold">{decision.replace(/_/g, " ")}</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {framework.decision_options.map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${decision === opt.value ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/30"}`}
                        >
                          <input
                            type="radio"
                            name="decision"
                            value={opt.value}
                            checked={decision === opt.value}
                            onChange={() => setDecision(opt.value)}
                            className="mt-0.5"
                          />
                          <div>
                            <p className="text-sm font-medium">{opt.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Rationale and Key Factors</label>
                  {isComplete ? (
                    <p className="text-sm whitespace-pre-wrap">{rationale || "Not documented"}</p>
                  ) : (
                    <textarea
                      value={rationale}
                      onChange={(e) => setRationale(e.target.value)}
                      rows={4}
                      placeholder="Document the key factors that drove this decision — backup status, legal constraints, financial impact, OFAC screening result, etc."
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                    />
                  )}
                </div>

                {/* Documentation fields from framework */}
                {framework.decision_documentation_fields.map((field) => {
                  const val = answers[`_doc_${field.id}`] ?? "";
                  return (
                    <div key={field.id}>
                      <label className="block text-sm font-medium mb-1">{field.label}</label>
                      {isComplete ? (
                        <p className="text-sm text-muted-foreground">{val || "Not documented"}</p>
                      ) : (
                        <textarea
                          value={val}
                          onChange={(e) => setAnswer(`_doc_${field.id}`, e.target.value)}
                          rows={2}
                          placeholder={field.placeholder}
                          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                        />
                      )}
                    </div>
                  );
                })}

                {canWrite && !isComplete && (
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={saveDecision}
                      disabled={saveMutation.isPending}
                      className="flex items-center gap-2 px-4 py-2 border border-border text-sm rounded-lg hover:bg-muted transition-colors"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save
                    </button>
                    <button
                      onClick={() => completeMutation.mutate()}
                      disabled={completeMutation.isPending || decision === "UNDECIDED"}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Mark Complete
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Phase accordion */}
          <div className="space-y-3">
            {framework.phases.map((phase, phaseIdx) => {
              const phaseAnswered = phase.questions.filter((q) => answers[q.id]?.trim()).length;
              const isExpanded = expandedPhase === phase.id;
              const colorClass = PHASE_COLORS[phase.color] ?? PHASE_COLORS.blue;
              const borderClass = PHASE_BORDER[phase.color] ?? PHASE_BORDER.blue;

              return (
                <div key={phase.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <button
                    onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold border ${colorClass}`}>
                        {phaseAnswered === phase.questions.length ? "✓" : phaseIdx + 1}
                      </div>
                      <div>
                        <p className="font-semibold">{phase.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{phase.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground">{phaseAnswered}/{phase.questions.length}</span>
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border">
                      {/* Why it matters banner */}
                      <div className={`px-5 py-3 border-l-4 bg-muted/20 ${borderClass}`}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Why This Phase Matters</p>
                        <p className="text-sm">{phase.why_it_matters}</p>
                      </div>

                      <div className="px-5 py-4 space-y-6">
                        {phase.questions.map((q) => (
                          <div key={q.id}>
                            <label className="block text-sm font-semibold text-foreground mb-2">{q.question}</label>

                            {/* Guidance */}
                            <div className={`flex gap-2 p-3 rounded-lg mb-2 border-l-4 bg-muted/30 ${borderClass}`}>
                              <Lightbulb className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                              <p className="text-xs text-muted-foreground leading-relaxed">{q.guidance}</p>
                            </div>

                            {/* Risk signal */}
                            {q.risk_signal && (
                              <div className="flex gap-2 p-3 rounded-lg mb-2 border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
                                <Flag className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">{q.risk_signal}</p>
                              </div>
                            )}

                            <textarea
                              value={answers[q.id] ?? ""}
                              onChange={(e) => setAnswer(q.id, e.target.value)}
                              rows={3}
                              disabled={isComplete || !canWrite}
                              placeholder={canWrite && !isComplete ? "Document your team's assessment and key findings…" : "No response recorded"}
                              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-y disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                          </div>
                        ))}
                      </div>

                      {/* Next phase navigation */}
                      {phaseIdx < framework.phases.length - 1 && (
                        <div className="px-5 pb-4 flex justify-end">
                          <button
                            onClick={() => setExpandedPhase(framework.phases[phaseIdx + 1].id)}
                            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium"
                          >
                            Next: {framework.phases[phaseIdx + 1].title}
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      {phaseIdx === framework.phases.length - 1 && canWrite && !isComplete && (
                        <div className="px-5 pb-4 flex justify-end">
                          <button
                            onClick={() => setShowDecision(true)}
                            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium"
                          >
                            Document Decision
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
