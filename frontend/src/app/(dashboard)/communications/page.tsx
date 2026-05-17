"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { CommsDraft } from "@/lib/types";
import { toast } from "sonner";
import { useAuth, hasRole } from "@/lib/auth";
import { Plus, Sparkles, Clock, ChevronRight, Info, Trash2, Eye, Code, Settings } from "lucide-react";
import { MarkdownViewer } from "@/components/MarkdownViewer";

interface JurisdictionInfo {
  code: string;
  name: string;
  deadline_hours: number | null;
  threshold: string | null;
  requirements: string[];
  notes: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  UNDER_REVIEW: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  APPROVED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  SENT: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  ARCHIVED: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

export default function CommunicationsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = hasRole(user, "ADMIN");
  const isAnalyst = hasRole(user, "ANALYST");
  const isLead = hasRole(user, "IR_LEAD");

  const [selectedDraft, setSelectedDraft] = useState<CommsDraft | null>(null);
  const [newDraft, setNewDraft] = useState({ show: false, title: "", jurisdiction: "CUSTOMER" });
  const [generating, setGenerating] = useState(false);
  const [showJurisdictions, setShowJurisdictions] = useState(false);
  const [showCustomJurForm, setShowCustomJurForm] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState<CommsDraft | null>(null);
  const [newJur, setNewJur] = useState({ code: "", name: "", deadline_hours: "", threshold: "", requirements: "", contact_url: "", notes: "" });

  const { data: drafts = [] } = useQuery({
    queryKey: ["comms-drafts"],
    queryFn: () => api.get<CommsDraft[]>("/comms/drafts").then((r) => r.data),
  });

