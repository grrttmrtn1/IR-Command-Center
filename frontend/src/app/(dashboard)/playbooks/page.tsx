"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth, hasRole } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import type { Playbook, PlaybookStep, Incident, IncidentType } from "@/lib/types";
import { toast } from "sonner";
import {
  BookOpen, Plus, Pencil, Trash2, X, ChevronDown, ChevronRight,
  Shield, Zap, AlertTriangle, CheckCircle2, Circle, Lock, Play,
} from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { RichTextEditor } from "@/components/RichTextEditor";

const TYPE_LABELS: Record<string, string> = {
  RANSOMWARE: "Ransomware",
  DATA_BREACH: "Data Breach",
  INSIDER_THREAT: "Insider Threat",
  DDOS: "DDoS",
  PHISHING: "Phishing / BEC",
  MALWARE: "Malware / APT",
  VULNERABILITY: "Vulnerability",
  OTHER: "Other",
};

const TYPE_COLORS: Record<string, string> = {
  RANSOMWARE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  DATA_BREACH: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  INSIDER_THREAT: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  DDOS: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  PHISHING: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  MALWARE: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  VULNERABILITY: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  OTHER: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

const PHASE_COLORS: Record<string, string> = {
  DETECTION: "bg-yellow-50 text-yellow-700 border-yellow-200",
  ANALYSIS: "bg-blue-50 text-blue-700 border-blue-200",
  CONTAINMENT: "bg-orange-50 text-orange-700 border-orange-200",
  ERADICATION: "bg-red-50 text-red-700 border-red-200",
  RECOVERY: "bg-green-50 text-green-700 border-green-200",
  POST_INCIDENT: "bg-purple-50 text-purple-700 border-purple-200",
};

const INCIDENT_TYPES: IncidentType[] = [
  "RANSOMWARE", "DATA_BREACH", "INSIDER_THREAT", "DDOS", "PHISHING", "MALWARE", "VULNERABILITY", "OTHER",
];

const PHASES = ["DETECTION", "ANALYSIS", "CONTAINMENT", "ERADICATION", "RECOVERY", "POST_INCIDENT"];

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function newStep(order: number): PlaybookStep {
  return {
    id: uuid(),
    order,
    title: "",
    description: null,
    role: null,
    phase: "DETECTION",
    is_decision_point: false,
    escalation_trigger: null,
  };
}

function PlaybookDetail({ pb, onEdit, onDelete, canWrite }: {
  pb: Playbook;
  onEdit: () => void;
  onDelete: () => void;
  canWrite: boolean;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [activateModal, setActivateModal] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState("");

  const { data: incidents = [] } = useQuery<Incident[]>({
    queryKey: ["incidents-open"],
    queryFn: () => api.get<Incident[]>("/incidents?status=OPEN&limit=100").then((r) => r.data),
    enabled: activateModal,
  });

  const activateMutation = useMutation({
    mutationFn: () => api.post(`/playbooks/${pb.id}/activate`, { incident_id: selectedIncident }),
    onSuccess: (res) => {
      toast.success(`${res.data.created} tasks seeded into incident`);
      setActivateModal(false);
      setSelectedIncident("");
    },
    onError: () => toast.error("Failed to activate playbook"),
  });

  const steps = [...(pb.steps || [])].sort((a, b) => a.order - b.order);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[pb.incident_type] ?? TYPE_COLORS.OTHER}`}>
                {TYPE_LABELS[pb.incident_type] ?? pb.incident_type}
              </span>
              {pb.is_system && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1">
                  <Shield className="h-3 w-3" /> Built-in
                </span>
              )}
              {!pb.is_active && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>
              )}
            </div>
            <h3 className="font-semibold text-base leading-tight">{pb.title}</h3>
            {pb.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{pb.description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2">{steps.length} steps · Updated {formatDate(pb.updated_at)}</p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {canWrite && (
              <button
                onClick={() => setActivateModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Play className="h-3 w-3" /> Activate
              </button>
            )}
            {canWrite && !pb.is_system && (
              <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {canWrite && pb.is_system && (
              <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Create customized copy">
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {canWrite && !pb.is_system && (
              <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {expanded ? "Hide" : "Show"} steps
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border divide-y divide-border/50">
          {steps.map((step, idx) => (
            <div key={step.id} className="px-5 py-3 flex gap-3">
              <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step.is_decision_point ? "bg-amber-100 text-amber-700 ring-2 ring-amber-300" : "bg-muted text-muted-foreground"}`}>
                  {step.is_decision_point ? "?" : idx + 1}
                </div>
                {idx < steps.length - 1 && <div className="w-px flex-1 bg-border min-h-[8px]" />}
              </div>
              <div className="flex-1 min-w-0 pb-2">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-sm font-medium">{step.title}</span>
                  {step.phase && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${PHASE_COLORS[step.phase] ?? "bg-muted text-muted-foreground border-border"}`}>
                      {step.phase.replace("_", " ")}
                    </span>
                  )}
                  {step.role && (
                    <span className="text-[10px] text-muted-foreground font-medium">{step.role}</span>
                  )}
                </div>
                {step.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
                )}
                {step.escalation_trigger && (
                  <div className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-2 py-1.5 border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                    <span>{step.escalation_trigger}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Activate modal */}
      {activateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">Activate Playbook</h2>
              <button onClick={() => setActivateModal(false)}><X className="h-4 w-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Select an open incident to seed its task board with the <strong>{pb.title}</strong> steps.
            </p>
            <select
              value={selectedIncident}
              onChange={(e) => setSelectedIncident(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 mb-4"
            >
              <option value="">Select an incident…</option>
              {incidents.map((inc) => (
                <option key={inc.id} value={inc.id}>
                  {inc.title} ({inc.severity})
                </option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setActivateModal(false)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors">
                Cancel
              </button>
              <button
                onClick={() => activateMutation.mutate()}
                disabled={!selectedIncident || activateMutation.isPending}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {activateMutation.isPending ? "Seeding…" : "Seed Tasks"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlaybookEditor({ initial, onSave, onCancel, isSystem }: {
  initial?: Playbook;
  onSave: (data: { title: string; description: string; incident_type: string; steps: PlaybookStep[]; tags: string[] }) => void;
  onCancel: () => void;
  isSystem?: boolean;
}) {
  const [title, setTitle] = useState(initial ? (isSystem ? `${initial.title} (Custom)` : initial.title) : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [incidentType, setIncidentType] = useState(initial?.incident_type ?? "RANSOMWARE");
  const [steps, setSteps] = useState<PlaybookStep[]>(
    initial ? [...initial.steps].sort((a, b) => a.order - b.order) : [newStep(1)]
  );
  const [expandedStep, setExpandedStep] = useState<string | null>(steps[0]?.id ?? null);

  function addStep() {
    const s = newStep(steps.length + 1);
    setSteps([...steps, s]);
    setExpandedStep(s.id);
  }

  function updateStep(id: string, patch: Partial<PlaybookStep>) {
    setSteps(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function removeStep(id: string) {
    const updated = steps.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i + 1 }));
    setSteps(updated);
  }

  function moveStep(id: string, dir: -1 | 1) {
    const idx = steps.findIndex((s) => s.id === id);
    if (idx + dir < 0 || idx + dir >= steps.length) return;
    const arr = [...steps];
    [arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]];
    setSteps(arr.map((s, i) => ({ ...s, order: i + 1 })));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <h2 className="font-semibold text-lg">
          {initial && !isSystem ? "Edit Playbook" : "New Playbook"}
          {isSystem && <span className="ml-2 text-sm font-normal text-muted-foreground">(based on {initial?.title})</span>}
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors">Cancel</button>
          <button
            onClick={() => onSave({ title, description, incident_type: incidentType, steps, tags: [] })}
            disabled={!title.trim() || steps.length === 0}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Save Playbook
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: metadata */}
        <div className="w-80 border-r border-border p-6 overflow-y-auto shrink-0 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Playbook title"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Incident Type</label>
            <select
              value={incidentType}
              onChange={(e) => setIncidentType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {INCIDENT_TYPES.map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              placeholder="What this playbook covers…"
            />
          </div>
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">{steps.length} steps total</p>
            <button
              onClick={addStep}
              className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium border border-dashed border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4" /> Add Step
            </button>
          </div>
        </div>

        {/* Right: steps */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {steps.map((step, idx) => (
            <div key={step.id} className={`rounded-xl border bg-card overflow-hidden ${step.is_decision_point ? "border-amber-300 dark:border-amber-700" : "border-border"}`}>
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30"
                onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${step.is_decision_point ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                  {step.is_decision_point ? "?" : idx + 1}
                </div>
                <span className="text-sm font-medium flex-1 truncate">{step.title || <span className="text-muted-foreground italic">Untitled step</span>}</span>
                {step.phase && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${PHASE_COLORS[step.phase] ?? "bg-muted text-muted-foreground border-border"}`}>
                    {step.phase.replace("_", " ")}
                  </span>
                )}
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button disabled={idx === 0} onClick={() => moveStep(step.id, -1)} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs">↑</button>
                  <button disabled={idx === steps.length - 1} onClick={() => moveStep(step.id, 1)} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs">↓</button>
                  <button onClick={() => removeStep(step.id)} className="p-1 text-muted-foreground hover:text-red-500">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {expandedStep === step.id && (
                <div className="border-t border-border px-4 py-4 space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Title *</label>
                    <input
                      value={step.title}
                      onChange={(e) => updateStep(step.id, { title: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                      placeholder="Step title"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Phase</label>
                      <select
                        value={step.phase ?? ""}
                        onChange={(e) => updateStep(step.id, { phase: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        {PHASES.map((p) => <option key={p} value={p}>{p.replace("_", " ")}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Role</label>
                      <input
                        value={step.role ?? ""}
                        onChange={(e) => updateStep(step.id, { role: e.target.value || null })}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                        placeholder="e.g. IR Lead, Legal"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Description</label>
                    <RichTextEditor
                      value={step.description ?? ""}
                      onChange={(v) => updateStep(step.id, { description: v || null })}
                      placeholder="What to do in this step…"
                      minHeight="80px"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={step.is_decision_point}
                      onChange={(e) => updateStep(step.id, { is_decision_point: e.target.checked })}
                      className="rounded border-border"
                    />
                    <span className="text-sm font-medium">Decision point (go/no-go gate)</span>
                  </label>
                  {step.is_decision_point && (
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Escalation Trigger</label>
                      <input
                        value={step.escalation_trigger ?? ""}
                        onChange={(e) => updateStep(step.id, { escalation_trigger: e.target.value || null })}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                        placeholder="If X is true → do Y immediately"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {steps.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No steps yet. Click "Add Step" to get started.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PlaybooksPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canWrite = hasRole(user, "ANALYST");

  const [typeFilter, setTypeFilter] = useState<string>("");
  const [showEditor, setShowEditor] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState<Playbook | null>(null);
  const [editIsSystem, setEditIsSystem] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Playbook | null>(null);

  const { data: playbooks = [], isLoading } = useQuery<Playbook[]>({
    queryKey: ["playbooks"],
    queryFn: () => api.get<Playbook[]>("/playbooks").then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post("/playbooks", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playbooks"] });
      setShowEditor(false);
      setEditingPlaybook(null);
      toast.success("Playbook created");
    },
    onError: () => toast.error("Failed to save playbook"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => api.patch(`/playbooks/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playbooks"] });
      setShowEditor(false);
      setEditingPlaybook(null);
      toast.success("Playbook updated");
    },
    onError: () => toast.error("Failed to update playbook"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/playbooks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playbooks"] });
      setDeleteTarget(null);
      toast.success("Playbook deleted");
    },
    onError: () => toast.error("Failed to delete playbook"),
  });

  function handleEdit(pb: Playbook) {
    if (pb.is_system) {
      setEditingPlaybook(pb);
      setEditIsSystem(true);
    } else {
      setEditingPlaybook(pb);
      setEditIsSystem(false);
    }
    setShowEditor(true);
  }

  function handleSave(data: object) {
    if (editingPlaybook && !editIsSystem) {
      updateMutation.mutate({ id: editingPlaybook.id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  const filtered = typeFilter ? playbooks.filter((pb) => pb.incident_type === typeFilter) : playbooks;
  const systemPlaybooks = filtered.filter((pb) => pb.is_system);
  const customPlaybooks = filtered.filter((pb) => !pb.is_system);

  const typeOptions = Array.from(new Set(playbooks.map((pb) => pb.incident_type)));

  if (showEditor) {
    return (
      <PlaybookEditor
        initial={editingPlaybook ?? undefined}
        isSystem={editIsSystem}
        onSave={handleSave}
        onCancel={() => { setShowEditor(false); setEditingPlaybook(null); setEditIsSystem(false); }}
      />
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Response Playbooks</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Pre-approved step-by-step response guides. Built-in playbooks can be used directly or customized.
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() => { setEditingPlaybook(null); setEditIsSystem(false); setShowEditor(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> New Playbook
          </button>
        )}
      </div>

      {/* Type filter pills */}
      <div className="flex gap-2 flex-wrap mb-6">
        <button
          onClick={() => setTypeFilter("")}
          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${!typeFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
        >
          All ({playbooks.length})
        </button>
        {typeOptions.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(typeFilter === t ? "" : t)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${typeFilter === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
          >
            {TYPE_LABELS[t] ?? t} ({playbooks.filter((pb) => pb.incident_type === t).length})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-20 rounded-full" />
                  <Skeleton className="h-5 w-64" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-7 w-20 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {systemPlaybooks.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4" /> Built-in Playbooks
              </h2>
              <div className="space-y-3">
                {systemPlaybooks.map((pb) => (
                  <PlaybookDetail
                    key={pb.id}
                    pb={pb}
                    onEdit={() => handleEdit(pb)}
                    onDelete={() => setDeleteTarget(pb)}
                    canWrite={canWrite}
                  />
                ))}
              </div>
            </div>
          )}

          {customPlaybooks.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Custom Playbooks
              </h2>
              <div className="space-y-3">
                {customPlaybooks.map((pb) => (
                  <PlaybookDetail
                    key={pb.id}
                    pb={pb}
                    onEdit={() => handleEdit(pb)}
                    onDelete={() => setDeleteTarget(pb)}
                    canWrite={canWrite}
                  />
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <EmptyState
              icon={BookOpen}
              title="No playbooks found"
              description={playbooks.length === 0 ? "Create your first response playbook to get started." : "Try adjusting your filter."}
              action={playbooks.length === 0 && canWrite ? (
                <button
                  onClick={() => { setEditingPlaybook(null); setEditIsSystem(false); setShowEditor(true); }}
                  className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
                >
                  New Playbook
                </button>
              ) : undefined}
              className="border-2 border-dashed border-border rounded-xl py-16"
            />
          )}
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold mb-2">Delete Playbook?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              <strong>{deleteTarget.title}</strong> will be permanently deleted.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted">Cancel</button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
