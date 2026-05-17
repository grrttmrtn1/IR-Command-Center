"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { TimelineEvent } from "@/lib/types";
import { toast } from "sonner";
import { Plus, Clock, AlertCircle, Shield, CheckCircle2 } from "lucide-react";

const EVENT_ICONS: Record<string, React.ReactNode> = {
  DETECTION: <AlertCircle className="h-4 w-4 text-red-500" />,
  CONTAINMENT: <Shield className="h-4 w-4 text-yellow-500" />,
  ERADICATION: <CheckCircle2 className="h-4 w-4 text-blue-500" />,
  RECOVERY: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  NOTE: <Clock className="h-4 w-4 text-muted-foreground" />,
};

const EVENT_TYPES = ["DETECTION", "ANALYSIS", "CONTAINMENT", "ERADICATION", "RECOVERY", "NOTE", "COMMUNICATION", "ESCALATION", "OTHER"];

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
                  <span className="text-xs text-muted-foreground">{new Date(event.occurred_at).toLocaleString()}</span>
                </div>
                <p className="text-sm text-foreground mt-1">{event.description}</p>
                {event.actor && <p className="text-xs text-muted-foreground mt-1">— {event.actor}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
