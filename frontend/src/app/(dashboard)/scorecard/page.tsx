"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Assessment } from "@/lib/types";
import { toast } from "sonner";
import { Pencil, Trash2, Check, X } from "lucide-react";

const MATURITY_LABELS = ["", "Initial", "Developing", "Defined", "Managed", "Optimizing"];
const MATURITY_COLORS = ["", "#ef4444", "#f97316", "#eab308", "#3b82f6", "#22c55e"];
const MATURITY_DESCRIPTIONS = [
  "",
  "Ad hoc and undocumented. Responses are reactive and inconsistent.",
  "Some processes exist but are not consistently applied or documented.",
  "Processes are documented, approved, and consistently applied across the organization.",
  "Processes are measured and monitored. Continuous improvement is in place.",
  "Proactive, industry-leading approach. Processes are continuously optimized.",
];

export default function ScorecardPage() {
  const qc = useQueryClient();
  const [activeAssessment, setActiveAssessment] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [newTitle, setNewTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState<{ id: string; title: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Assessment | null>(null);

  const { data: assessments = [] } = useQuery({
    queryKey: ["assessments"],
    queryFn: () => api.get<Assessment[]>("/scorecard").then((r) => r.data),
  });

  const { data: questions } = useQuery({
    queryKey: ["assessment-questions"],
    queryFn: () => api.get<Record<string, Array<{ id: string; question: string; description: string; weight: number }>>>("/scorecard/questions").then((r) => r.data),
  });

  const { data: savedAnswers } = useQuery({
    queryKey: ["assessment-answers", activeAssessment],
    queryFn: () => api.get<Array<{ question_id: string; score: number }>>(`/scorecard/${activeAssessment}/answers`).then((r) => r.data),
    enabled: !!activeAssessment,
  });

  useEffect(() => {
    if (savedAnswers) {
      const map: Record<string, number> = {};
      for (const a of savedAnswers) {
        map[a.question_id] = a.score;
      }
      setAnswers(map);
    } else if (!activeAssessment) {
      setAnswers({});
    }
  }, [savedAnswers, activeAssessment]);

  const createMutation = useMutation({
    mutationFn: (title: string) => api.post<Assessment>("/scorecard", { title }).then((r) => r.data),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["assessments"] });
      setActiveAssessment(a.id);
      setNewTitle("");
      toast.success("Assessment created");
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => api.patch(`/scorecard/${id}`, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessments"] });
      setEditingTitle(null);
      toast.success("Assessment renamed");
    },
    onError: () => toast.error("Failed to rename assessment"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/scorecard/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assessments"] });
      setConfirmDelete(null);
      toast.success("Assessment deleted");
    },
    onError: () => toast.error("Failed to delete assessment"),
  });

  const saveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/scorecard/${id}/answers`, {
      answers: Object.entries(answers).map(([question_id, score]) => ({ question_id, score })),
    }),
    onSuccess: () => toast.success("Answers saved"),
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/scorecard/${id}/answers`, {
        answers: Object.entries(answers).map(([question_id, score]) => ({ question_id, score })),
      });
      return api.post(`/scorecard/${id}/submit`).then((r) => r.data);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["assessments"] });
      toast.success(`Assessment complete! Maturity Level ${data.maturity_level} — ${data.overall_score.toFixed(0)}%`);
      setActiveAssessment(null);
    },
  });

  const latest = assessments[0];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">IR Readiness Scorecard</h1>
          <p className="text-muted-foreground mt-1">Assess your incident response maturity across 6 domains</p>
        </div>
        {!activeAssessment && (
          <div className="flex gap-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Assessment name..."
              className="px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={() => newTitle && createMutation.mutate(newTitle)}
              disabled={!newTitle || createMutation.isPending}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              New Assessment
            </button>
          </div>
        )}
      </div>

      {/* Latest maturity card */}
      {latest && !activeAssessment && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center justify-center">
            <div className="text-6xl font-black mb-2" style={{ color: MATURITY_COLORS[latest.maturity_level ?? 0] }}>
              {latest.maturity_level ?? "?"}
            </div>
            <p className="text-lg font-semibold">{MATURITY_LABELS[latest.maturity_level ?? 0]}</p>
            <p className="text-3xl font-bold text-primary mt-3">{latest.overall_score?.toFixed(0)}%</p>
            <div className="w-full bg-muted rounded-full h-2 mt-3">
              <div className="h-2 rounded-full transition-all" style={{ width: `${latest.overall_score ?? 0}%`, backgroundColor: MATURITY_COLORS[latest.maturity_level ?? 0] }} />
            </div>
            <p className="text-xs text-muted-foreground mt-3 text-center">{MATURITY_DESCRIPTIONS[latest.maturity_level ?? 0]}</p>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
            <h3 className="font-semibold mb-4">Assessments</h3>
            <div className="space-y-2">
              {assessments.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    {editingTitle?.id === a.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editingTitle.title}
                          onChange={(e) => setEditingTitle({ ...editingTitle, title: e.target.value })}
                          className="flex-1 px-2 py-1 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") renameMutation.mutate({ id: a.id, title: editingTitle.title });
                            if (e.key === "Escape") setEditingTitle(null);
                          }}
                        />
                        <button onClick={() => renameMutation.mutate({ id: a.id, title: editingTitle.title })} className="p-1 text-green-600 hover:text-green-700">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setEditingTitle(null)} className="p-1 text-muted-foreground hover:text-foreground">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium truncate">{a.title}</p>
                        <p className="text-xs text-muted-foreground">{a.status === "completed" ? `Score: ${a.overall_score?.toFixed(0)}% · Level ${a.maturity_level}` : "In progress"}</p>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!editingTitle && (
                      <button
                        onClick={() => { setAnswers({}); setActiveAssessment(a.id); }}
                        className="text-xs text-primary hover:underline px-2 py-1"
                      >
                        {a.status === "completed" ? "Edit" : "Continue"}
                      </button>
                    )}
                    {!editingTitle && (
                      <button onClick={() => setEditingTitle({ id: a.id, title: a.title })} className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors" title="Rename">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => setConfirmDelete(a)} className="p-1.5 text-muted-foreground hover:text-red-500 rounded transition-colors" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Assessment form */}
      {activeAssessment && questions && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <button onClick={() => { setActiveAssessment(null); setAnswers({}); }} className="text-sm text-primary hover:underline">← Back</button>
            <div className="flex gap-2 ml-auto">
              <button
                onClick={() => saveMutation.mutate(activeAssessment)}
                disabled={saveMutation.isPending}
                className="px-4 py-2 border border-border text-sm rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
              >
                Save Progress
              </button>
              <button
                onClick={() => submitMutation.mutate(activeAssessment)}
                disabled={submitMutation.isPending || Object.keys(answers).length === 0}
                className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                Submit & Score
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <strong>Scoring guide:</strong> 0 = Not in place, 1 = Initial/ad hoc, 2 = Developing, 3 = Defined and consistent, 4 = Optimized/measured
          </div>

          {Object.entries(questions).map(([category, qs]) => (
            <div key={category} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-4 bg-muted/30 border-b border-border">
                <h3 className="font-semibold">{category}</h3>
              </div>
              <div className="divide-y divide-border">
                {qs.map((q) => (
                  <div key={q.id} className="px-5 py-4">
                    <p className="text-sm font-medium text-foreground">{q.question}</p>
                    {q.description && <p className="text-xs text-muted-foreground mt-1">{q.description}</p>}
                    <div className="flex gap-2 mt-3">
                      {[0, 1, 2, 3, 4].map((score) => (
                        <button
                          key={score}
                          onClick={() => setAnswers({ ...answers, [q.id]: score })}
                          className={`flex-1 py-1.5 rounded-md text-sm font-semibold transition-colors border ${
                            answers[q.id] === score
                              ? score === 0 ? "bg-red-500 text-white border-red-500"
                              : score === 1 ? "bg-orange-500 text-white border-orange-500"
                              : score === 2 ? "bg-yellow-500 text-white border-yellow-500"
                              : score === 3 ? "bg-blue-500 text-white border-blue-500"
                              : "bg-green-500 text-white border-green-500"
                              : "border-border hover:bg-muted"
                          }`}
                        >
                          {score}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!activeAssessment && assessments.length === 0 && (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <p className="font-medium text-foreground">No assessments yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create your first IR readiness assessment to get a maturity score.</p>
        </div>
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-xl border border-border p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="font-semibold text-lg mb-2 text-red-600">Delete Assessment</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Delete <span className="font-medium text-foreground">{confirmDelete.title}</span>? All answers and scores will be permanently removed.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 border border-border text-sm rounded-lg">Cancel</button>
              <button
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
                disabled={deleteMutation.isPending}
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
