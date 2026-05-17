"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, X, ToggleLeft, ToggleRight } from "lucide-react";

interface TaskTemplate {
  id: string;
  incident_type: string;
  title: string;
  priority: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
}

const BUILTIN_INCIDENT_TYPES = ["base", "RANSOMWARE", "DATA_BREACH", "DDOS", "PHISHING", "INSIDER_THREAT", "MALWARE", "VULNERABILITY", "OTHER"];

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  MEDIUM: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  LOW: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

export default function TaskTemplatesPage() {
  const qc = useQueryClient();
  const [selectedType, setSelectedType] = useState("base");
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const [newTypeInput, setNewTypeInput] = useState("");
  const [showNewTypeInput, setShowNewTypeInput] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", priority: "MEDIUM", description: "" });
  const [showCreate, setShowCreate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ title: "", priority: "MEDIUM", description: "" });

  const allTypes = [...BUILTIN_INCIDENT_TYPES, ...customTypes];

  function addCustomType() {
    const type = newTypeInput.trim().toUpperCase().replace(/\s+/g, "_");
    if (!type || allTypes.includes(type)) return;
    setCustomTypes([...customTypes, type]);
    setSelectedType(type);
    setNewTypeInput("");
    setShowNewTypeInput(false);
  }

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["task-templates", selectedType],
    queryFn: () => api.get<TaskTemplate[]>("/task-templates", { params: { incident_type: selectedType } }).then((r) => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => api.patch(`/task-templates/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-templates"] });
      setEditingId(null);
      toast.success("Template updated");
    },
    onError: () => toast.error("Failed to update template"),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post("/task-templates", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-templates"] });
      setShowCreate(false);
      setNewTemplate({ title: "", priority: "MEDIUM", description: "" });
      toast.success("Template created");
    },
    onError: () => toast.error("Failed to create template"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/task-templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-templates"] });
      toast.success("Template deleted");
    },
    onError: (err: { response?: { data?: { detail?: string } } }) =>
      toast.error(err.response?.data?.detail ?? "Cannot delete this template"),
  });

  const startEdit = (t: TaskTemplate) => {
    setEditingId(t.id);
    setEditForm({ title: t.title, priority: t.priority, description: t.description ?? "" });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Task Templates</h1>
          <p className="text-muted-foreground mt-1">Manage the out-of-the-box tasks seeded into new incidents</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Template
        </button>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-4 mb-6 text-sm text-muted-foreground">
        <strong>How it works:</strong> When a new incident is created, it is seeded with the <em>base</em> tasks plus any tasks for its specific type. Templates marked inactive are skipped. Built-in templates can be edited (creates an override) but not deleted.
      </div>

      {/* Type selector */}
      <div className="flex gap-2 flex-wrap mb-5 items-center">
        {allTypes.map((type) => (
          <button
            key={type}
            onClick={() => setSelectedType(type)}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${selectedType === type ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
          >
            {type === "base" ? "All Incidents (Base)" : type.replace(/_/g, " ")}
          </button>
        ))}
        {showNewTypeInput ? (
          <div className="flex items-center gap-1">
            <input
              value={newTypeInput}
              onChange={(e) => setNewTypeInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addCustomType(); if (e.key === "Escape") setShowNewTypeInput(false); }}
              placeholder="Type name (e.g. CLOUD_BREACH)..."
              autoFocus
              className="px-2 py-1 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary w-48"
            />
            <button onClick={addCustomType} className="p-1 text-green-600 hover:text-green-700">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setShowNewTypeInput(false)} className="p-1 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewTypeInput(true)}
            className="px-3 py-1.5 text-xs rounded-md border border-dashed border-border hover:bg-muted transition-colors flex items-center gap-1"
            title="Add custom incident type"
          >
            <Plus className="h-3 w-3" /> Custom Type
          </button>
        )}
      </div>

      {/* Add form */}
      {showCreate && (
        <div className="rounded-xl border border-border bg-card p-5 mb-5 space-y-3">
          <h3 className="font-semibold text-sm">Add Template for: <span className="text-primary">{selectedType}</span></h3>
          <div className="grid grid-cols-2 gap-3">
            <input value={newTemplate.title} onChange={(e) => setNewTemplate({ ...newTemplate, title: e.target.value })} placeholder="Task title..." className="col-span-2 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
            <select value={newTemplate.priority} onChange={(e) => setNewTemplate({ ...newTemplate, priority: e.target.value })} className="px-3 py-2 text-sm border border-border rounded-lg bg-background">
              {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input value={newTemplate.description} onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })} placeholder="Description (optional)..." className="px-3 py-2 text-sm border border-border rounded-lg bg-background" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate({ ...newTemplate, incident_type: selectedType })} disabled={!newTemplate.title || createMutation.isPending} className="flex-1 py-2 bg-primary text-primary-foreground text-sm rounded-lg disabled:opacity-50">Add Template</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 border border-border text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-8">#</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Task</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Priority</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Active</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {templates.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">No templates for this type</td></tr>
              ) : templates.map((t, i) => (
                <tr key={t.id} className={`hover:bg-muted/20 transition-colors ${!t.is_active ? "opacity-50" : ""}`}>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-5 py-3">
                    {editingId === t.id ? (
                      <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="w-full px-2 py-1 text-sm border border-border rounded bg-background" />
                    ) : (
                      <p className="font-medium">{t.title}</p>
                    )}
                    {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                  </td>
                  <td className="px-5 py-3">
                    {editingId === t.id ? (
                      <select value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })} className="px-2 py-1 text-xs border border-border rounded bg-background">
                        {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[t.priority]}`}>{t.priority}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {t.is_system ? <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded">System</span> : <span className="bg-muted px-2 py-0.5 rounded">Custom</span>}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => updateMutation.mutate({ id: t.id, data: { is_active: !t.is_active } })}
                      className={`${t.is_active ? "text-green-500" : "text-muted-foreground"} hover:opacity-70 transition-opacity`}
                      title={t.is_active ? "Deactivate" : "Activate"}
                    >
                      {t.is_active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    {editingId === t.id ? (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => updateMutation.mutate({ id: t.id, data: { title: editForm.title, priority: editForm.priority, description: editForm.description || null } })} className="p-1.5 text-green-600 hover:text-green-700 rounded">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 text-muted-foreground hover:text-foreground rounded">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => startEdit(t)} className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors" title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {!t.is_system && (
                          <button onClick={() => deleteMutation.mutate(t.id)} className="p-1.5 text-muted-foreground hover:text-red-500 rounded transition-colors" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
