"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import api from "@/lib/api";
import type { Incident } from "@/lib/types";
import { SEVERITY_COLORS, STATUS_COLORS, INCIDENT_TYPE_LABELS, formatDate } from "@/lib/utils";
import { useAuth, hasRole } from "@/lib/auth";
import { Plus, Search, AlertTriangle, XCircle, Trash2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

const PHASES = [
  "PREPARATION", "DETECTION", "ANALYSIS", "CONTAINMENT",
  "ERADICATION", "RECOVERY", "POST_INCIDENT",
] as const;

const STATUSES = ["OPEN", "CONTAINED", "ERADICATING", "RECOVERING", "CLOSED"] as const;

export default function IncidentsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showExercises, setShowExercises] = useState(false);
  const [confirmClose, setConfirmClose] = useState<Incident | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Incident | null>(null);
  const [editStatus, setEditStatus] = useState<{ incident: Incident; field: "status" | "phase" } | null>(null);

  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ["incidents", showExercises],
    queryFn: () => {
      const params = showExercises ? "" : "?exercise=false";
      return api.get<Incident[]>(`/incidents${params}`).then((r) => r.data);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, string> }) =>
      api.patch(`/incidents/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      setConfirmClose(null);
      setEditStatus(null);
      toast.success("Incident updated");
    },
    onError: () => toast.error("Failed to update incident"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/incidents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      setConfirmDelete(null);
      toast.success("Incident deleted");
    },
    onError: () => toast.error("Failed to delete incident"),
  });

  const filtered = incidents.filter((i) => {
    const matchSearch = !search || i.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || i.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const canAnalyst = hasRole(user, "ANALYST");
  const canLead = hasRole(user, "IR_LEAD");

  const activeCount = incidents.filter((i) => i.status !== "CLOSED").length;

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Incidents</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            <span className={activeCount > 0 ? "text-red-500 font-medium" : "text-green-600 font-medium"}>
              {activeCount} active
            </span>
            <span className="mx-1.5 text-border">·</span>
            {incidents.length} total
          </p>
        </div>
        {canAnalyst && (
          <Link
            href="/incidents/new"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium text-sm transition-colors shadow-sm shadow-primary/20"
          >
            <Plus className="h-4 w-4" />
            New Incident
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search incidents…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer px-3 py-2 border border-border rounded-lg bg-background hover:bg-muted transition-colors select-none">
          <input
            type="checkbox"
            checked={showExercises}
            onChange={(e) => setShowExercises(e.target.checked)}
            className="rounded"
          />
          🧪 Show exercises
        </label>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Severity", "Title", "Type", "Status", "Phase", "Started"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left"><Skeleton className="h-3 w-14" /></th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {[...Array(5)].map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3.5"><Skeleton className="h-5 w-16 rounded-md" /></td>
                  <td className="px-4 py-3.5"><Skeleton className="h-4 w-48" /></td>
                  <td className="px-4 py-3.5"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-4 py-3.5"><Skeleton className="h-5 w-20 rounded-md" /></td>
                  <td className="px-4 py-3.5"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-4 py-3.5"><Skeleton className="h-4 w-16" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No incidents found"
          description={incidents.length === 0 ? "Declare a new incident to get started." : "Try adjusting your filters."}
          action={incidents.length === 0 && canAnalyst ? (
            <Link
              href="/incidents/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Declare Incident
            </Link>
          ) : undefined}
          className="border border-dashed border-border rounded-xl bg-muted/20 py-20"
        />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Severity</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phase</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Started</th>
                {canLead && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {filtered.map((incident) => (
                <tr key={incident.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold tracking-wide ${SEVERITY_COLORS[incident.severity]}`}>
                      {incident.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 max-w-xs">
                    <div className="flex items-center gap-2">
                      <Link href={`/incidents/${incident.id}`} className="font-medium text-foreground hover:text-primary transition-colors truncate">
                        {incident.title}
                      </Link>
                      {incident.is_exercise && (
                        <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 tracking-wide">
                          Exercise
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground text-sm">{INCIDENT_TYPE_LABELS[incident.incident_type]}</td>
                  <td className="px-4 py-3.5">
                    {canAnalyst && editStatus?.incident.id === incident.id && editStatus.field === "status" ? (
                      <select
                        value={incident.status}
                        autoFocus
                        onChange={(e) => updateMutation.mutate({ id: incident.id, data: { status: e.target.value } })}
                        onBlur={() => setEditStatus(null)}
                        className="px-2 py-0.5 text-xs border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <button
                        onClick={() => canAnalyst && setEditStatus({ incident, field: "status" })}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[incident.status]} ${canAnalyst ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
                      >
                        {incident.status}
                        {canAnalyst && <ChevronDown className="h-2.5 w-2.5 opacity-60" />}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {canAnalyst && editStatus?.incident.id === incident.id && editStatus.field === "phase" ? (
                      <select
                        value={incident.phase}
                        autoFocus
                        onChange={(e) => updateMutation.mutate({ id: incident.id, data: { phase: e.target.value } })}
                        onBlur={() => setEditStatus(null)}
                        className="px-2 py-0.5 text-xs border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        {PHASES.map((p) => <option key={p} value={p}>{p.replace(/_/g, " ")}</option>)}
                      </select>
                    ) : (
                      <button
                        onClick={() => canAnalyst && setEditStatus({ incident, field: "phase" })}
                        className={`text-sm text-muted-foreground flex items-center gap-1 ${canAnalyst ? "cursor-pointer hover:text-foreground transition-colors" : ""}`}
                      >
                        {incident.phase.replace(/_/g, " ")}
                        {canAnalyst && <ChevronDown className="h-2.5 w-2.5 opacity-50" />}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground text-sm tabular-nums">{formatDate(incident.started_at)}</td>
                  {canLead && (
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1 justify-end">
                        {incident.status !== "CLOSED" && (
                          <button
                            onClick={() => setConfirmClose(incident)}
                            title="Close incident"
                            className="p-1.5 text-muted-foreground hover:text-orange-500 hover:bg-orange-50 rounded-md transition-colors"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDelete(incident)}
                          title="Delete incident"
                          className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Close confirm dialog */}
      {confirmClose && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-card rounded-xl border border-border p-6 max-w-md w-full mx-4 shadow-2xl animate-scale-in">
            <h3 className="font-semibold text-lg mb-2">Close Incident</h3>
            <p className="text-sm text-muted-foreground mb-5">
              Close <span className="font-medium text-foreground">{confirmClose.title}</span>? This marks it as resolved and moves it to POST_INCIDENT phase.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmClose(null)} className="px-4 py-2 border border-border text-sm rounded-lg hover:bg-muted transition-colors">
                Cancel
              </button>
              <button
                onClick={() => updateMutation.mutate({ id: confirmClose.id, data: { status: "CLOSED", phase: "POST_INCIDENT" } })}
                disabled={updateMutation.isPending}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm rounded-lg disabled:opacity-50 transition-colors"
              >
                Close Incident
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-card rounded-xl border border-border p-6 max-w-md w-full mx-4 shadow-2xl animate-scale-in">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="font-semibold text-lg text-red-600">Delete Incident</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Permanently delete <span className="font-medium text-foreground">{confirmDelete.title}</span>? This removes all associated IOCs, assets, tasks, evidence, and timeline events. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 border border-border text-sm rounded-lg hover:bg-muted transition-colors">
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg disabled:opacity-50 transition-colors"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
