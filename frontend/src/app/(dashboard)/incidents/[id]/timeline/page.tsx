"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { TimelineEvent } from "@/lib/types";
import { toast } from "sonner";
import { Plus, Clock, AlertCircle, Shield, CheckCircle2, Tag, X } from "lucide-react";

const EVENT_ICONS: Record<string, React.ReactNode> = {
  DETECTION: <AlertCircle className="h-4 w-4 text-red-500" />,
  CONTAINMENT: <Shield className="h-4 w-4 text-yellow-500" />,
  ERADICATION: <CheckCircle2 className="h-4 w-4 text-blue-500" />,
  RECOVERY: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  NOTE: <Clock className="h-4 w-4 text-muted-foreground" />,
};

const EVENT_TYPES = ["DETECTION", "ANALYSIS", "CONTAINMENT", "ERADICATION", "RECOVERY", "NOTE", "COMMUNICATION", "ESCALATION", "OTHER"];

const QUICK_TAGS = [
  { tag: "NIST_CSF:RS.MA", label: "Incident Mgmt", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { tag: "NIST_CSF:RS.AN", label: "Analysis", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { tag: "NIST_CSF:RS.CO", label: "Reporting", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { tag: "NIST_CSF:RS.MI", label: "Mitigation", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { tag: "NIST_CSF:RC.RP", label: "Recovery Plan", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { tag: "NIST_CSF:DE.AE", label: "Adverse Event", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { tag: "ISO_27001:A.5.26", label: "ISO: Incident Response", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  { tag: "ISO_27001:A.5.27", label: "ISO: Lessons Learned", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  { tag: "ISO_27001:A.5.28", label: "ISO: Evidence", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  { tag: "SOC2:CC7.3", label: "SOC2: Evaluate Events", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  { tag: "SOC2:CC7.4", label: "SOC2: Respond", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  { tag: "SOC2:CC7.5", label: "SOC2: Recover", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
];

function TagPicker({ eventId, currentTags, incidentId }: { eventId: string; currentTags: string[]; incidentId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const tagMutation = useMutation({
    mutationFn: (tags: string[]) => api.patch(`/incidents/${incidentId}/timeline/${eventId}/tags`, { tags }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incident-timeline", incidentId] });
      toast.success("Tags updated");
    },
  });

  function toggleTag(tag: string) {
    const next = currentTags.includes(tag) ? currentTags.filter((t) => t !== tag) : [...currentTags, tag];
    tagMutation.mutate(next);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md border border-border hover:border-primary/50 transition-colors"
      >
        <Tag className="h-3 w-3" />
        Tag
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-30 w-72 rounded-xl border border-border bg-popover shadow-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Framework Tags</p>
            <button onClick={() => setOpen(false)}><X className="h-3 w-3 text-muted-foreground" /></button>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto">
            {QUICK_TAGS.map(({ tag, label, color }) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-2 py-1 rounded-full text-xs font-medium transition-all border ${
                  currentTags.includes(tag)
                    ? `${color} border-current ring-1 ring-current`
                    : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TimelinePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ event_type: "NOTE", description: "", occurred_at: new Date().toISOString().slice(0, 16) });

  const { data: events = [] } = useQuery({
    queryKey: ["incident-timeline", id],
    queryFn: () => api.get<TimelineEvent[]>(`/incidents/${id}/timeline`).then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post(`/incidents/${id}/timeline`, {
      ...data,
      occurred_at: new Date(data.occurred_at).toISOString(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incident-timeline", id] });
      setForm({ event_type: "NOTE", description: "", occurred_at: new Date().toISOString().slice(0, 16) });
      setShowForm(false);
      toast.success("Event added to timeline");
    },
  });

  const sorted = [...events].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Incident Timeline</h2>
          <p className="text-sm text-muted-foreground mt-1">{events.length} events</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Event
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 mb-6 space-y-3">
          <h3 className="font-semibold text-sm">New Timeline Event</h3>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.event_type}
              onChange={(e) => setForm({ ...form, event_type: e.target.value })}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
            >
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              type="datetime-local"
              value={form.occurred_at}
              onChange={(e) => setForm({ ...form, occurred_at: e.target.value })}
              className="px-3 py-2 text-sm border border-border rounded-lg bg-background"
            />
          </div>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            placeholder="Describe what happened..."
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.description || createMutation.isPending}
              className="flex-1 py-2 bg-primary text-primary-foreground text-sm rounded-lg disabled:opacity-50"
            >
              Add Event
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-border text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />

        <div className="space-y-6">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Clock className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium">No timeline events yet</p>
              <p className="text-sm text-muted-foreground mt-1">Events are logged automatically and can be added manually</p>
            </div>
          ) : sorted.map((event) => (
            <div key={event.id} className="flex gap-4 relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-card border border-border shrink-0 z-10">
                {EVENT_ICONS[event.event_type] ?? EVENT_ICONS.NOTE}
              </div>
              <div className="flex-1 rounded-xl border border-border bg-card px-4 py-3 mt-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-primary">{event.event_type}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{new Date(event.occurred_at).toLocaleString()}</span>
                    <TagPicker eventId={event.id} currentTags={(event as any).tags ?? []} incidentId={id} />
                  </div>
                </div>
                <p className="text-sm text-foreground mt-1">{event.description}</p>
                {event.actor && <p className="text-xs text-muted-foreground mt-1">— {event.actor}</p>}
                {((event as any).tags ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {((event as any).tags as string[]).map((tag) => {
                      const qt = QUICK_TAGS.find((q) => q.tag === tag);
                      return (
                        <span key={tag} className={`text-xs px-2 py-0.5 rounded-full font-medium ${qt?.color ?? "bg-muted text-muted-foreground"}`}>
                          {qt?.label ?? tag}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
