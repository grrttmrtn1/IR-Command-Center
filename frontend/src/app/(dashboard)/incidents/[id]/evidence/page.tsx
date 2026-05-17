"use client";

import { useParams } from "next/navigation";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Evidence } from "@/lib/types";
import { toast } from "sonner";
import { Upload, FileText, Download, Trash2, Lock } from "lucide-react";

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function EvidencePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Evidence | null>(null);

  const { data: evidence = [] } = useQuery({
    queryKey: ["incident-evidence", id],
    queryFn: () => api.get<Evidence[]>(`/incidents/${id}/evidence`).then((r) => r.data),
  });

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file || !title) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title);
      fd.append("description", description);
      await api.post(`/incidents/${id}/evidence`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      qc.invalidateQueries({ queryKey: ["incident-evidence", id] });
      setTitle("");
      setDescription("");
      if (fileRef.current) fileRef.current.value = "";
      toast.success("Evidence uploaded");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Evidence Locker</h2>
          <p className="text-sm text-muted-foreground mt-1">{evidence.length} items · chain of custody maintained</p>
        </div>
      </div>

      {/* Upload form */}
      <div className="rounded-xl border border-border bg-card p-5 mb-6 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Upload Evidence</h3>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Evidence title..."
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Description of what this evidence contains and how it was collected..."
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none resize-none"
        />
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-muted/20 transition-colors"
        >
          <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">Click to select file</p>
          <p className="text-xs text-muted-foreground mt-1">Max 100 MB · All file types accepted</p>
          <input ref={fileRef} type="file" className="hidden" />
        </div>
        <button
          onClick={handleUpload}
          disabled={!title || uploading}
          className="w-full py-2 bg-primary text-primary-foreground text-sm rounded-lg disabled:opacity-50 transition-colors"
        >
          {uploading ? "Uploading..." : "Upload Evidence"}
        </button>
      </div>

      {/* Evidence list */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {evidence.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No evidence collected</p>
            <p className="text-sm text-muted-foreground mt-1">Upload files to maintain chain of custody</p>
          </div>
        ) : evidence.map((ev) => (
          <div
            key={ev.id}
            className={`px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors ${selected?.id === ev.id ? "bg-primary/5" : ""}`}
            onClick={() => setSelected(selected?.id === ev.id ? null : ev)}
          >
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{ev.title}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-muted-foreground">{ev.mime_type}</span>
                  <span className="text-xs text-muted-foreground">{ev.file_size != null ? formatBytes(ev.file_size) : "—"}</span>
                  <span className="text-xs text-muted-foreground">{new Date(ev.collected_at).toLocaleString()}</span>
                </div>
                {ev.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{ev.description}</p>}
              </div>
              <a
                href={`/api/incidents/${id}/evidence/${ev.id}/download`}
                download
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded"
              >
                <Download className="h-4 w-4" />
              </a>
            </div>

            {selected?.id === ev.id && ev.chain_of_custody && (
              <div className="mt-4 pl-8">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Chain of Custody</p>
                <div className="space-y-1">
                  {(Array.isArray(ev.chain_of_custody) ? ev.chain_of_custody : []).map((entry: Record<string, string>, i: number) => (
                    <div key={i} className="text-xs text-muted-foreground flex gap-2">
                      <span className="text-primary shrink-0">•</span>
                      <span>{entry.timestamp} — {entry.action} by {entry.actor}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
