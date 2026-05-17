"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Document } from "@/lib/types";
import { toast } from "sonner";
import { Plus, Search, FileText, Trash2 } from "lucide-react";
import { MarkdownViewer } from "@/components/MarkdownViewer";

const CATEGORIES = ["PLAYBOOK", "PROCEDURE", "POLICY", "TEMPLATE", "EVIDENCE", "LEGAL", "COMMUNICATION", "TRAINING", "OTHER"];

export default function DocumentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [isTemplate, setIsTemplate] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Document | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newDoc, setNewDoc] = useState({ title: "", category: "PLAYBOOK", content: "", is_template: false });

  const { data: docs = [] } = useQuery({
    queryKey: ["documents", search, category, isTemplate],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (category) params.category = category;
      if (isTemplate !== null) params.is_template = String(isTemplate);
      return api.get<Document[]>("/documents", { params }).then((r) => r.data);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof newDoc) => api.post<Document>("/documents", data).then((r) => r.data),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      setSelected(doc);
      setCreating(false);
      toast.success("Document created");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.patch<Document>(`/documents/${id}`, { content }).then((r) => r.data),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      setSelected(doc);
      toast.success("Document saved (v" + doc.version + ")");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      setSelected(null);
      toast.success("Document deleted");
    },
    onError: () => toast.error("Failed to delete document"),
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Document Library</h1>
          <p className="text-muted-foreground mt-1">{docs.length} documents · playbooks, templates, policies, and more</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Document
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List */}
        <div className="lg:col-span-1">
          <div className="space-y-3 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => setIsTemplate(null)}
                className={`flex-1 py-1.5 text-xs rounded-md border transition-colors ${isTemplate === null ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
              >
                All
              </button>
              <button
                onClick={() => setIsTemplate(false)}
                className={`flex-1 py-1.5 text-xs rounded-md border transition-colors ${isTemplate === false ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
              >
                Documents
              </button>
              <button
                onClick={() => setIsTemplate(true)}
                className={`flex-1 py-1.5 text-xs rounded-md border transition-colors ${isTemplate === true ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
              >
                Templates
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card divide-y divide-border max-h-[600px] overflow-y-auto">
            {docs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No documents found</p>
            ) : docs.map((doc) => (
              <button
                key={doc.id}
                onClick={() => setSelected(doc)}
                className={`w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors ${selected?.id === doc.id ? "bg-primary/10" : ""}`}
              >
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-1">{doc.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{doc.category}</span>
                      {doc.is_system_template && <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1 rounded">System</span>}
                      {doc.is_template && !doc.is_system_template && <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1 rounded">Template</span>}
                      <span className="text-xs text-muted-foreground">v{doc.version}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Editor / Viewer */}
        <div className="lg:col-span-2">
          {creating ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border bg-muted/30">
                <h3 className="font-semibold">New Document</h3>
              </div>
              <div className="p-5 space-y-4">
                <input
                  value={newDoc.title}
                  onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
                  placeholder="Document title..."
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <div className="flex gap-3">
                  <select
                    value={newDoc.category}
                    onChange={(e) => setNewDoc({ ...newDoc, category: e.target.value })}
                    className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-background"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={newDoc.is_template} onChange={(e) => setNewDoc({ ...newDoc, is_template: e.target.checked })} />
                    Template
                  </label>
                </div>
                <textarea
                  value={newDoc.content}
                  onChange={(e) => setNewDoc({ ...newDoc, content: e.target.value })}
                  rows={20}
                  placeholder="Document content (Markdown supported)..."
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => createMutation.mutate(newDoc)}
                    disabled={!newDoc.title || createMutation.isPending}
                    className="flex-1 py-2 bg-primary text-primary-foreground text-sm rounded-lg disabled:opacity-50"
                  >
                    Create Document
                  </button>
                  <button onClick={() => setCreating(false)} className="px-4 py-2 border border-border text-sm rounded-lg">Cancel</button>
                </div>
              </div>
            </div>
          ) : selected ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{selected.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{selected.category} · v{selected.version}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!selected.is_system_template && (
                    <button
                      onClick={() => setPreviewMode(!previewMode)}
                      className="px-3 py-1.5 border border-border text-xs rounded-lg hover:bg-muted transition-colors"
                    >
                      {previewMode ? "Edit" : "Preview"}
                    </button>
                  )}
                  {!selected.is_system_template && !previewMode && (
                    <button
                      onClick={() => updateMutation.mutate({ id: selected.id, content: selected.content ?? "" })}
                      disabled={updateMutation.isPending}
                      className="px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      Save
                    </button>
                  )}
                  {!selected.is_system_template && (
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${selected.title}"? This cannot be undone.`)) {
                          deleteMutation.mutate(selected.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50"
                      title="Delete document"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="p-5">
                {selected.is_system_template ? (
                  <MarkdownViewer content={selected.content ?? ""} defaultRaw={false} />
                ) : previewMode ? (
                  <MarkdownViewer
                    content={selected.content ?? ""}
                    defaultRaw={false}
                    className="min-h-[400px]"
                  />
                ) : (
                  <textarea
                    value={selected.content ?? ""}
                    onChange={(e) => setSelected({ ...selected, content: e.target.value })}
                    rows={24}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-80 rounded-xl border border-dashed border-border">
              <FileText className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium">Select a document</p>
              <p className="text-sm text-muted-foreground mt-1">Or create a new one</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
