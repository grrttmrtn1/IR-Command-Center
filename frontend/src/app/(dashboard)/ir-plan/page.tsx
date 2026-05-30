"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth, hasRole } from "@/lib/auth";
import type { IRPlanSection } from "@/lib/types";
import { toast } from "sonner";
import {
  FileText, CheckCircle2, AlertTriangle, Clock, Pencil, X,
  Save, RotateCcw, ChevronDown, ChevronRight, Shield,
} from "lucide-react";
import { RichTextEditor } from "@/components/RichTextEditor";

function reviewStatus(section: IRPlanSection): "current" | "due" | "overdue" | "unreviewed" {
  if (!section.last_reviewed_at) return "unreviewed";
  const reviewedAt = new Date(section.last_reviewed_at);
  const now = new Date();
  const monthsAgo = (now.getTime() - reviewedAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
  if (section.next_review_at && new Date(section.next_review_at) < now) return "overdue";
  if (monthsAgo > 12) return "overdue";
  if (monthsAgo > 9) return "due";
  return "current";
}

const REVIEW_STATUS_UI: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  current:    { icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />, label: "Current",   color: "text-emerald-600 dark:text-emerald-400" },
  due:        { icon: <AlertTriangle className="h-4 w-4 text-yellow-500" />,  label: "Due Soon",  color: "text-yellow-600 dark:text-yellow-400" },
  overdue:    { icon: <AlertTriangle className="h-4 w-4 text-red-500" />,     label: "Overdue",   color: "text-red-600 dark:text-red-400" },
  unreviewed: { icon: <Clock className="h-4 w-4 text-muted-foreground" />,    label: "Not Reviewed", color: "text-muted-foreground" },
};

function hasContent(section: IRPlanSection): boolean {
  if (!section.content) return false;
  const lines = section.content.split("\n").filter((l) => l.trim().length > 0);
  // More than just the heading line means actual content was added
  return lines.length > 2;
}

