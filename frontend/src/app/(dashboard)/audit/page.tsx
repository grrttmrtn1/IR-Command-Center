"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { AuditLog } from "@/lib/types";
import { Download, Search, FileText, Sparkles, Shield } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  update: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  delete: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

type TabMode = "all" | "ai";

export default function AuditPage() {
  const [tab, setTab] = useState<TabMode>("all");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [resource, setResource] = useState("");
  const [since, setSince] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const { data } = useQuery({
    queryKey: ["audit-logs", search, action, resource, since, page, tab],
    queryFn: () => {
      const params: Record<string, string | number | boolean> = { skip: page * PAGE_SIZE, limit: PAGE_SIZE };
      if (action) params.action = action;
      if (resource) params.resource = resource;
      if (since) params.since = new Date(since).toISOString();
      if (tab === "ai") params.ai_only = true;
      return api.get<{ items: AuditLog[]; total: number }>("/audit-logs", { params }).then((r) => r.data);
    },
  });

  const logs = data?.items ?? [];
  const total = data?.total ?? 0;

  function exportLogs(format: "csv" | "json") {
    const params = new URLSearchParams();
    if (action) params.set("action", action);
    if (resource) params.set("resource", resource);
    if (since) params.set("since", new Date(since).toISOString());
    params.set("format", format);
    window.open(`/api/audit-logs/export?${params}`, "_blank");
  }

  const filtered = search
    ? logs.filter((l) =>
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        l.resource.toLowerCase().includes(search.toLowerCase()) ||
        (l.resource_id?.toLowerCase().includes(search.toLowerCase())) ||
        (l.actor_display?.toLowerCase().includes(search.toLowerCase())))
    : logs;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground mt-1">Immutable record of all system actions</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportLogs("csv")}
            className="flex items-center gap-1.5 px-3 py-2 border border-border text-sm rounded-lg hover:bg-muted transition-colors"
          >
            <Download className="h-4 w-4" />
            CSV
          </button>
          <button
            onClick={() => exportLogs("json")}
            className="flex items-center gap-1.5 px-3 py-2 border border-border text-sm rounded-lg hover:bg-muted transition-colors"
          >
            <Download className="h-4 w-4" />
            JSON
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-border">
        <button
          onClick={() => { setTab("all"); setPage(0); }}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === "all" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Shield className="h-4 w-4" />
          All Activity
        </button>
        <button
          onClick={() => { setTab("ai"); setPage(0); }}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === "ai" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Sparkles className="h-4 w-4" />
          AI Activity
        </button>
      </div>

      {tab === "ai" && (
        <div className="rounded-xl border border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-950/20 p-4 mb-5 text-sm text-muted-foreground">
          Shows all AI-assisted actions: exec briefings, comms generation, IOC analysis, gap analysis, and task generation.
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        {tab === "all" && (
          <>
            <select
              value={action}
              onChange={(e) => { setAction(e.target.value); setPage(0); }}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
            >
              <option value="">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="login">Login</option>
              <option value="logout">Logout</option>
            </select>
            <select
              value={resource}
              onChange={(e) => { setResource(e.target.value); setPage(0); }}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
            >
              <option value="">All Resources</option>
              <option value="incident">Incident</option>
              <option value="task">Task</option>
              <option value="document">Document</option>
              <option value="user">User</option>
              <option value="ioc">IOC</option>
              <option value="evidence">Evidence</option>
              <option value="comms_draft">Communications</option>
              <option value="assessment">Assessment</option>
              <option value="ai">AI</option>
            </select>
          </>
        )}
        <input
          type="date"
          value={since}
          onChange={(e) => { setSince(e.target.value); setPage(0); }}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
        />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Timestamp</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Action</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Resource</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actor</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-16 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No audit log entries found</p>
                  </td>
                </tr>
              ) : filtered.map((log) => {
                const actionType = log.action.split(":")[0];
                return (
                  <tr key={log.id} className={`hover:bg-muted/20 transition-colors ${log.is_ai_action ? "bg-purple-50/20 dark:bg-purple-950/10" : ""}`}>
                    <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap font-mono">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        {log.is_ai_action && <Sparkles className="h-3 w-3 text-purple-500 shrink-0" />}
                        <span className={`text-xs px-2 py-0.5 rounded font-mono font-medium ${ACTION_COLORS[actionType] ?? "bg-muted text-muted-foreground"}`}>
                          {log.action}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium">{log.resource}</p>
                      {log.resource_id && <p className="text-xs text-muted-foreground font-mono">{log.resource_id.slice(0, 8)}…</p>}
                    </td>
                    <td className="px-5 py-3 text-sm text-muted-foreground">
                      {log.actor_display ?? (log.user_id ? log.user_id.slice(0, 8) + "…" : log.api_key_id ? "API Key" : "System")}
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-muted-foreground">{log.ip_address ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">{total} total entries</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 border border-border text-sm rounded-lg disabled:opacity-50 hover:bg-muted transition-colors"
            >
              Previous
            </button>
            <span className="px-3 py-1.5 text-sm text-muted-foreground">Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= total}
              className="px-3 py-1.5 border border-border text-sm rounded-lg disabled:opacity-50 hover:bg-muted transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
