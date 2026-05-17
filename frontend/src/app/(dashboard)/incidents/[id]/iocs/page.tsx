"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { IOC } from "@/lib/types";
import { toast } from "sonner";
import { Plus, Trash2, Shield, AlertTriangle } from "lucide-react";

const IOC_TYPES = ["IP_ADDRESS", "DOMAIN", "URL", "FILE_HASH", "EMAIL", "REGISTRY_KEY", "FILENAME", "CVE", "USER_ACCOUNT", "OTHER"];

const CONFIDENCE_COLORS: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  MEDIUM: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  LOW: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

export default function IOCsPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "IP_ADDRESS", value: "", confidence: "HIGH", source: "", notes: "" });
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const { data: iocs = [] } = useQuery({
    queryKey: ["incident-iocs", id],
    queryFn: () => api.get<IOC[]>(`/incidents/${id}/iocs`).then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post(`/incidents/${id}/iocs`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incident-iocs", id] });
      setForm({ type: "IP_ADDRESS", value: "", confidence: "HIGH", source: "", notes: "" });
      setShowForm(false);
      toast.success("IOC added");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (iocId: string) => api.delete(`/incidents/${id}/iocs/${iocId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incident-iocs", id] });
      toast.success("IOC removed");
    },
  });

  async function analyzeIOC(ioc: IOC) {
    setAnalyzingId(ioc.id);
    try {
      const { data } = await api.post("/ai/analyze-ioc", { ioc_type: ioc.type, ioc_value: ioc.value });
      toast.success("Analysis complete — check notes", { description: data.analysis?.slice(0, 80) + "…" });
      qc.invalidateQueries({ queryKey: ["incident-iocs", id] });
    } catch {
      toast.error("AI analysis failed");
    } finally {
      setAnalyzingId(null);
    }
  }

  const filtered = iocs.filter((ioc) => {
    const matchesSearch = !filter || ioc.value.toLowerCase().includes(filter.toLowerCase());
    const matchesType = !typeFilter || ioc.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Indicators of Compromise</h2>
          <p className="text-sm text-muted-foreground mt-1">{iocs.length} IOCs tracked</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add IOC
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 mb-6 space-y-4">
          <h3 className="font-semibold text-sm">New IOC</h3>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
            >
              {IOC_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </select>
            <select
              value={form.confidence}
              onChange={(e) => setForm({ ...form, confidence: e.target.value })}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
            >
              <option value="HIGH">High Confidence</option>
              <option value="MEDIUM">Medium Confidence</option>
              <option value="LOW">Low Confidence</option>
            </select>
          </div>
          <input
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
            placeholder="IOC value (IP, hash, domain, etc.)"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            placeholder="Source (e.g. SIEM alert, threat intel feed)..."
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            placeholder="Additional notes..."
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.value || createMutation.isPending}
              className="flex-1 py-2 bg-primary text-primary-foreground text-sm rounded-lg disabled:opacity-50"
            >
              Add IOC
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-border text-sm rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search IOCs..."
          className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
        >
          <option value="">All Types</option>
          {IOC_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
        </select>
      </div>

      <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Shield className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No IOCs found</p>
            <p className="text-sm text-muted-foreground mt-1">Add indicators of compromise to track threats</p>
          </div>
        ) : filtered.map((ioc) => (
          <div key={ioc.id} className="px-5 py-4 flex items-start gap-4 hover:bg-muted/30 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium bg-muted px-2 py-0.5 rounded">{ioc.type.replace("_", " ")}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${CONFIDENCE_COLORS[ioc.confidence] ?? CONFIDENCE_COLORS.LOW}`}>
                  {ioc.confidence}
                </span>
              </div>
              <p className="text-sm font-mono mt-1.5 text-foreground break-all">{ioc.value}</p>
              {ioc.source && <p className="text-xs text-muted-foreground mt-1">Source: {ioc.source}</p>}
              {ioc.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ioc.notes}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => analyzeIOC(ioc)}
                disabled={analyzingId === ioc.id}
                className="flex items-center gap-1 px-2.5 py-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
              >
                <AlertTriangle className="h-3 w-3" />
                {analyzingId === ioc.id ? "Analyzing..." : "AI Analyze"}
              </button>
              <button
                onClick={() => deleteMutation.mutate(ioc.id)}
                className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors rounded"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