function MarkdownPreview({ content }: { content: string }) {
  // Simple markdown-to-html for display (headings, bold, lists, tables)
  const lines = content.split("\n");
  const html: string[] = [];
  let inTable = false;
  let inList = false;

  for (const line of lines) {
    if (line.startsWith("### ")) {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<h3 class="text-base font-semibold mt-5 mb-1">${line.slice(4)}</h3>`);
    } else if (line.startsWith("## ")) {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<h2 class="text-lg font-bold mt-6 mb-2 border-b border-border pb-1">${line.slice(3)}</h2>`);
    } else if (line.startsWith("# ")) {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<h1 class="text-xl font-bold mt-4 mb-2">${line.slice(2)}</h1>`);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) { html.push("<ul class='list-disc list-inside space-y-0.5 my-2 text-sm'>"); inList = true; }
      html.push(`<li>${line.slice(2).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</li>`);
    } else if (line.startsWith("|")) {
      if (!inTable) { html.push("<div class='overflow-x-auto my-3'><table class='text-xs border-collapse w-full'>"); inTable = true; }
      if (line.startsWith("|---") || line.startsWith("| ---")) continue;
      const cells = line.split("|").filter((_, i, a) => i > 0 && i < a.length - 1);
      const isHeader = !inTable || html[html.length - 1]?.includes("<th>");
      const tag = isHeader ? "th" : "td";
      html.push(`<tr>${cells.map((c) => `<${tag} class="border border-border px-2 py-1 text-left">${c.trim()}</${tag}>`).join("")}</tr>`);
    } else {
      if (inTable) { html.push("</table></div>"); inTable = false; }
      if (inList) { html.push("</ul>"); inList = false; }
      if (line.trim() === "") {
        html.push("<br/>");
      } else {
        html.push(`<p class="text-sm my-1">${line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\*(.*?)\*/g, "<em>$1</em>")}</p>`);
      }
    }
  }
  if (inList) html.push("</ul>");
  if (inTable) html.push("</table></div>");

  return (
    <div
      className="prose prose-sm max-w-none text-foreground"
      dangerouslySetInnerHTML={{ __html: html.join("") }}
    />
  );
}

function SectionEditor({ section, onClose }: { section: IRPlanSection; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canReview = hasRole(user, "IR_LEAD");
  const [content, setContent] = useState(section.content ?? "");
  const [title, setTitle] = useState(section.title);
  const [dirty, setDirty] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (data: { title: string; content: string }) =>
      api.patch(`/ir-plan/sections/${section.section_key}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ir-plan-sections"] });
      setDirty(false);
      toast.success("Section saved");
    },
    onError: () => toast.error("Failed to save section"),
  });

  const reviewMutation = useMutation({
    mutationFn: () => api.post(`/ir-plan/sections/${section.section_key}/review`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ir-plan-sections"] });
      toast.success("Section marked as reviewed");
    },
    onError: () => toast.error("Failed to mark as reviewed"),
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0 gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            className="text-base font-semibold bg-transparent border-none outline-none flex-1 min-w-0"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canReview && (
            <button
              onClick={() => reviewMutation.mutate()}
              disabled={reviewMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Mark Reviewed
            </button>
          )}
          <button
            onClick={() => saveMutation.mutate({ title, content })}
            disabled={saveMutation.isPending || !dirty}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Save className="h-3.5 w-3.5" /> {saveMutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <RichTextEditor
          value={content}
          onChange={(v) => { setContent(v); setDirty(true); }}
          placeholder="Write this section…"
          minHeight="calc(100vh - 160px)"
          className="border-0 rounded-none shadow-none focus-within:ring-0"
        />
      </div>

      {/* Footer status */}
      <div className="px-6 py-2 border-t border-border text-xs text-muted-foreground flex items-center justify-between shrink-0">
        <span>Version {section.version} · Markdown supported</span>
        <div className="flex items-center gap-4">
          {section.last_reviewed_at && (
            <span>Last reviewed: {new Date(section.last_reviewed_at).toLocaleDateString()}</span>
          )}
          {dirty && <span className="text-yellow-600 dark:text-yellow-400 font-medium">Unsaved changes</span>}
        </div>
      </div>
    </div>
  );
}

function SectionRow({ section, onEdit }: { section: IRPlanSection; onEdit: () => void }) {
  const rs = reviewStatus(section);
  const rsUI = REVIEW_STATUS_UI[rs];
  const filled = hasContent(section);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card transition-colors">
      <div className="flex items-center gap-4 p-4">
        <button
          onClick={() => filled && setExpanded((v) => !v)}
          className={`shrink-0 ${filled ? "cursor-pointer text-muted-foreground hover:text-foreground" : "cursor-default"}`}
          aria-label={expanded ? "Collapse section" : "Expand section"}
        >
          {filled
            ? expanded
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />
            : <ChevronRight className="h-4 w-4 opacity-20" />}
        </button>
        <div
          className={`flex-1 min-w-0 ${filled ? "cursor-pointer" : ""}`}
          onClick={() => filled && setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{section.title}</span>
            {!filled && <span className="text-[10px] font-semibold uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Empty</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <div className={`flex items-center gap-1 text-xs ${rsUI.color}`}>
              {rsUI.icon}
              <span>{rsUI.label}</span>
            </div>
            {section.last_reviewed_at && (
              <span className="text-xs text-muted-foreground">
                Reviewed {new Date(section.last_reviewed_at).toLocaleDateString()}
              </span>
            )}
            {section.next_review_at && (
              <span className="text-xs text-muted-foreground">
                · Next: {new Date(section.next_review_at).toLocaleDateString()}
              </span>
            )}
            <span className="text-xs text-muted-foreground">v{section.version}</span>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors shrink-0"
        >
          <Pencil className="h-3.5 w-3.5" /> {filled ? "Edit" : "Start"}
        </button>
      </div>
      {expanded && filled && (
        <div className="px-6 pb-5 pt-1 border-t border-border/60">
          <MarkdownPreview content={section.content!} />
        </div>
      )}
    </div>
  );
}

export default function IRPlanPage() {
  const { user } = useAuth();
  const [editingSection, setEditingSection] = useState<IRPlanSection | null>(null);

  const { data: sections = [], isLoading } = useQuery<IRPlanSection[]>({
    queryKey: ["ir-plan-sections"],
    queryFn: () => api.get<IRPlanSection[]>("/ir-plan/sections").then((r) => r.data),
  });

  const sorted = [...sections].sort((a, b) => a.sort_order - b.sort_order);

  const totalSections = sorted.length;
  const filledSections = sorted.filter(hasContent).length;
  const currentSections = sorted.filter((s) => reviewStatus(s) === "current").length;
  const overdueSections = sorted.filter((s) => reviewStatus(s) === "overdue" || reviewStatus(s) === "due").length;

  if (editingSection) {
    return <SectionEditor section={editingSection} onClose={() => setEditingSection(null)} />;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">IR Plan</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Living incident response plan — structured sections, version-tracked, review-dated.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          <Shield className="h-4 w-4 shrink-0" />
          <span>{filledSections}/{totalSections} sections completed · {currentSections} current</span>
        </div>
      </div>

      {/* Summary cards */}
      {!isLoading && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <div className="text-2xl font-bold">{filledSections}/{totalSections}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Sections with content</div>
            <div className="mt-2 bg-muted rounded-full h-1.5 overflow-hidden">
              <div className="bg-primary h-1.5 rounded-full" style={{ width: `${totalSections ? (filledSections / totalSections) * 100 : 0}%` }} />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{currentSections}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Reviewed within 12 months</div>
          </div>
          <div className={`rounded-xl border bg-card p-4 text-center ${overdueSections > 0 ? "border-yellow-300 dark:border-yellow-800" : "border-border"}`}>
            <div className={`text-2xl font-bold ${overdueSections > 0 ? "text-yellow-600 dark:text-yellow-400" : ""}`}>{overdueSections}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Sections needing review</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading IR Plan sections…</div>
      ) : (
        <div className="space-y-2">
          {sorted.map((section) => (
            <SectionRow
              key={section.section_key}
              section={section}
              onEdit={() => setEditingSection(section)}
            />
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground text-center">
        IR Lead or above can mark sections as reviewed. All changes are version-tracked.
      </p>
    </div>
  );
}
