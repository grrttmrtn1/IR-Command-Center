"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import api from "@/lib/api";
import type { PostMortem, PostMortemActionItem, Incident, FiveWhy } from "@/lib/types";
import { useAuth, hasRole } from "@/lib/auth";
import { toast } from "sonner";
import {
  FileText, Sparkles, Plus, Trash2, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, Edit3, Save, X, User,
} from "lucide-react";
import { RichTextEditor } from "@/components/RichTextEditor";

const PRIORITY_STYLES: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  HIGH:     "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  MEDIUM:   "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  LOW:      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

const ITEM_STATUS_STYLES: Record<string, string> = {
  OPEN:        "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  DONE:        "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

function timeAgo(iso: string) {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
  return `${Math.round(diff / 1440)}d ago`;
}

interface EditableTextareaProps {
  label: string;
  value: string | null;
  field: string;
  placeholder: string;
  rows?: number;
  canEdit: boolean;
  onSave: (field: string, value: string) => void;
}

function EditableSection({ label, value, field, placeholder, rows = 4, canEdit, onSave }: EditableTextareaProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const handleSave = () => {
    onSave(field, draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
          <div className="flex items-center gap-1">
            <button onClick={handleSave} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium px-2 py-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
              <Save className="h-3 w-3" /> Save
            </button>
            <button onClick={() => { setDraft(value ?? ""); setEditing(false); }} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
        <RichTextEditor
          value={draft}
          onChange={setDraft}
          placeholder={placeholder}
          minHeight={`${rows * 24}px`}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
        {canEdit && (
          <button
            onClick={() => { setDraft(value ?? ""); setEditing(true); }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Edit3 className="h-3 w-3" />
          </button>
        )}
      </div>
      {value ? (
        <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{value}</div>
      ) : (
        <p className="text-sm text-muted-foreground italic">{placeholder}</p>
      )}
    </div>
  );
}

export default function PostMortemPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canWrite = hasRole(user, "ANALYST");

  const { data: incident } = useQuery({
    queryKey: ["incident", id],
    queryFn: () => api.get<Incident>(`/incidents/${id}`).then((r) => r.data),
  });

  const { data: pm, isLoading, error } = useQuery({
    queryKey: ["postmortem", id],
    queryFn: () => api.get<PostMortem>(`/incidents/${id}/postmortem`).then((r) => r.data),
    retry: false,
  });

  const [generating, setGenerating] = useState(false);
  const [addItem, setAddItem] = useState({
    show: false, title: "", description: "", owner_name: "", priority: "MEDIUM", due_at: "",
  });
  const [editingWhys, setEditingWhys] = useState(false);
  const [draftWhys, setDraftWhys] = useState<FiveWhy[]>([]);

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.put(`/incidents/${id}/postmortem`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["postmortem", id] });
      toast.success("Saved");
    },
    onError: () => toast.error("Failed to save"),
  });

  const addItemMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post(`/incidents/${id}/postmortem/action-items`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["postmortem", id] });
      setAddItem({ show: false, title: "", description: "", owner_name: "", priority: "MEDIUM", due_at: "" });
      toast.success("Action item added");
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: Record<string, unknown> }) =>
      api.patch(`/incidents/${id}/postmortem/action-items/${itemId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["postmortem", id] }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) =>
      api.delete(`/incidents/${id}/postmortem/action-items/${itemId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["postmortem", id] });
      toast.success("Action item removed");
    },
  });

  const handleFieldSave = (field: string, value: string) => {
    saveMutation.mutate({ [field]: value });
  };

  const handleWhysSave = () => {
    saveMutation.mutate({ five_whys: draftWhys });
    setEditingWhys(false);
  };

  const generateDraft = async () => {
    setGenerating(true);
    try {
      const res = await api.post<{
        summary: string; impact: string; timeline_notes: string;
        what_went_well: string; what_went_poorly: string; root_cause: string;
        five_whys: FiveWhy[]; lessons_learned: string;
      }>("/ai/generate-postmortem", { incident_id: id });

      await api.put(`/incidents/${id}/postmortem`, {
        ...res.data,
        ai_generated: true,
      });
      qc.invalidateQueries({ queryKey: ["postmortem", id] });
      toast.success("AI draft generated — review and edit each section");
    } catch {
      toast.error("Failed to generate — check AI configuration");
    } finally {
      setGenerating(false);
    }
  };

  const createBlankPM = async () => {
    await api.put(`/incidents/${id}/postmortem`, {});
    qc.invalidateQueries({ queryKey: ["postmortem", id] });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!pm || (error as { response?: { status?: number } })?.response?.status === 404) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">No Post-Mortem Yet</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            Document what happened, what went well, what didn&apos;t, and what actions will prevent recurrence.
          </p>
          {canWrite && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={createBlankPM}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
              >
                <Plus className="h-4 w-4" />
                Start Blank
              </button>
              <button
                onClick={generateDraft}
                disabled={generating}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Sparkles className="h-4 w-4" />
                {generating ? "Generating..." : "AI Generate Draft"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const openItems = pm.action_items.filter((i) => i.status !== "DONE");
  const doneItems = pm.action_items.filter((i) => i.status === "DONE");

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold">Post-Mortem Review</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {incident?.title} · Last updated {timeAgo(pm.updated_at)}
            {pm.ai_generated && (
              <span className="ml-2 inline-flex items-center gap-1 text-purple-600 dark:text-purple-400">
                <Sparkles className="h-3 w-3" /> AI-assisted draft
              </span>
            )}
          </p>
        </div>
        {canWrite && (
          <button
            onClick={generateDraft}
            disabled={generating}
            className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            {generating ? "Regenerating..." : "Regenerate with AI"}
          </button>
        )}
      </div>

      {pm.ai_generated && (
        <div className="rounded-lg border border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>This draft was AI-generated from incident data. Review and edit every section — especially root cause and 5 Whys — before finalizing.</span>
        </div>
      )}

      {/* Main sections grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <EditableSection
            label="Summary"
            value={pm.summary}
            field="summary"
            placeholder="What happened? How was it detected? How was it resolved?"
            rows={4}
            canEdit={canWrite}
            onSave={handleFieldSave}
          />
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <EditableSection
            label="Impact"
            value={pm.impact}
            field="impact"
            placeholder="Business and technical impact: systems affected, data at risk, downtime, customer impact..."
            rows={4}
            canEdit={canWrite}
            onSave={handleFieldSave}
          />
        </div>
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-900/10 p-5">
          <EditableSection
            label="What Went Well"
            value={pm.what_went_well}
            field="what_went_well"
            placeholder="Specific things the team did well — detection speed, communication, tooling..."
            rows={4}
            canEdit={canWrite}
            onSave={handleFieldSave}
          />
        </div>
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-900/10 p-5">
          <EditableSection
            label="What Didn't Go Well"
            value={pm.what_went_poorly}
            field="what_went_poorly"
            placeholder="Gaps, slow responses, missing tools, unclear ownership — be specific and blameless..."
            rows={4}
            canEdit={canWrite}
            onSave={handleFieldSave}
          />
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <EditableSection
            label="Timeline Notes"
            value={pm.timeline_notes}
            field="timeline_notes"
            placeholder="Key observations about the response timeline — what was fast, what was slow..."
            rows={4}
            canEdit={canWrite}
            onSave={handleFieldSave}
          />
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <EditableSection
            label="Root Cause"
            value={pm.root_cause}
            field="root_cause"
            placeholder="The actual root cause — not symptoms. What fundamental condition made this incident possible?"
            rows={4}
            canEdit={canWrite}
            onSave={handleFieldSave}
          />
        </div>
      </div>

      {/* 5 Whys */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            5 Whys Root Cause Analysis
          </label>
          {canWrite && !editingWhys && (
            <button
              onClick={() => { setDraftWhys(pm.five_whys?.length ? pm.five_whys : [{ why: "", answer: "" }]); setEditingWhys(true); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Edit3 className="h-3 w-3" /> Edit
            </button>
          )}
        </div>

        {editingWhys ? (
          <div className="space-y-3">
            {draftWhys.map((w, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 p-3 rounded-lg bg-muted/30 border border-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Why {i + 1}</span>
                  {draftWhys.length > 1 && (
                    <button onClick={() => setDraftWhys(draftWhys.filter((_, idx) => idx !== i))}>
                      <X className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                    </button>
                  )}
                </div>
                <input
                  value={w.why}
                  onChange={(e) => setDraftWhys(draftWhys.map((ww, idx) => idx === i ? { ...ww, why: e.target.value } : ww))}
                  placeholder={`Why question ${i + 1}...`}
                  className="px-2 py-1.5 text-sm border border-border rounded bg-background w-full"
                />
                <input
                  value={w.answer}
                  onChange={(e) => setDraftWhys(draftWhys.map((ww, idx) => idx === i ? { ...ww, answer: e.target.value } : ww))}
                  placeholder="Answer..."
                  className="px-2 py-1.5 text-sm border border-border rounded bg-background w-full"
                />
              </div>
            ))}
            <div className="flex items-center gap-2 mt-2">
              {draftWhys.length < 7 && (
                <button
                  onClick={() => setDraftWhys([...draftWhys, { why: "", answer: "" }])}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Add Why
                </button>
              )}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => { setEditingWhys(false); }}
                  className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded border border-border"
                >
                  Cancel
                </button>
                <button
                  onClick={handleWhysSave}
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:opacity-90 disabled:opacity-50"
                >
                  <Save className="h-3 w-3" /> Save
                </button>
              </div>
            </div>
          </div>
        ) : pm.five_whys?.length ? (
          <div className="space-y-2">
            {pm.five_whys.map((w, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-lg bg-muted/20 border border-border">
                <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{w.why || `Why ${i + 1}`}</p>
                  <p className="text-sm text-foreground mt-0.5">{w.answer}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No 5 Whys analysis yet. Ask &ldquo;why&rdquo; 5 times to find the real root cause.</p>
        )}
      </div>

      {/* Lessons learned */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-900/10 p-5">
        <EditableSection
          label="Lessons Learned"
          value={pm.lessons_learned}
          field="lessons_learned"
          placeholder="3-5 actionable takeaways. What will prevent recurrence? What will improve response next time?"
          rows={4}
          canEdit={canWrite}
          onSave={handleFieldSave}
        />
      </div>

      {/* Action items */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-semibold">Action Items</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {openItems.length} open · {doneItems.length} complete
            </p>
          </div>
          {canWrite && (
            <button
              onClick={() => setAddItem({ ...addItem, show: true })}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Item
            </button>
          )}
        </div>

        {addItem.show && (
          <div className="p-4 border-b border-border bg-muted/30 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground block mb-1">Title *</label>
                <input
                  value={addItem.title}
                  onChange={(e) => setAddItem({ ...addItem, title: e.target.value })}
                  placeholder="What needs to happen?"
                  className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Priority</label>
                <select
                  value={addItem.priority}
                  onChange={(e) => setAddItem({ ...addItem, priority: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background"
                >
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Due date</label>
                <input
                  type="date"
                  value={addItem.due_at}
                  onChange={(e) => setAddItem({ ...addItem, due_at: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground block mb-1">Owner</label>
                <input
                  value={addItem.owner_name}
                  onChange={(e) => setAddItem({ ...addItem, owner_name: e.target.value })}
                  placeholder="Name or team..."
                  className="w-full px-2 py-1.5 text-sm border border-border rounded-md bg-background"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => addItemMutation.mutate({
                  title: addItem.title,
                  priority: addItem.priority,
                  owner_name: addItem.owner_name || undefined,
                  due_at: addItem.due_at || undefined,
                })}
                disabled={!addItem.title || addItemMutation.isPending}
                className="flex-1 py-2 bg-primary text-primary-foreground text-sm rounded-lg disabled:opacity-50"
              >
                Add Action Item
              </button>
              <button
                onClick={() => setAddItem({ show: false, title: "", description: "", owner_name: "", priority: "MEDIUM", due_at: "" })}
                className="px-4 py-2 border border-border text-sm rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {pm.action_items.length === 0 ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No action items yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {[...openItems, ...doneItems].map((item) => (
              <ActionItemRow
                key={item.id}
                item={item}
                canEdit={canWrite}
                onStatusChange={(status) => updateItemMutation.mutate({ itemId: item.id, data: { status } })}
                onDelete={() => deleteItemMutation.mutate(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionItemRow({
  item, canEdit, onStatusChange, onDelete,
}: {
  item: PostMortemActionItem;
  canEdit: boolean;
  onStatusChange: (status: string) => void;
  onDelete: () => void;
}) {
  const [showStatus, setShowStatus] = useState(false);
  const isDone = item.status === "DONE";

  return (
    <div className={`px-5 py-4 flex items-start gap-4 ${isDone ? "opacity-60" : ""}`}>
      <button
        onClick={() => canEdit && onStatusChange(isDone ? "OPEN" : "DONE")}
        disabled={!canEdit}
        className={`shrink-0 mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          isDone
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-border hover:border-emerald-400"
        } ${canEdit ? "cursor-pointer" : ""}`}
      >
        {isDone && <CheckCircle2 className="h-3.5 w-3.5" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {item.title}
            </span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${PRIORITY_STYLES[item.priority]}`}>
              {item.priority}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <div className="relative">
                <button
                  onClick={() => setShowStatus(!showStatus)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${ITEM_STATUS_STYLES[item.status]} cursor-pointer`}
                >
                  {item.status.replace(/_/g, " ")}
                  <ChevronDown className="h-2.5 w-2.5" />
                </button>
                {showStatus && (
                  <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded-lg shadow-lg z-10 overflow-hidden">
                    {["OPEN", "IN_PROGRESS", "DONE"].map((s) => (
                      <button
                        key={s}
                        onClick={() => { onStatusChange(s); setShowStatus(false); }}
                        className="block w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors"
                      >
                        {s.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {canEdit && (
              <button onClick={onDelete} className="text-muted-foreground hover:text-red-500 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {item.owner_name && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              {item.owner_name}
            </span>
          )}
          {item.due_at && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Due {new Date(item.due_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
