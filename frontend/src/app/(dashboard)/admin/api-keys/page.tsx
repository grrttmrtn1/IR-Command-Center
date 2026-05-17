"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { ApiKey } from "@/lib/types";
import { toast } from "sonner";
import { Plus, Trash2, Copy, Key, CheckCircle2 } from "lucide-react";

const ALL_SCOPES = [
  "incidents:read", "incidents:write", "documents:read",
  "tasks:read", "tasks:write", "audit:read", "comms:read",
];

interface ApiKeyCreated extends ApiKey {
  plaintext_key: string;
}

export default function ApiKeysPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [newKey, setNewKey] = useState<ApiKeyCreated | null>(null);
  const [form, setForm] = useState({ name: "", scopes: ["incidents:read"] as string[], expires_days: 90 });
  const [copied, setCopied] = useState(false);

  const { data: keys = [] } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api.get<ApiKey[]>("/admin/api-keys").then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post<ApiKeyCreated>("/admin/api-keys", data).then((r) => r.data),
    onSuccess: (key) => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      setNewKey(key);
      setShowForm(false);
      setForm({ name: "", scopes: ["incidents:read"], expires_days: 90 });
    },
    onError: () => toast.error("Failed to create API key"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/api-keys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key revoked");
    },
  });

  function toggleScope(scope: string) {
    setForm((prev) => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter((s) => s !== scope)
        : [...prev.scopes, scope],
    }));
  }

  async function copyKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey.plaintext_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-muted-foreground mt-1">Manage external API access tokens</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Generate Key
        </button>
      </div>

      {/* Newly created key — shown once */}
      {newKey && (
        <div className="rounded-xl border border-green-500 bg-green-50 dark:bg-green-950/30 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <p className="font-semibold text-green-800 dark:text-green-400">API key created — copy it now</p>
          </div>
          <p className="text-xs text-green-700 dark:text-green-500 mb-3">
            This key will not be shown again. Store it securely.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-background border border-border rounded-lg px-3 py-2 break-all">
              {newKey.plaintext_key}
            </code>
            <button
              onClick={copyKey}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg transition-colors shrink-0"
            >
              {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="mt-3 text-xs text-green-700 dark:text-green-400 hover:underline">Dismiss</button>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 mb-6 space-y-4">
          <h3 className="font-semibold text-sm">New API Key</h3>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Key name (e.g., SIEM Integration)..."
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">Scopes</label>
            <div className="flex flex-wrap gap-2">
              {ALL_SCOPES.map((scope) => (
                <button
                  key={scope}
                  onClick={() => toggleScope(scope)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-mono ${
                    form.scopes.includes(scope)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted/30"
                  }`}
                >
                  {scope}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Expiration</label>
            <select
              value={form.expires_days}
              onChange={(e) => setForm({ ...form, expires_days: Number(e.target.value) })}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
            >
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>1 year</option>
              <option value={0}>No expiration</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.name || form.scopes.length === 0 || createMutation.isPending}
              className="flex-1 py-2 bg-primary text-primary-foreground text-sm rounded-lg disabled:opacity-50"
            >
              Generate Key
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-border text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {/* Keys table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {keys.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Key className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No API keys</p>
            <p className="text-sm text-muted-foreground mt-1">Generate keys to allow external integrations</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Key</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Scopes</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Last Used</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expires</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {keys.map((key) => (
                <tr key={key.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{key.name}</p>
                      {!key.is_active && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Revoked</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <code className="text-xs font-mono text-muted-foreground">{key.key_prefix}••••••••</code>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {key.scopes.map((s) => (
                        <span key={s} className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{s}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {key.expires_at ? (
                      new Date(key.expires_at) < new Date()
                        ? <span className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded font-medium">Expired {new Date(key.expires_at).toLocaleDateString()}</span>
                        : <span className="text-muted-foreground">{new Date(key.expires_at).toLocaleDateString()}</span>
                    ) : <span className="text-muted-foreground">Never</span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {key.is_active && (
                      <button
                        onClick={() => {
                          if (confirm(`Revoke API key "${key.name}"?`)) deleteMutation.mutate(key.id);
                        }}
                        className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors rounded"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
