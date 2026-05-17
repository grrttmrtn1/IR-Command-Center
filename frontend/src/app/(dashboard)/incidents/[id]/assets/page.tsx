"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { AffectedAsset } from "@/lib/types";
import { toast } from "sonner";
import { Plus, Server, Trash2 } from "lucide-react";

const ASSET_TYPES = ["SERVER", "WORKSTATION", "NETWORK_DEVICE", "CLOUD_RESOURCE", "DATABASE", "APPLICATION", "USER_ACCOUNT", "OTHER"];
const ASSET_STATUSES = ["UNKNOWN", "AFFECTED", "ISOLATED", "REMEDIATED", "MONITORING"];

const STATUS_COLORS: Record<string, string> = {
  UNKNOWN: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  AFFECTED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  ISOLATED: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  REMEDIATED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  MONITORING: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "text-red-600",
  HIGH: "text-orange-500",
  MEDIUM: "text-yellow-500",
  LOW: "text-blue-500",
};

export default function AssetsPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState({ name: "", asset_type: "SERVER", identifier: "", status: "AFFECTED", priority: "HIGH", notes: "" });

  const { data: assets = [] } = useQuery({
    queryKey: ["incident-assets", id],
    queryFn: () => api.get<AffectedAsset[]>(`/incidents/${id}/assets`).then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post(`/incidents/${id}/assets`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incident-assets", id] });
      setForm({ name: "", asset_type: "SERVER", identifier: "", status: "AFFECTED", priority: "HIGH", notes: "" });
      setShowForm(false);
      toast.success("Asset added");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ assetId, status }: { assetId: string; status: string }) =>
      api.patch(`/incidents/${id}/assets/${assetId}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incident-assets", id] });
      toast.success("Asset status updated");
    },
  });

  const filtered = statusFilter ? assets.filter((a) => a.status === statusFilter) : assets;
  const counts = ASSET_STATUSES.reduce((acc, s) => ({ ...acc, [s]: assets.filter((a) => a.status === s).length }), {} as Record<string, number>);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Affected Assets</h2>
          <p className="text-sm text-muted-foreground mt-1">{assets.length} assets tracked</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Asset
        </button>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {ASSET_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
            className={`rounded-lg border p-3 text-center transition-colors ${statusFilter === s ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted/30"}`}
          >
            <p className="text-2xl font-black">{counts[s] ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s}</p>
          </button>
        ))}
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 mb-6 space-y-3">
          <h3 className="font-semibold text-sm">New Asset</h3>
          <div className="grid grid-cols-2 gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Asset name..."
              className="col-span-2 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <select
              value={form.asset_type}
              onChange={(e) => setForm({ ...form, asset_type: e.target.value })}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
            >
              {ASSET_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </select>
            <input
              value={form.identifier}
              onChange={(e) => setForm({ ...form, identifier: e.target.value })}
              placeholder="IP, hostname, ARN, etc."
              className="px-3 py-2 text-sm border border-border rounded-lg bg-background font-mono focus:outline-none"
            />
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
            >
              {ASSET_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
            >
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            placeholder="Notes..."
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.name || createMutation.isPending}
              className="flex-1 py-2 bg-primary text-primary-foreground text-sm rounded-lg disabled:opacity-50"
            >
              Add Asset
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-border text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Server className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No assets found</p>
            <p className="text-sm text-muted-foreground mt-1">Track affected systems and their remediation status</p>
          </div>
        ) : filtered.map((asset) => (
          <div key={asset.id} className="px-5 py-4 flex items-start gap-4 hover:bg-muted/30 transition-colors">
            <Server className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{asset.name}</p>
                <span className={`text-xs font-semibold ${PRIORITY_COLORS[asset.priority] ?? ""}`}>{asset.priority}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-muted-foreground">{asset.asset_type.replace("_", " ")}</span>
                {asset.identifier && <span className="text-xs font-mono text-muted-foreground">{asset.identifier}</span>}
              </div>
              {asset.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{asset.notes}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={asset.status}
                onChange={(e) => updateMutation.mutate({ assetId: asset.id, status: e.target.value })}
                className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${STATUS_COLORS[asset.status] ?? STATUS_COLORS.UNKNOWN}`}
              >
                {ASSET_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
