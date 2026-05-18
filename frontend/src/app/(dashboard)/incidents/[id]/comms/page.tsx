"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import api from "@/lib/api";
import type { CommsDraft } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, Sparkles, ChevronRight, CheckCircle, Clock, FileText, AlertCircle, Trash2 } from "lucide-react";

interface Jurisdiction {
  code: string;
  name: string;
  deadline_hours: number | null;
  threshold: string | null;
  requirements: string[];
  contact_url: string | null;
  notes: string | null;
}

const STATUS_CONFIG: Record<CommsDraft["status"], { label: string; color: string; icon: React.ReactNode }> = {
  DRAFT: { label: "Draft", color: "text-slate-500 bg-slate-100 dark:bg-slate-800", icon: <FileText className="h-3 w-3" /> },
  UNDER_REVIEW: { label: "Under Review", color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/40", icon: <Clock className="h-3 w-3" /> },
  APPROVED: { label: "Approved", color: "text-green-600 bg-green-50 dark:bg-green-950/40", icon: <CheckCircle className="h-3 w-3" /> },
  SENT: { label: "Sent", color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40", icon: <CheckCircle className="h-3 w-3" /> },
  ARCHIVED: { label: "Archived", color: "text-muted-foreground bg-muted", icon: <AlertCircle className="h-3 w-3" /> },
};

export default function CrisisCommsPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [newDraftModal, setNewDraftModal] = useState(false);
  const [newDraft, setNewDraft] = useState({ title: "", jurisdiction: "", content: "" });
  const [generating, setGenerating] = useState(false);
  const [generatingContext, setGeneratingContext] = useState("");

  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ["comms-drafts", id],
    queryFn: () => api.get<CommsDraft[]>(`/comms/drafts?incident_id=${id}`).then((r) => r.data),
  });

  const { data: jurisdictions = [] } = useQuery({
    queryKey: ["jurisdictions"],
    queryFn: () => api.get<Jurisdiction[]>("/comms/jurisdictions").then((r) => r.data),
  });

  const selectedDraft = drafts.find((d) => d.id === selectedDraftId) ?? null;

  const createMutation = useMutation({
    mutationFn: (data: { title: string; jurisdiction: string; content: string; incident_id: string }) =>
      api.post<CommsDraft>("/comms/drafts", data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["comms-drafts", id] });
      setSelectedDraftId(res.data.id);
      setNewDraftModal(false);
      setNewDraft({ title: "", jurisdiction: "", content: "" });
      toast.success("Draft created");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ draftId, content }: { draftId: string; content: string }) =>
      api.patch<CommsDraft>(`/comms/drafts/${draftId}`, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comms-drafts", id] });
      toast.success("Draft saved");
    },
  });

  const approveMutation = useMutation({
    mutationFn: (draftId: string) => api.post<CommsDraft>(`/comms/drafts/${draftId}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comms-drafts", id] });
      toast.success("Draft approved");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (draftId: string) => api.delete(`/comms/drafts/${draftId}`),
    onSuccess: (_, draftId) => {
      qc.invalidateQueries({ queryKey: ["comms-drafts", id] });
      if (selectedDraftId === draftId) setSelectedDraftId(null);
      toast.success("Draft deleted");
    },
  });

  async function generateDraft(draftId: string) {
    setGenerating(true);
    try {
      const res = await api.post<CommsDraft>(`/comms/drafts/${draftId}/generate`, {
        context: generatingContext || undefined,
      });
      qc.setQueryData(["comms-drafts", id], (old: CommsDraft[] | undefined) =>
        old ? old.map((d) => (d.id === draftId ? res.data : d)) : old
      );
      toast.success("AI draft generated");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || "AI generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const selectedJurisdiction = jurisdictions.find((j) => j.code === selectedDraft?.jurisdiction);

  return (
    <div className="flex h-[calc(100vh-120px)] overflow-hidden">
      {/* Sidebar — draft list */}
      <div className="w-72 flex-shrink-0 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm">Crisis Comms</h2>
            <p className="text-xs text-muted-foreground">{drafts.length} draft{drafts.length !== 1 ? "s" : ""}</p>
          </div>
          <button
            onClick={() => setNewDraftModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : drafts.length === 0 ? (
            <div className="p-6 text-center">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No drafts yet</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {drafts.map((draft) => {
                const cfg = STATUS_CONFIG[draft.status];
                return (
                  <button
                    key={draft.id}
                    onClick={() => setSelectedDraftId(draft.id)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${selectedDraftId === draft.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-tight line-clamp-1">{draft.title}</p>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{draft.jurisdiction}</p>
                    <div className="mt-1.5 flex items-center gap-1">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${cfg.color}`}>
                        {cfg.icon}{cfg.label}
                      </span>
                      <span className="text-xs text-muted-foreground">v{draft.version}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      {selectedDraft ? (
        <DraftEditor
          draft={selectedDraft}
          jurisdiction={selectedJurisdiction ?? null}
          generating={generating}
          generatingContext={generatingContext}
          onContextChange={setGeneratingContext}
          onGenerate={() => generateDraft(selectedDraft.id)}
          onSave={(content) => updateMutation.mutate({ draftId: selectedDraft.id, content })}
          onApprove={() => approveMutation.mutate(selectedDraft.id)}
          onDelete={() => deleteMutation.mutate(selectedDraft.id)}
          isSaving={updateMutation.isPending}
          isApproving={approveMutation.isPending}
          isDeleting={deleteMutation.isPending}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-center p-8">
          <div>
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-base font-medium">Select a draft to edit</p>
            <p className="text-sm text-muted-foreground mt-1">Or create a new one to get started</p>
          </div>
        </div>
      )}

      {/* New draft modal */}
      {newDraftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="font-semibold mb-4">New Communication Draft</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Title</label>
                <input
                  value={newDraft.title}
                  onChange={(e) => setNewDraft({ ...newDraft, title: e.target.value })}
                  placeholder="e.g. Customer Breach Notification"
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Jurisdiction / Audience</label>
                <select
                  value={newDraft.jurisdiction}
                  onChange={(e) => setNewDraft({ ...newDraft, jurisdiction: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
                >
                  <option value="">Select jurisdiction...</option>
                  {jurisdictions.map((j) => (
                    <option key={j.code} value={j.code}>{j.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => createMutation.mutate({ ...newDraft, incident_id: id })}
                disabled={!newDraft.title || !newDraft.jurisdiction || createMutation.isPending}
                className="flex-1 py-2 bg-primary text-primary-foreground text-sm rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >
                {createMutation.isPending ? "Creating..." : "Create Draft"}
              </button>
              <button
                onClick={() => { setNewDraftModal(false); setNewDraft({ title: "", jurisdiction: "", content: "" }); }}
                className="px-4 py-2 border border-border text-sm rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DraftEditor({
  draft,
  jurisdiction,
  generating,
  generatingContext,
  onContextChange,
  onGenerate,
  onSave,
  onApprove,
  onDelete,
  isSaving,
  isApproving,
  isDeleting,
}: {
  draft: CommsDraft;
  jurisdiction: Jurisdiction | null;
  generating: boolean;
  generatingContext: string;
  onContextChange: (v: string) => void;
  onGenerate: () => void;
  onSave: (content: string) => void;
  onApprove: () => void;
  onDelete: () => void;
  isSaving: boolean;
  isApproving: boolean;
  isDeleting: boolean;
}) {
  const [content, setContent] = useState(draft.content);
  const cfg = STATUS_CONFIG[draft.status];

  // Sync if draft changes (e.g. after AI generation)
  const prevId = draft.id + draft.version;
  const [lastSyncKey, setLastSyncKey] = useState(prevId);
  if (prevId !== lastSyncKey) {
    setContent(draft.content);
    setLastSyncKey(prevId);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold truncate">{draft.title}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>
              {cfg.icon}{cfg.label}
            </span>
            <span className="text-xs text-muted-foreground">v{draft.version} · updated {formatDate(draft.updated_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onSave(content)}
            disabled={isSaving || content === draft.content}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
          {draft.status !== "APPROVED" && draft.status !== "SENT" && (
            <button
              onClick={onApprove}
              disabled={isApproving}
              className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 transition-colors"
            >
              {isApproving ? "Approving..." : "Approve"}
            </button>
          )}
          <button
            onClick={() => { if (window.confirm("Delete this draft?")) onDelete(); }}
            disabled={isDeleting}
            title="Delete draft"
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg disabled:opacity-50 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* AI toolbar */}
          <div className="px-6 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500 flex-shrink-0" />
            <input
              value={generatingContext}
              onChange={(e) => onContextChange(e.target.value)}
              placeholder="Optional context for AI generation (e.g. 50k customers affected, PII exposed)..."
              className="flex-1 text-xs bg-transparent focus:outline-none placeholder:text-muted-foreground"
            />
            <button
              onClick={onGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 px-3 py-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {generating ? "Generating..." : "AI Draft"}
            </button>
          </div>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 w-full p-6 text-sm font-mono bg-background resize-none focus:outline-none"
            placeholder="Start writing your notification draft..."
          />
        </div>

        {/* Jurisdiction sidebar */}
        {jurisdiction && (
          <div className="w-72 flex-shrink-0 border-l border-border overflow-y-auto p-4 space-y-4">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Jurisdiction</h4>
              <p className="text-sm font-medium">{jurisdiction.name}</p>
              {jurisdiction.threshold && (
                <p className="text-xs text-muted-foreground mt-1">Threshold: {jurisdiction.threshold}</p>
              )}
              {jurisdiction.deadline_hours != null && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400">
                  <Clock className="h-3.5 w-3.5" />
                  Deadline: {jurisdiction.deadline_hours}h from discovery
                </div>
              )}
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Requirements</h4>
              <ul className="space-y-1.5">
                {jurisdiction.requirements.map((req, i) => (
                  <li key={i} className="text-xs text-foreground flex gap-2">
                    <span className="text-primary flex-shrink-0">•</span>
                    {req}
                  </li>
                ))}
              </ul>
            </div>

            {jurisdiction.notes && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Notes</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{jurisdiction.notes}</p>
              </div>
            )}

            {jurisdiction.contact_url && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Contact</h4>
                <a
                  href={jurisdiction.contact_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline break-all"
                >
                  {jurisdiction.contact_url}
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
