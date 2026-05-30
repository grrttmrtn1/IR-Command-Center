"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import api from "@/lib/api";
import type { Incident, IOC, AffectedAsset, IncidentNote } from "@/lib/types";
import { SEVERITY_COLORS, IOC_TYPE_ICONS, formatDate, timeAgo } from "@/lib/utils";
import { useAuth, hasRole } from "@/lib/auth";
import { toast } from "sonner";
import { useWarRoomWS } from "@/lib/useWarRoomWS";
import { Plus, Sparkles, Clock, FileText, CheckSquare, Lock, MessageSquare, ChevronDown, XCircle, Trash2, Download, Wifi, WifiOff, Shield, StickyNote } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { RichTextEditor } from "@/components/RichTextEditor";

const PHASES = [
  "PREPARATION", "DETECTION", "ANALYSIS", "CONTAINMENT",
  "ERADICATION", "RECOVERY", "POST_INCIDENT",
] as const;

const STATUSES = ["OPEN", "CONTAINED", "ERADICATING", "RECOVERING", "CLOSED"] as const;

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  CONTAINED: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  ERADICATING: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  RECOVERING: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  CLOSED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

export default function WarRoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();

  const canAnalyst = hasRole(user, "ANALYST");
  const canLead = hasRole(user, "IR_LEAD");

  const { data: incident, isLoading } = useQuery({
    queryKey: ["incident", id],
    queryFn: () => api.get<Incident>(`/incidents/${id}`).then((r) => r.data),
  });

  const { data: iocs = [] } = useQuery({
    queryKey: ["incident-iocs", id],
    queryFn: () => api.get<IOC[]>(`/incidents/${id}/iocs`).then((r) => r.data),
  });

  const { data: assets = [] } = useQuery({
    queryKey: ["incident-assets", id],
    queryFn: () => api.get<AffectedAsset[]>(`/incidents/${id}/assets`).then((r) => r.data),
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["incident-notes", id],
    queryFn: () => api.get<IncidentNote[]>(`/incidents/${id}/notes`).then((r) => r.data),
  });

  const [addIOC, setAddIOC] = useState({ show: false, type: "IP_ADDRESS", value: "", confidence: "MEDIUM" });
  const [addAsset, setAddAsset] = useState({ show: false, name: "", asset_type: "server", identifier: "" });
  const [addNote, setAddNote] = useState({ show: false, content: "" });
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [editingPhase, setEditingPhase] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reportModal, setReportModal] = useState(false);
  const [aiNarrative, setAiNarrative] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const handleWsEvent = useCallback((event: { type: string; actor?: string; data?: unknown }) => {
    setWsConnected(true);
    if (event.type === "ioc_added") {
      qc.invalidateQueries({ queryKey: ["incident-iocs", id] });
      toast.info(`${event.actor ?? "Teammate"} added an IOC`);
    } else if (event.type === "task_updated") {
      qc.invalidateQueries({ queryKey: ["incident-tasks", id] });
    } else if (event.type === "note_added") {
      qc.invalidateQueries({ queryKey: ["incident-notes", id] });
      toast.info(`${event.actor ?? "Teammate"} added a note`);
    } else if (event.type === "timeline_event") {
      qc.invalidateQueries({ queryKey: ["incident-timeline", id] });
    } else if (event.type === "chat_message") {
      qc.invalidateQueries({ queryKey: ["incident-chat", id] });
    }
  }, [qc, id]);

  const { isConnected } = useWarRoomWS(id, handleWsEvent);

  const iocMutation = useMutation({
    mutationFn: (data: { ioc_type: string; value: string; confidence: string }) =>
      api.post(`/incidents/${id}/iocs`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incident-iocs", id] });
      setAddIOC({ show: false, type: "IP_ADDRESS", value: "", confidence: "MEDIUM" });
      toast.success("IOC added");
    },
  });

  const assetMutation = useMutation({
    mutationFn: (data: { name: string; asset_type: string; identifier: string }) =>
      api.post(`/incidents/${id}/assets`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incident-assets", id] });
      setAddAsset({ show: false, name: "", asset_type: "server", identifier: "" });
      toast.success("Asset added");
    },
  });

  const noteMutation = useMutation({
    mutationFn: (data: { content: string }) => api.post(`/incidents/${id}/notes`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incident-notes", id] });
      setAddNote({ show: false, content: "" });
      toast.success("Note added");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, string>) => api.patch(`/incidents/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incident", id] });
      qc.invalidateQueries({ queryKey: ["incidents"] });
      setEditingStatus(false);
      setEditingPhase(false);
      toast.success("Incident updated");
    },
    onError: () => toast.error("Failed to update incident"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/incidents/${id}`),
    onSuccess: () => {
      toast.success("Incident deleted");
      router.push("/incidents");
    },
    onError: () => toast.error("Failed to delete incident"),
  });

  const generateBrief = async () => {
    setGeneratingBrief(true);
    try {
      await api.post(`/incidents/${id}/exec-brief`);
      qc.invalidateQueries({ queryKey: ["incident-notes", id] });
      toast.success("Executive briefing generated and pinned");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || "Failed to generate briefing");
    } finally {
      setGeneratingBrief(false);
    }
  };

  if (isLoading || !incident) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-16 rounded-md" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-20 rounded-md" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
        </div>
        <div className="flex items-center gap-1 mb-6">
          {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-6 w-20 rounded" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card">
              <div className="px-4 py-3 border-b border-border">
                <Skeleton className="h-4 w-36" />
              </div>
              <div className="p-4 space-y-3">
                {[...Array(4)].map((_, j) => <Skeleton key={j} className="h-10 w-full rounded-lg" />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const elapsed = Math.round((Date.now() - new Date(incident.started_at).getTime()) / 3600000);
  const pinnedNotes = notes.filter((n) => n.is_pinned || n.is_exec_briefing);
  const regularNotes = notes.filter((n) => !n.is_pinned && !n.is_exec_briefing);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Status / phase / actions bar */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${SEVERITY_COLORS[incident.severity]}`}>
            {incident.severity}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground flex items-center gap-1 text-sm">
            <Clock className="h-3 w-3" />
            Active {elapsed}h
          </span>

          {/* Status control */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Status:</span>
            {canAnalyst && editingStatus ? (
              <select
                value={incident.status}
                autoFocus
                onChange={(e) => updateMutation.mutate({ status: e.target.value })}
                onBlur={() => setEditingStatus(false)}
                className="px-2 py-0.5 text-xs border border-border rounded bg-background"
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <button
                onClick={() => canAnalyst && setEditingStatus(true)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[incident.status]} ${canAnalyst ? "cursor-pointer hover:opacity-80" : ""}`}
              >
                {incident.status}
                {canAnalyst && <ChevronDown className="h-2.5 w-2.5" />}
              </button>
            )}
          </div>

          {/* Phase control */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Phase:</span>
            {canAnalyst && editingPhase ? (
              <select
                value={incident.phase}
                autoFocus
                onChange={(e) => updateMutation.mutate({ phase: e.target.value })}
                onBlur={() => setEditingPhase(false)}
                className="px-2 py-0.5 text-xs border border-border rounded bg-background"
              >
                {PHASES.map((p) => <option key={p} value={p}>{p.replace(/_/g, " ")}</option>)}
              </select>
            ) : (
              <button
                onClick={() => canAnalyst && setEditingPhase(true)}
                className={`inline-flex items-center gap-1 text-xs text-muted-foreground ${canAnalyst ? "cursor-pointer hover:text-foreground" : ""}`}
              >
                {incident.phase.replace(/_/g, " ")}
                {canAnalyst && <ChevronDown className="h-2.5 w-2.5" />}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* WS connection indicator */}
          <span title={isConnected() ? "Live updates active" : "Connecting..."} className="shrink-0">
            {isConnected()
              ? <Wifi className="h-4 w-4 text-green-500" />
              : <WifiOff className="h-4 w-4 text-muted-foreground" />
            }
          </span>
          {canLead && (
            <button
              onClick={() => setReportModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-border text-sm font-medium rounded-lg transition-colors hover:bg-muted"
            >
              <Download className="h-4 w-4" />
              Export PDF
            </button>
          )}
          {canLead && incident.status !== "CLOSED" && (
            <button
              onClick={() => updateMutation.mutate({ status: "CLOSED", phase: "POST_INCIDENT" })}
              disabled={updateMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-2 border border-orange-300 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20 text-sm font-medium rounded-lg transition-colors"
            >
              <XCircle className="h-4 w-4" />
              Close
            </button>
          )}
          {canLead && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-2 text-muted-foreground hover:text-red-500 rounded-lg transition-colors border border-transparent hover:border-red-200"
              title="Delete incident"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {hasRole(user, "IR_LEAD") && (
            <button
              onClick={generateBrief}
              disabled={generatingBrief}
              className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              {generatingBrief ? "Generating..." : "AI Exec Brief"}
            </button>
          )}
        </div>
      </div>

      {/* Phase lifecycle guide */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
        {PHASES.map((phase, i) => {
          const phaseIdx = PHASES.indexOf(incident.phase as typeof PHASES[number]);
          const isActive = incident.phase === phase;
          const isPast = i < phaseIdx;
          return (
            <div key={phase} className="flex items-center shrink-0">
              <div className={`px-2.5 py-1 rounded text-xs font-medium ${
                isActive ? "bg-primary text-primary-foreground" :
                isPast ? "bg-muted text-muted-foreground line-through" :
                "text-muted-foreground"
              }`}>
                {phase.replace(/_/g, " ")}
              </div>
              {i < PHASES.length - 1 && (
                <div className={`w-4 h-px mx-0.5 ${isPast || isActive ? "bg-primary/50" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* IOCs */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-sm">Indicators of Compromise ({iocs.length})</h3>
              {canAnalyst && <button onClick={() => setAddIOC({ ...addIOC, show: true })} className="text-xs text-primary hover:underline">+ Add</button>}
            </div>

            {addIOC.show && (
              <div className="p-3 border-b border-border bg-muted/30 space-y-2">
                <select
                  value={addIOC.type}
                  onChange={(e) => setAddIOC({ ...addIOC, type: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background"
                >
                  {["IP_ADDRESS", "DOMAIN", "URL", "FILE_HASH", "EMAIL", "CVE", "USER_ACCOUNT", "OTHER"].map((t) => (
                    <option key={t} value={t}>{t.replace("_", " ")}</option>
                  ))}
                </select>
                <input
                  value={addIOC.value}
                  onChange={(e) => setAddIOC({ ...addIOC, value: e.target.value })}
                  placeholder="IOC value..."
                  className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background"
                />
                <select
                  value={addIOC.confidence}
                  onChange={(e) => setAddIOC({ ...addIOC, confidence: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background"
                >
                  <option value="HIGH">HIGH confidence</option>
                  <option value="MEDIUM">MEDIUM confidence</option>
                  <option value="LOW">LOW confidence</option>
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => iocMutation.mutate({ ioc_type: addIOC.type, value: addIOC.value, confidence: addIOC.confidence })}
                    disabled={!addIOC.value || iocMutation.isPending}
                    className="flex-1 py-1.5 bg-primary text-primary-foreground text-xs rounded-md disabled:opacity-50"
                  >
                    Add IOC
                  </button>
                  <button onClick={() => setAddIOC({ ...addIOC, show: false })} className="px-3 py-1.5 border border-border text-xs rounded-md">Cancel</button>
                </div>
              </div>
            )}

            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {iocs.length === 0 ? (
                <EmptyState icon={Shield} title="No IOCs documented" className="py-6" />
              ) : iocs.map((ioc) => (
                <div key={ioc.id} className="px-4 py-2.5 flex items-start gap-2">
                  <span className="text-sm shrink-0 mt-0.5">{IOC_TYPE_ICONS[ioc.type] ?? "❓"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-foreground truncate">{ioc.value}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{ioc.type.replace("_", " ")}</span>
                      <span className={`text-xs font-medium ${ioc.confidence === "HIGH" ? "text-red-500" : ioc.confidence === "MEDIUM" ? "text-yellow-500" : "text-green-500"}`}>
                        {ioc.confidence}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Assets */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-sm">Affected Assets ({assets.length})</h3>
              {canAnalyst && <button onClick={() => setAddAsset({ ...addAsset, show: true })} className="text-xs text-primary hover:underline">+ Add</button>}
            </div>

            {addAsset.show && (
              <div className="p-3 border-b border-border bg-muted/30 space-y-2">
                <input
                  value={addAsset.name}
                  onChange={(e) => setAddAsset({ ...addAsset, name: e.target.value })}
                  placeholder="Asset name..."
                  className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background"
                />
                <input
                  value={addAsset.identifier}
                  onChange={(e) => setAddAsset({ ...addAsset, identifier: e.target.value })}
                  placeholder="IP / hostname / ARN..."
                  className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background"
                />
                <select
                  value={addAsset.asset_type}
                  onChange={(e) => setAddAsset({ ...addAsset, asset_type: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background"
                >
                  {["server", "workstation", "cloud", "network", "database", "other"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => assetMutation.mutate({ name: addAsset.name, asset_type: addAsset.asset_type, identifier: addAsset.identifier })}
                    disabled={!addAsset.name || assetMutation.isPending}
                    className="flex-1 py-1.5 bg-primary text-primary-foreground text-xs rounded-md disabled:opacity-50"
                  >
                    Add Asset
                  </button>
                  <button onClick={() => setAddAsset({ ...addAsset, show: false })} className="px-3 py-1.5 border border-border text-xs rounded-md">Cancel</button>
                </div>
              </div>
            )}

            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {assets.length === 0 ? (
                <EmptyState icon={CheckSquare} title="No assets documented" className="py-6" />
              ) : assets.map((asset) => (
                <div key={asset.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-foreground">{asset.name}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      asset.status === "AFFECTED" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                      asset.status === "ISOLATED" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    }`}>{asset.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{asset.asset_type} {asset.identifier ? `· ${asset.identifier}` : ""}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-sm">Notes & Briefings ({notes.length})</h3>
              {canAnalyst && <button onClick={() => setAddNote({ show: true, content: "" })} className="text-xs text-primary hover:underline">+ Add</button>}
            </div>

            {addNote.show && (
              <div className="p-3 border-b border-border bg-muted/30 space-y-2">
                <RichTextEditor
                  value={addNote.content}
                  onChange={(v) => setAddNote({ ...addNote, content: v })}
                  placeholder="Add a note…"
                  minHeight="80px"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => noteMutation.mutate({ content: addNote.content })}
                    disabled={!addNote.content || noteMutation.isPending}
                    className="flex-1 py-1.5 bg-primary text-primary-foreground text-xs rounded-md disabled:opacity-50"
                  >
                    Add Note
                  </button>
                  <button onClick={() => setAddNote({ show: false, content: "" })} className="px-3 py-1.5 border border-border text-xs rounded-md">Cancel</button>
                </div>
              </div>
            )}

            <div className="divide-y divide-border max-h-80 overflow-y-auto">
              {notes.length === 0 ? (
                <EmptyState icon={StickyNote} title="No notes yet" className="py-6" />
              ) : (
                <>
                  {pinnedNotes.map((note) => (
                    <div key={note.id} className="px-4 py-3 bg-purple-50/50 dark:bg-purple-950/20">
                      <div className="flex items-center gap-1 mb-1">
                        {note.is_exec_briefing && <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1"><Sparkles className="h-3 w-3" />Exec Brief</span>}
                        {note.is_pinned && !note.is_exec_briefing && <span className="text-xs text-yellow-600">📌 Pinned</span>}
                      </div>
                      <p className="text-xs text-foreground whitespace-pre-wrap line-clamp-4">{note.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">{timeAgo(note.created_at)}</p>
                    </div>
                  ))}
                  {regularNotes.map((note) => (
                    <div key={note.id} className="px-4 py-3">
                      <p className="text-xs text-foreground whitespace-pre-wrap line-clamp-3">{note.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">{timeAgo(note.created_at)}</p>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link href={`/incidents/${id}/tasks`} className="rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-colors flex items-center gap-3">
          <CheckSquare className="h-5 w-5 text-blue-500" />
          <div>
            <p className="text-sm font-medium">Task Board</p>
            <p className="text-xs text-muted-foreground">Kanban workflow</p>
          </div>
        </Link>
        <Link href={`/incidents/${id}/evidence`} className="rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-colors flex items-center gap-3">
          <Lock className="h-5 w-5 text-green-500" />
          <div>
            <p className="text-sm font-medium">Evidence Locker</p>
            <p className="text-xs text-muted-foreground">Chain of custody</p>
          </div>
        </Link>
        <Link href={`/incidents/${id}/comms`} className="rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-colors flex items-center gap-3">
          <MessageSquare className="h-5 w-5 text-purple-500" />
          <div>
            <p className="text-sm font-medium">Crisis Comms</p>
            <p className="text-xs text-muted-foreground">Draft notifications</p>
          </div>
        </Link>
        <Link href={`/incidents/${id}/timeline`} className="rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-colors flex items-center gap-3">
          <Clock className="h-5 w-5 text-orange-500" />
          <div>
            <p className="text-sm font-medium">Timeline</p>
            <p className="text-xs text-muted-foreground">Activity log</p>
          </div>
        </Link>
      </div>

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-xl border border-border p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="font-semibold text-lg mb-2 text-red-600">Delete Incident</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Permanently delete <span className="font-medium text-foreground">{incident.title}</span>? This removes all IOCs, assets, tasks, evidence, and timeline events. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 border border-border text-sm rounded-lg">Cancel</button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg disabled:opacity-50"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export report modal */}
      {reportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-xl border border-border p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="font-semibold text-lg mb-2">Export Incident Report</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Generate a PDF report for <span className="font-medium text-foreground">{incident.title}</span> including IOCs, timeline, and task completion.
            </p>
            <label className="flex items-center gap-2 text-sm mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={aiNarrative}
                onChange={(e) => setAiNarrative(e.target.checked)}
                className="rounded"
              />
              Include AI-generated narrative section (requires AI config)
            </label>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setReportModal(false)} className="px-4 py-2 border border-border text-sm rounded-lg">Cancel</button>
              <a
                href={`/api/incidents/${id}/report?ai_narrative=${aiNarrative}`}
                download
                onClick={() => setReportModal(false)}
                className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg flex items-center gap-2 hover:opacity-90"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
