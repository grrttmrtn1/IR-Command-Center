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

const PHASES = [
  "PREPARATION", "DETECTION", "ANALYSIS", "CONTAINMENT",
  "ERADICATION", "RECOVERY", "POST_INCIDENT",
] as const;

const STATUSES = ["OPEN", "CONTAINED", "ERADICATING", "RECOVERING", "CLOSED"] as const;

export default function IncidentsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [confirmClose, setConfirmClose] = useState<Incident | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Incident | null>(null);
  const [editStatus, setEditStatus] = useState<{ incident: Incident; field: "status" | "phase" } | null>(null);

  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ["incidents"],
    queryFn: () => api.get<Incident[]>("/incidents").then((r) => r.data),
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Incidents</h1>
          <p className="text-muted-foreground mt-1">{incidents.filter((i) => i.status !== "CLOSED").length} active · {incidents.length} total</p>
        </div>
        {canAnalyst && (
          <Link
            href="/incidents/new"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium text-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Incident
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search incidents..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl">
          <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">No incidents found</p>
          <p className="text-sm text-muted-foreground mt-1">
            {incidents.length === 0 ? "Declare a new incident to get started." : "Try adjusting your filters."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Severity</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Phase</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Started</th>
                {canLead && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((incident, idx) => (
                <tr key={incident.id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold ${SEVERITY_COLORS[incident.severity]}`}>
                      {incident.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/incidents/${incident.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                      {incident.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{INCIDENT_TYPE_LABELS[incident.incident_type]}</td>
                  <td className="px-4 py-3">
                    {canAnalyst && editStatus?.incident.id === incident.id && editStatus.field === "status" ? (
                      <select
                        value={incident.status}
                        autoFocus
                        onChange={(e) => {
                          updateMutation.mutate({ id: incident.id, data: { status: e.target.value } });
                        }}
                        onBlur={() => setEditStatus(null)}
                        className="px-2 py-0.5 text-xs border border-border rounded bg-background"
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <button
                        onClick={() => canAnalyst && setEditStatus({ incident, field: "status" })}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[incident.status]} ${canAnalyst ? "cursor-pointer hover:opacity-80" : ""}`}
                      >
                        {incident.status}
                        {canAnalyst && <ChevronDown className="h-2.5 w-2.5" />}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {canAnalyst && editStatus?.incident.id === incident.id && editStatus.field === "phase" ? (
                      <select
                        value={incident.phase}
                        autoFocus
                        onChange={(e) => {
                          updateMutation.mutate({ id: incident.id, data: { phase: e.target.value } });
                        }}
                        onBlur={() => setEditStatus(null)}
                        className="px-2 py-0.5 text-xs border border-border rounded bg-background"
                      >
                        {PHASES.map((p) => <option key={p} value={p}>{p.replace(/_/g, " ")}</option>)}
                      </select>
                    ) : (
                      <button
                        onClick={() => canAnalyst && setEditStatus({ incident, field: "phase" })}
                        className={`text-sm text-muted-foreground flex items-center gap-1 ${canAnalyst ? "cursor-pointer hover:text-foreground" : ""}`}
                      >
                        {incident.phase.replace(/_/g, " ")}
                        {canAnalyst && <ChevronDown className="h-2.5 w-2.5" />}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(incident.started_at)}</td>
                  {canLead && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {incident.status !== "CLOSED" && (
                          <button
                            onClick={() => setConfirmClose(incident)}
                            title="Close incident"
                            className="p-1.5 text-muted-foreground hover:text-orange-500 rounded transition-colors"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDelete(incident)}
                          title="Delete incident"
                          className="p-1.5 text-muted-foreground hover:text-red-500 rounded transition-colors"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-xl border border-border p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="font-semibold text-lg mb-2">Close Incident</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Close <span className="font-medium text-foreground">{confirmClose.title}</span>? This marks it as resolved and moves it to POST_INCIDENT phase.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmClose(null)} className="px-4 py-2 border border-border text-sm rounded-lg">
                Cancel
              </button>
              <button
                onClick={() => updateMutation.mutate({
                  id: confirmClose.id,
                  data: { status: "CLOSED", phase: "POST_INCIDENT" },
                })}
                disabled={updateMutation.isPending}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm rounded-lg disabled:opacity-50"
              >
                Close Incident
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-xl border border-border p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="font-semibold text-lg mb-2 text-red-600">Delete Incident</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Permanently delete <span className="font-medium text-foreground">{confirmDelete.title}</span>? This removes all associated IOCs, assets, tasks, evidence, and timeline events. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 border border-border text-sm rounded-lg">
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg disabled:opacity-50"
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
