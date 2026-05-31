"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import api from "@/lib/api";
import type { ExerciseInject, ExerciseObservation, ExercisePrompts, Incident } from "@/lib/types";
import { useAuth, hasRole } from "@/lib/auth";
import { toast } from "sonner";
import {
  Lightbulb, Plus, Zap, MessageSquare, Eye, Sparkles, CheckCircle2, Clock,
  Trash2, ChevronDown, ChevronRight, Send,
} from "lucide-react";

const INJECT_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  TECHNICAL:     { bg: "bg-blue-100 dark:bg-blue-900/30",   text: "text-blue-700 dark:text-blue-400",   label: "Technical" },
  COMMUNICATION: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400", label: "Communication" },
  ESCALATION:    { bg: "bg-red-100 dark:bg-red-900/30",     text: "text-red-700 dark:text-red-400",     label: "Escalation" },
  DECISION:      { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400", label: "Decision Point" },
  COMPLICATION:  { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-400", label: "Complication" },
};

const OBS_CATEGORY_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  STRENGTH:    { bg: "bg-emerald-50 dark:bg-emerald-900/20",  text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500", label: "Strength" },
  IMPROVEMENT: { bg: "bg-yellow-50 dark:bg-yellow-900/20",   text: "text-yellow-700 dark:text-yellow-400",  dot: "bg-yellow-500", label: "Needs Work" },
  CRITICAL:    { bg: "bg-red-50 dark:bg-red-900/20",         text: "text-red-700 dark:text-red-400",        dot: "bg-red-500",     label: "Critical Gap" },
  GENERAL:     { bg: "bg-muted/50",                          text: "text-muted-foreground",                 dot: "bg-gray-400",    label: "Note" },
};

function timeAgo(iso: string) {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  return `${Math.round(diff / 60)}h ago`;
}

export default function ExercisePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canWrite = hasRole(user, "ANALYST");

  const { data: incident } = useQuery({
    queryKey: ["incident", id],
    queryFn: () => api.get<Incident>(`/incidents/${id}`).then((r) => r.data),
  });

  const { data: prompts } = useQuery({
    queryKey: ["exercise-prompts", id],
    queryFn: () => api.get<ExercisePrompts>(`/incidents/${id}/exercise/prompts`).then((r) => r.data),
    enabled: !!incident?.is_exercise,
  });

  const { data: injects = [] } = useQuery({
    queryKey: ["exercise-injects", id],
    queryFn: () => api.get<ExerciseInject[]>(`/incidents/${id}/exercise/injects`).then((r) => r.data),
    enabled: !!incident?.is_exercise,
  });

  const { data: observations = [] } = useQuery({
    queryKey: ["exercise-observations", id],
    queryFn: () => api.get<ExerciseObservation[]>(`/incidents/${id}/exercise/observations`).then((r) => r.data),
    enabled: !!incident?.is_exercise,
  });

  const [addInject, setAddInject] = useState({
    show: false, title: "", description: "", inject_type: "COMPLICATION", facilitator_notes: "",
  });
  const [addObs, setAddObs] = useState({ show: false, category: "GENERAL", content: "" });
  const [generatingInjects, setGeneratingInjects] = useState(false);
  const [expandedInject, setExpandedInject] = useState<string | null>(null);
  const [expandedPrompts, setExpandedPrompts] = useState(true);

  const injectMutation = useMutation({
    mutationFn: (data: { title: string; description: string; inject_type: string; facilitator_notes?: string }) =>
      api.post(`/incidents/${id}/exercise/injects`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exercise-injects", id] });
      setAddInject({ show: false, title: "", description: "", inject_type: "COMPLICATION", facilitator_notes: "" });
      toast.success("Inject added");
    },
  });

  const deliverMutation = useMutation({
    mutationFn: (injectId: string) =>
      api.post(`/incidents/${id}/exercise/injects/${injectId}/deliver`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exercise-injects", id] });
      toast.success("Inject delivered to team");
    },
  });

  const deleteInjectMutation = useMutation({
    mutationFn: (injectId: string) =>
      api.delete(`/incidents/${id}/exercise/injects/${injectId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exercise-injects", id] });
      toast.success("Inject removed");
    },
  });

  const obsMutation = useMutation({
    mutationFn: (data: { category: string; content: string }) =>
      api.post(`/incidents/${id}/exercise/observations`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exercise-observations", id] });
      setAddObs({ show: false, category: "GENERAL", content: "" });
      toast.success("Observation saved");
    },
  });

  const deleteObsMutation = useMutation({
    mutationFn: (obsId: string) =>
      api.delete(`/incidents/${id}/exercise/observations/${obsId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exercise-observations", id] });
    },
  });

  const generateInjects = async () => {
    if (!incident) return;
    setGeneratingInjects(true);
    try {
      const res = await api.post<{ injects: Array<{ title: string; description: string; inject_type: string; facilitator_notes: string }> }>(
        "/ai/generate-exercise-injects",
        {
          incident_id: id,
          incident_type: incident.incident_type,
          current_phase: incident.phase,
          count: 5,
        }
      );
      for (const inj of res.data.injects) {
        await api.post(`/incidents/${id}/exercise/injects`, {
          title: inj.title,
          description: inj.description,
          inject_type: inj.inject_type,
          facilitator_notes: inj.facilitator_notes,
        });
      }
      qc.invalidateQueries({ queryKey: ["exercise-injects", id] });
      toast.success(`Generated ${res.data.injects.length} scenario injects`);
    } catch {
      toast.error("Failed to generate injects — check AI configuration");
    } finally {
      setGeneratingInjects(false);
    }
  };

  if (!incident?.is_exercise) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p className="text-sm">This incident is not marked as an exercise.</p>
      </div>
    );
  }

  const pendingInjects = injects.filter((i) => !i.delivered_at);
  const deliveredInjects = injects.filter((i) => i.delivered_at);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Exercise banner */}
      <div className="rounded-xl border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20 px-5 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-bold text-orange-800 dark:text-orange-300 flex items-center gap-2">
              🧪 Facilitator Control Panel
            </h2>
            <p className="text-sm text-orange-700 dark:text-orange-400 mt-1">
              Use this panel to manage scenario injects, capture observations, and surface discussion prompts during the exercise.
              Changes here are visible only to facilitators.
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-orange-600 dark:text-orange-400">Current phase</div>
            <div className="font-bold text-orange-800 dark:text-orange-300 text-sm">
              {incident.phase.replace(/_/g, " ")}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Left: Discussion prompts */}
        <div className="xl:col-span-2 space-y-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              onClick={() => setExpandedPrompts(!expandedPrompts)}
              className="w-full flex items-center justify-between px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-yellow-500" />
                <h3 className="font-semibold text-sm">Discussion Prompts</h3>
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {(prompts?.phase_prompts?.length ?? 0) + (prompts?.always_prompts?.length ?? 0)} prompts
                </span>
              </div>
              {expandedPrompts ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>

            {expandedPrompts && (
              <div className="p-4 space-y-4">
                {prompts?.phase_prompts && prompts.phase_prompts.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      {incident.phase.replace(/_/g, " ")} Phase
                    </p>
                    <div className="space-y-2">
                      {prompts.phase_prompts.map((p) => (
                        <div key={p.id} className="flex gap-2 p-3 rounded-lg bg-yellow-50/60 dark:bg-yellow-900/10 border border-yellow-200/60 dark:border-yellow-900/30">
                          <Lightbulb className="h-3.5 w-3.5 text-yellow-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-foreground leading-relaxed">{p.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {prompts?.always_prompts && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Always Relevant
                    </p>
                    <div className="space-y-2">
                      {prompts.always_prompts.map((p) => (
                        <div key={p.id} className="flex gap-2 p-3 rounded-lg bg-muted/40 border border-border">
                          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <p className="text-xs text-muted-foreground leading-relaxed">{p.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Observations */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-blue-500" />
                <h3 className="font-semibold text-sm">Facilitator Observations ({observations.length})</h3>
              </div>
              {canWrite && (
                <button onClick={() => setAddObs({ ...addObs, show: true })} className="text-xs text-primary hover:underline">
                  + Record
                </button>
              )}
            </div>

            {addObs.show && (
              <div className="p-3 border-b border-border bg-muted/30 space-y-2">
                <select
                  value={addObs.category}
                  onChange={(e) => setAddObs({ ...addObs, category: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background"
                >
                  <option value="STRENGTH">Strength — what the team did well</option>
                  <option value="IMPROVEMENT">Needs Work — gap or slow response</option>
                  <option value="CRITICAL">Critical Gap — serious process failure</option>
                  <option value="GENERAL">General Note</option>
                </select>
                <textarea
                  value={addObs.content}
                  onChange={(e) => setAddObs({ ...addObs, content: e.target.value })}
                  placeholder="What did you observe?"
                  rows={3}
                  className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => obsMutation.mutate({ category: addObs.category, content: addObs.content })}
                    disabled={!addObs.content || obsMutation.isPending}
                    className="flex-1 py-1.5 bg-primary text-primary-foreground text-xs rounded-md disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button onClick={() => setAddObs({ show: false, category: "GENERAL", content: "" })} className="px-3 py-1.5 border border-border text-xs rounded-md">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="divide-y divide-border max-h-80 overflow-y-auto">
              {observations.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No observations yet</p>
              ) : observations.map((obs) => {
                const style = OBS_CATEGORY_STYLES[obs.category];
                return (
                  <div key={obs.id} className={`px-4 py-3 ${style.bg}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${style.dot}`} />
                        <span className={`text-xs font-semibold ${style.text}`}>{style.label}</span>
                        {obs.phase && <span className="text-xs text-muted-foreground">· {obs.phase.replace(/_/g, " ")}</span>}
                      </div>
                      {canWrite && (
                        <button onClick={() => deleteObsMutation.mutate(obs.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-foreground leading-relaxed">{obs.content}</p>
                    <p className="text-xs text-muted-foreground mt-1">{timeAgo(obs.created_at)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Scenario Injects */}
        <div className="xl:col-span-3 space-y-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-red-500" />
                <h3 className="font-semibold text-sm">Scenario Injects</h3>
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {pendingInjects.length} pending · {deliveredInjects.length} delivered
                </span>
              </div>
              {canWrite && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={generateInjects}
                    disabled={generatingInjects}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {generatingInjects ? "Generating..." : "AI Generate"}
                  </button>
                  <button
                    onClick={() => setAddInject({ ...addInject, show: true })}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                </div>
              )}
            </div>

            {addInject.show && (
              <div className="p-4 border-b border-border bg-muted/30 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Title</label>
                    <input
                      value={addInject.title}
                      onChange={(e) => setAddInject({ ...addInject, title: e.target.value })}
                      placeholder="Brief title..."
                      className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Type</label>
                    <select
                      value={addInject.inject_type}
                      onChange={(e) => setAddInject({ ...addInject, inject_type: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background"
                    >
                      {Object.entries(INJECT_TYPE_STYLES).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Inject text (read aloud to the team)
                  </label>
                  <textarea
                    value={addInject.description}
                    onChange={(e) => setAddInject({ ...addInject, description: e.target.value })}
                    placeholder="New development to present to the team..."
                    rows={3}
                    className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Facilitator notes (private)
                  </label>
                  <textarea
                    value={addInject.facilitator_notes}
                    onChange={(e) => setAddInject({ ...addInject, facilitator_notes: e.target.value })}
                    placeholder="What to watch for, expected responses, follow-up questions..."
                    rows={2}
                    className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => injectMutation.mutate({
                      title: addInject.title,
                      description: addInject.description,
                      inject_type: addInject.inject_type,
                      facilitator_notes: addInject.facilitator_notes || undefined,
                    })}
                    disabled={!addInject.title || !addInject.description || injectMutation.isPending}
                    className="flex-1 py-1.5 bg-primary text-primary-foreground text-xs rounded-md disabled:opacity-50"
                  >
                    Add Inject
                  </button>
                  <button
                    onClick={() => setAddInject({ show: false, title: "", description: "", inject_type: "COMPLICATION", facilitator_notes: "" })}
                    className="px-3 py-1.5 border border-border text-xs rounded-md"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {injects.length === 0 ? (
              <div className="py-12 text-center">
                <Zap className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No injects yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use AI Generate to create phase-appropriate scenario injects, or add them manually.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {/* Pending injects */}
                {pendingInjects.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-muted/30">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Ready to Deliver ({pendingInjects.length})
                      </p>
                    </div>
                    {pendingInjects.map((inj) => {
                      const style = INJECT_TYPE_STYLES[inj.inject_type] ?? INJECT_TYPE_STYLES.COMPLICATION;
                      const isExpanded = expandedInject === inj.id;
                      return (
                        <div key={inj.id} className="border-b border-border last:border-b-0">
                          <div className="px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
                                    {style.label}
                                  </span>
                                  <h4 className="text-sm font-medium text-foreground">{inj.title}</h4>
                                </div>
                                <p className="text-xs text-foreground leading-relaxed">{inj.description}</p>

                                {inj.facilitator_notes && (
                                  <button
                                    onClick={() => setExpandedInject(isExpanded ? null : inj.id)}
                                    className="mt-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                  >
                                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    Facilitator notes
                                  </button>
                                )}
                                {isExpanded && inj.facilitator_notes && (
                                  <div className="mt-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/40">
                                    <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">{inj.facilitator_notes}</p>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {canWrite && (
                                  <>
                                    <button
                                      onClick={() => deliverMutation.mutate(inj.id)}
                                      disabled={deliverMutation.isPending}
                                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                                      title="Mark as delivered to team"
                                    >
                                      <Send className="h-3 w-3" />
                                      Deliver
                                    </button>
                                    <button
                                      onClick={() => deleteInjectMutation.mutate(inj.id)}
                                      className="p-1.5 text-muted-foreground hover:text-red-500 rounded transition-colors"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Delivered injects */}
                {deliveredInjects.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-muted/10">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Delivered ({deliveredInjects.length})
                      </p>
                    </div>
                    {deliveredInjects.map((inj) => {
                      const style = INJECT_TYPE_STYLES[inj.inject_type] ?? INJECT_TYPE_STYLES.COMPLICATION;
                      return (
                        <div key={inj.id} className="px-4 py-3 opacity-60">
                          <div className="flex items-start gap-3">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
                                  {style.label}
                                </span>
                                <span className="text-xs font-medium text-foreground">{inj.title}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Delivered {inj.delivered_at ? new Date(inj.delivered_at).toLocaleTimeString() : ""}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Observations summary */}
          {observations.length > 0 && (
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Observation Summary
              </h4>
              <div className="grid grid-cols-4 gap-3">
                {(["STRENGTH", "IMPROVEMENT", "CRITICAL", "GENERAL"] as const).map((cat) => {
                  const count = observations.filter((o) => o.category === cat).length;
                  const style = OBS_CATEGORY_STYLES[cat];
                  return (
                    <div key={cat} className={`rounded-lg p-3 ${style.bg} text-center`}>
                      <div className={`text-xl font-bold ${style.text}`}>{count}</div>
                      <div className={`text-xs ${style.text}`}>{style.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