  const { data: jurisdictions = [] } = useQuery({
    queryKey: ["jurisdictions"],
    queryFn: () => api.get<JurisdictionInfo[]>("/comms/jurisdictions").then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: { title: string; jurisdiction: string }) => api.post<CommsDraft>("/comms/drafts", data).then((r) => r.data),
    onSuccess: (draft) => {
      qc.invalidateQueries({ queryKey: ["comms-drafts"] });
      setSelectedDraft(draft);
      setNewDraft({ show: false, title: "", jurisdiction: "CUSTOMER" });
      setPreviewMode(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => api.patch<CommsDraft>(`/comms/drafts/${id}`, { content }).then((r) => r.data),
    onSuccess: (draft) => {
      qc.invalidateQueries({ queryKey: ["comms-drafts"] });
      setSelectedDraft(draft);
      toast.success("Draft saved");
    },
  });

  const deleteDraftMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/comms/drafts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comms-drafts"] });
      setSelectedDraft(null);
      setConfirmDeleteDraft(null);
      toast.success("Draft deleted");
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post<CommsDraft>(`/comms/drafts/${id}/approve`).then((r) => r.data),
    onSuccess: (draft) => {
      qc.invalidateQueries({ queryKey: ["comms-drafts"] });
      setSelectedDraft(draft);
      toast.success("Draft approved");
    },
  });

  const createJurMutation = useMutation({
    mutationFn: (data: typeof newJur) => api.post("/comms/jurisdictions", {
      ...data,
      deadline_hours: data.deadline_hours ? parseInt(data.deadline_hours) : null,
      requirements: data.requirements.split("\n").map((r) => r.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jurisdictions"] });
      setShowCustomJurForm(false);
      setNewJur({ code: "", name: "", deadline_hours: "", threshold: "", requirements: "", contact_url: "", notes: "" });
      toast.success("Jurisdiction added");
    },
    onError: (err: { response?: { data?: { detail?: string } } }) =>
      toast.error(err.response?.data?.detail ?? "Failed to add jurisdiction"),
  });

  const deleteJurMutation = useMutation({
    mutationFn: (code: string) => api.delete(`/comms/jurisdictions/${code}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jurisdictions"] });
      toast.success("Jurisdiction removed");
    },
    onError: () => toast.error("Cannot delete built-in jurisdiction"),
  });

  async function generateDraft() {
    if (!selectedDraft) return;
    setGenerating(true);
    try {
      const { data } = await api.post<CommsDraft>(`/comms/drafts/${selectedDraft.id}/generate`, {});
      qc.invalidateQueries({ queryKey: ["comms-drafts"] });
      setSelectedDraft(data);
      toast.success("Draft generated by AI");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  // Identify which jurisdictions are custom (not in a fixed set)
  const BUILTIN_CODES = new Set(["SEC_8K","GDPR_ART33","GDPR_ART34","HIPAA","CCPA","CUSTOMER","EMPLOYEE","BOARD","LAW_ENFORCEMENT","STATE_CA","STATE_NY","STATE_TX","STATE_FL","STATE_IL"]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Crisis Communications</h1>
          <p className="text-muted-foreground mt-1">AI-powered breach notification drafts across all jurisdictions</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowJurisdictions(!showJurisdictions)}
            className="flex items-center gap-1.5 px-3 py-2 border border-border text-sm rounded-lg hover:bg-muted transition-colors"
          >
            <Info className="h-4 w-4" />
            Requirements
          </button>
          {isAdmin && (
            <button
              onClick={() => { setShowJurisdictions(true); setShowCustomJurForm(true); }}
              className="flex items-center gap-1.5 px-3 py-2 border border-border text-sm rounded-lg hover:bg-muted transition-colors"
            >
              <Settings className="h-4 w-4" />
              Add Jurisdiction
            </button>
          )}
          {isAnalyst && (
            <button
              onClick={() => setNewDraft({ show: true, title: "", jurisdiction: "CUSTOMER" })}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Draft
            </button>
          )}
        </div>
      </div>

      {/* Jurisdiction reference panel */}
      {showJurisdictions && (
        <div className="rounded-xl border border-border bg-card mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
            <h3 className="font-semibold">Jurisdiction Requirements Database</h3>
            <button onClick={() => { setShowJurisdictions(false); setShowCustomJurForm(false); }} className="text-sm text-muted-foreground hover:text-foreground">Close</button>
          </div>

          {/* Add custom jurisdiction form */}
          {isAdmin && showCustomJurForm && (
            <div className="p-5 border-b border-border bg-muted/10 space-y-3">
              <h4 className="font-medium text-sm">Add Custom Jurisdiction</h4>
              <div className="grid grid-cols-2 gap-3">
                <input value={newJur.code} onChange={(e) => setNewJur({ ...newJur, code: e.target.value.toUpperCase() })} placeholder="Code (e.g. CUSTOM_AUS)" className="px-3 py-2 text-sm border border-border rounded-lg bg-background" />
                <input value={newJur.name} onChange={(e) => setNewJur({ ...newJur, name: e.target.value })} placeholder="Jurisdiction name" className="px-3 py-2 text-sm border border-border rounded-lg bg-background" />
                <input value={newJur.deadline_hours} onChange={(e) => setNewJur({ ...newJur, deadline_hours: e.target.value })} placeholder="Deadline (hours, optional)" type="number" className="px-3 py-2 text-sm border border-border rounded-lg bg-background" />
                <input value={newJur.threshold} onChange={(e) => setNewJur({ ...newJur, threshold: e.target.value })} placeholder="Trigger threshold" className="px-3 py-2 text-sm border border-border rounded-lg bg-background" />
                <textarea value={newJur.requirements} onChange={(e) => setNewJur({ ...newJur, requirements: e.target.value })} placeholder="Requirements (one per line)" rows={3} className="col-span-2 px-3 py-2 text-sm border border-border rounded-lg bg-background resize-none" />
                <input value={newJur.contact_url} onChange={(e) => setNewJur({ ...newJur, contact_url: e.target.value })} placeholder="Contact URL (optional)" className="px-3 py-2 text-sm border border-border rounded-lg bg-background" />
                <input value={newJur.notes} onChange={(e) => setNewJur({ ...newJur, notes: e.target.value })} placeholder="Notes (optional)" className="px-3 py-2 text-sm border border-border rounded-lg bg-background" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => createJurMutation.mutate(newJur)} disabled={!newJur.code || !newJur.name || createJurMutation.isPending} className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg disabled:opacity-50">Add Jurisdiction</button>
                <button onClick={() => setShowCustomJurForm(false)} className="px-4 py-2 border border-border text-sm rounded-lg">Cancel</button>
              </div>
            </div>
          )}

          <div className="divide-y divide-border max-h-96 overflow-y-auto">
            {jurisdictions.map((j) => (
              <div key={j.code} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{j.name}</p>
                      {!BUILTIN_CODES.has(j.code) && (
                        <span className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 px-1.5 py-0.5 rounded">Custom</span>
                      )}
                    </div>
                    {j.deadline_hours && (
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3 text-red-500" />
                        <span className="text-xs text-red-500 font-semibold">{j.deadline_hours}h deadline</span>
                      </div>
                    )}
                    {j.threshold && <p className="text-xs text-muted-foreground mt-1">Trigger: {j.threshold}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isAnalyst && (
                      <button
                        onClick={() => setNewDraft({ show: true, title: `${j.name} Notification`, jurisdiction: j.code })}
                        className="text-xs text-primary hover:underline"
                      >
                        + Draft
                      </button>
                    )}
                    {isAdmin && !BUILTIN_CODES.has(j.code) && (
                      <button
                        onClick={() => deleteJurMutation.mutate(j.code)}
                        className="p-1 text-muted-foreground hover:text-red-500 rounded transition-colors"
                        title="Remove custom jurisdiction"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <ul className="mt-2 space-y-0.5">
                  {j.requirements.slice(0, 3).map((req, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                      <span className="text-primary shrink-0">•</span>
                      {req}
                    </li>
                  ))}
                </ul>
                {j.notes && <p className="text-xs text-muted-foreground italic mt-2">{j.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Draft list */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-border bg-card">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-sm">Drafts ({drafts.length})</h3>
            </div>

            {newDraft.show && (
              <div className="p-3 border-b border-border bg-muted/30 space-y-2">
                <input
                  value={newDraft.title}
                  onChange={(e) => setNewDraft({ ...newDraft, title: e.target.value })}
                  placeholder="Draft title..."
                  className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background"
                />
                <select
                  value={newDraft.jurisdiction}
                  onChange={(e) => setNewDraft({ ...newDraft, jurisdiction: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background"
                >
                  {jurisdictions.map((j) => (
                    <option key={j.code} value={j.code}>{j.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Draft will be pre-filled with jurisdiction template if available.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => createMutation.mutate({ title: newDraft.title, jurisdiction: newDraft.jurisdiction })}
                    disabled={!newDraft.title || createMutation.isPending}
                    className="flex-1 py-1.5 bg-primary text-primary-foreground text-xs rounded-md disabled:opacity-50"
                  >
                    Create
                  </button>
                  <button onClick={() => setNewDraft({ show: false, title: "", jurisdiction: "CUSTOMER" })} className="px-3 py-1.5 border border-border text-xs rounded-md">Cancel</button>
                </div>
              </div>
            )}

            <div className="divide-y divide-border">
              {drafts.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No drafts yet</p>
              ) : drafts.map((draft) => (
                <button
                  key={draft.id}
                  onClick={() => { setSelectedDraft(draft); setPreviewMode(false); }}
                  className={`w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors ${selectedDraft?.id === draft.id ? "bg-primary/10" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-foreground line-clamp-1">{draft.title}</p>
                    <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{draft.jurisdiction.replace(/_/g, " ")}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[draft.status]}`}>{draft.status.replace("_", " ")}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Draft editor */}
        <div className="lg:col-span-2">
          {selectedDraft ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{selectedDraft.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{selectedDraft.jurisdiction.replace(/_/g, " ")} · v{selectedDraft.version}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {isAnalyst && (
                    <button
                      onClick={generateDraft}
                      disabled={generating}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {generating ? "Generating..." : "AI Generate"}
                    </button>
                  )}
                  {isAnalyst && (
                    <button
                      onClick={() => setPreviewMode(!previewMode)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-xs rounded-lg hover:bg-muted transition-colors"
                    >
                      {previewMode ? <Code className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {previewMode ? "Edit" : "Preview"}
                    </button>
                  )}
                  {isAnalyst && !previewMode && (
                    <button
                      onClick={() => updateMutation.mutate({ id: selectedDraft.id, content: selectedDraft.content })}
                      disabled={updateMutation.isPending}
                      className="px-3 py-1.5 border border-border text-xs rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
                    >
                      Save
                    </button>
                  )}
                  {isLead && selectedDraft.status === "DRAFT" && (
                    <button
                      onClick={() => approveMutation.mutate(selectedDraft.id)}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg transition-colors"
                    >
                      Approve
                    </button>
                  )}
                  {isAnalyst && (
                    <button
                      onClick={() => setConfirmDeleteDraft(selectedDraft)}
                      className="p-1.5 text-muted-foreground hover:text-red-500 rounded transition-colors"
                      title="Delete draft"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="p-5">
                {previewMode ? (
                  <MarkdownViewer content={selectedDraft.content} defaultRaw={false} />
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground mb-2">Use [PLACEHOLDER] for details that need to be filled in. Markdown supported.</p>
                    <textarea
                      value={selectedDraft.content}
                      onChange={(e) => setSelectedDraft({ ...selectedDraft, content: e.target.value })}
                      rows={25}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                      placeholder="Draft content will appear here. Click 'AI Generate' to create a draft based on jurisdiction requirements."
                    />
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-80 rounded-xl border border-dashed border-border">
              <p className="font-medium text-foreground">Select a draft to edit</p>
              <p className="text-sm text-muted-foreground mt-1">Or create a new draft from the list on the left</p>
            </div>
          )}
        </div>
      </div>

      {/* Delete draft confirm */}
      {confirmDeleteDraft && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-xl border border-border p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="font-semibold text-lg mb-2 text-red-600">Delete Draft</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Delete <span className="font-medium text-foreground">{confirmDeleteDraft.title}</span>? This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDeleteDraft(null)} className="px-4 py-2 border border-border text-sm rounded-lg">Cancel</button>
              <button
                onClick={() => deleteDraftMutation.mutate(confirmDeleteDraft.id)}
                disabled={deleteDraftMutation.isPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg disabled:opacity-50"
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
