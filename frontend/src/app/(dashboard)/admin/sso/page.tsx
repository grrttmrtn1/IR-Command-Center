"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Shield, CheckCircle2, XCircle } from "lucide-react";

interface SSOConfig {
  id: string;
  name: string;
  type: "SAML" | "OIDC";
  is_active: boolean;
  created_at: string;
}

interface SSOConfigForm {
  name: string;
  type: "SAML" | "OIDC";
  // SAML fields
  idp_entity_id?: string;
  idp_sso_url?: string;
  idp_certificate?: string;
  // OIDC fields
  client_id?: string;
  client_secret?: string;
  discovery_url?: string;
}

export default function SSOPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SSOConfigForm>({ name: "", type: "OIDC" });

  const { data: configs = [] } = useQuery({
    queryKey: ["sso-configs"],
    queryFn: () => api.get<SSOConfig[]>("/admin/sso-configs").then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: SSOConfigForm) => api.post("/admin/sso-configs", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sso-configs"] });
      setForm({ name: "", type: "OIDC" });
      setShowForm(false);
      toast.success("SSO configuration saved");
    },
    onError: () => toast.error("Failed to save SSO configuration"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id }: { id: string; is_active: boolean }) =>
      api.patch(`/admin/sso-configs/${id}/toggle`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sso-configs"] });
      toast.success("SSO configuration updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/sso-configs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sso-configs"] });
      toast.success("SSO configuration removed");
    },
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">SSO Configuration</h1>
          <p className="text-muted-foreground mt-1">Configure SAML 2.0 and OIDC identity providers</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Provider
        </button>
      </div>

      {/* SP Metadata */}
      <div className="rounded-xl border border-border bg-muted/30 p-5 mb-6">
        <h3 className="font-semibold text-sm mb-3">Service Provider Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">SAML ACS URL</p>
            <code className="text-xs font-mono text-foreground">/api/auth/saml/callback</code>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">OIDC Redirect URI</p>
            <code className="text-xs font-mono text-foreground">/api/auth/oidc/callback</code>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">SAML Entity ID</p>
            <code className="text-xs font-mono text-foreground">/api/auth/saml/metadata</code>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">OIDC Scopes</p>
            <code className="text-xs font-mono text-foreground">openid email profile</code>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 mb-6 space-y-4">
          <h3 className="font-semibold text-sm">New SSO Provider</h3>
          <div className="grid grid-cols-2 gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Provider name (e.g., Okta, Azure AD)..."
              className="col-span-2 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex gap-2 col-span-2">
              {(["OIDC", "SAML"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setForm({ ...form, type: t })}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${form.type === t ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/30"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {form.type === "OIDC" ? (
            <div className="space-y-3">
              <input value={form.discovery_url ?? ""} onChange={(e) => setForm({ ...form, discovery_url: e.target.value })} placeholder="Discovery URL (e.g. https://accounts.google.com/.well-known/openid-configuration)..." className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none font-mono" />
              <input value={form.client_id ?? ""} onChange={(e) => setForm({ ...form, client_id: e.target.value })} placeholder="Client ID..." className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none" />
              <input value={form.client_secret ?? ""} onChange={(e) => setForm({ ...form, client_secret: e.target.value })} placeholder="Client Secret..." type="password" className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none" />
            </div>
          ) : (
            <div className="space-y-3">
              <input value={form.idp_entity_id ?? ""} onChange={(e) => setForm({ ...form, idp_entity_id: e.target.value })} placeholder="IdP Entity ID..." className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none font-mono" />
              <input value={form.idp_sso_url ?? ""} onChange={(e) => setForm({ ...form, idp_sso_url: e.target.value })} placeholder="IdP SSO URL..." className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none font-mono" />
              <textarea value={form.idp_certificate ?? ""} onChange={(e) => setForm({ ...form, idp_certificate: e.target.value })} rows={6} placeholder="IdP X.509 Certificate (PEM format)..." className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background font-mono focus:outline-none resize-none" />
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.name || createMutation.isPending}
              className="flex-1 py-2 bg-primary text-primary-foreground text-sm rounded-lg disabled:opacity-50"
            >
              Save Configuration
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-border text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {configs.length === 0 ? (
          <div className="flex flex-col items-center py-16 rounded-xl border border-dashed border-border text-center">
            <Shield className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No SSO providers configured</p>
            <p className="text-sm text-muted-foreground mt-1">Add SAML 2.0 or OIDC identity providers</p>
          </div>
        ) : configs.map((config) => (
          <div key={config.id} className="rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-4">
            <div className={`px-2.5 py-1 rounded text-xs font-semibold ${config.type === "SAML" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>
              {config.type}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{config.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Added {new Date(config.created_at).toLocaleDateString()}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleMutation.mutate({ id: config.id, is_active: !config.is_active } as { id: string; is_active: boolean })}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted/30 transition-colors"
              >
                {config.is_active
                  ? <><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Active</>
                  : <><XCircle className="h-3.5 w-3.5 text-muted-foreground" /> Disabled</>}
              </button>
              <button
                onClick={() => {
                  if (confirm(`Remove "${config.name}"?`)) deleteMutation.mutate(config.id);
                }}
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
