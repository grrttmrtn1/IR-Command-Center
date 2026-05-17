"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Send, Download, Mail, ToggleLeft, ToggleRight } from "lucide-react";

type Schedule = {
  id: string;
  name: string;
  enabled: boolean;
  cron_expression: string;
  recipients: string[];
  last_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export default function ReportsAdminPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "Weekly Executive Report", enabled: false, recipients: "" });

  const { data: schedules = [] } = useQuery({
    queryKey: ["report-schedules"],
    queryFn: () => api.get<Schedule[]>("/admin/reports").then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; enabled: boolean; recipients: string[] }) =>
      api.post("/admin/reports", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-schedules"] });
      setShowCreate(false);
      setForm({ name: "Weekly Executive Report", enabled: false, recipients: "" });
      toast.success("Report schedule created");
    },
    onError: () => toast.error("Failed to create schedule"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/reports/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-schedules"] });
      toast.success("Schedule deleted");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (s: Schedule) =>
      api.patch(`/admin/reports/${s.id}`, { name: s.name, enabled: !s.enabled, recipients: s.recipients }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report-schedules"] }),
    onError: () => toast.error("Failed to toggle schedule"),
  });

  const sendNowMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/reports/${id}/send-now`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-schedules"] });
      toast.success("Report sent successfully");
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "Failed to send report — check SMTP config"),
  });

  function handleCreate() {
    const recipients = form.recipients.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
    if (!recipients.length) return toast.error("Add at least one recipient");
    createMutation.mutate({ name: form.name, enabled: form.enabled, recipients });
  }

  function previewReport() {
    window.open("/api/admin/reports/preview", "_blank");
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Executive Reports</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Weekly PDF digest — open incidents, task backlog, MTTR trend — sent via email.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={previewReport}
            className="flex items-center gap-1.5 px-3 py-2 border border-border text-sm rounded-lg hover:bg-muted transition-colors"
          >
            <Download className="h-4 w-4" />
            Preview PDF
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Schedule
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-border bg-card p-5 mb-6 space-y-4">
          <h3 className="font-semibold">Create Report Schedule</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Schedule Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
                placeholder="Weekly Executive Report"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Recipients (comma or newline separated)
              </label>
              <textarea
                value={form.recipients}
                onChange={(e) => setForm({ ...form, recipients: e.target.value })}
                rows={3}
                placeholder="ciso@company.com, vp-security@company.com"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background resize-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="enabled" className="text-sm">Enable immediately (sends every Monday at 08:00 UTC)</label>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="flex-1 py-2 bg-primary text-primary-foreground text-sm rounded-lg disabled:opacity-50"
            >
              Create Schedule
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 border border-border text-sm rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {schedules.length === 0 ? (
          <div className="py-16 text-center">
            <Mail className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-sm">No report schedules configured</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a schedule to send weekly executive reports via email.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {schedules.map((s) => (
              <div key={s.id} className="px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-sm">{s.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.enabled ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                      {s.enabled ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {s.recipients.map((r) => (
                      <span key={r} className="text-xs bg-muted px-2 py-0.5 rounded-full font-mono">{r}</span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {s.last_sent_at ? `Last sent: ${new Date(s.last_sent_at).toLocaleString()}` : "Never sent"}
                    {" · Runs every Monday 08:00 UTC"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleMutation.mutate(s)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title={s.enabled ? "Disable" : "Enable"}
                  >
                    {s.enabled ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5" />}
                  </button>
                  <button
                    onClick={() => sendNowMutation.mutate(s.id)}
                    disabled={sendNowMutation.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    <Send className="h-3 w-3" />
                    Send Now
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(s.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
