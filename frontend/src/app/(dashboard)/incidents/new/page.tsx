"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import type { Incident } from "@/lib/types";

const INCIDENT_TYPES = [
  { value: "RANSOMWARE", label: "Ransomware" },
  { value: "DATA_BREACH", label: "Data Breach" },
  { value: "DDOS", label: "DDoS" },
  { value: "INSIDER_THREAT", label: "Insider Threat" },
  { value: "PHISHING", label: "Phishing" },
  { value: "MALWARE", label: "Malware" },
  { value: "VULNERABILITY", label: "Vulnerability" },
  { value: "OTHER", label: "Other" },
];

export default function NewIncidentPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", description: "", incident_type: "OTHER", severity: "MEDIUM" });

  const mutation = useMutation({
    mutationFn: (data: typeof form) => api.post<Incident>("/incidents", data).then((r) => r.data),
    onSuccess: (incident) => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      toast.success("Incident declared. Task templates loaded automatically.");
      router.replace(`/incidents/${incident.id}`);
    },
    onError: () => toast.error("Failed to create incident"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    mutation.mutate(form);
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Declare Incident</h1>
        <p className="text-muted-foreground mt-1">Create a new incident. Task templates will be automatically added based on incident type.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 bg-card border border-border rounded-xl p-6">
        <div>
          <label className="block text-sm font-medium mb-1.5">Incident Title <span className="text-destructive">*</span></label>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="e.g. Ransomware attack on file servers"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Type <span className="text-destructive">*</span></label>
            <select
              value={form.incident_type}
              onChange={(e) => setForm({ ...form, incident_type: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {INCIDENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Severity <span className="text-destructive">*</span></label>
            <select
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            placeholder="What is happening? Initial findings, affected systems, how was it detected..."
          />
        </div>

        {form.incident_type === "RANSOMWARE" && (
          <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 p-4">
            <p className="text-sm font-medium text-orange-800 dark:text-orange-400">Ransomware Protocol</p>
            <p className="text-xs text-orange-600 dark:text-orange-500 mt-1">Ransomware-specific tasks will be added automatically. Navigate to the Ransomware Decision Support tool after declaring this incident.</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="flex-1 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? "Declaring..." : "Declare Incident"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2.5 border border-border text-foreground rounded-lg hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
