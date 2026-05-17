"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, AlertTriangle, Shield, CheckSquare, FileText, MessageSquare, X } from "lucide-react";
import api from "@/lib/api";
import type { SearchResult } from "@/lib/types";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  incident: <AlertTriangle className="h-3.5 w-3.5 text-red-500" />,
  ioc: <Shield className="h-3.5 w-3.5 text-orange-500" />,
  task: <CheckSquare className="h-3.5 w-3.5 text-blue-500" />,
  document: <FileText className="h-3.5 w-3.5 text-purple-500" />,
  comms: <MessageSquare className="h-3.5 w-3.5 text-green-500" />,
};

const TYPE_LABELS: Record<string, string> = {
  incident: "Incident",
  ioc: "IOC",
  task: "Task",
  document: "Document",
  comms: "Comms",
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const router = useRouter();

  const openSearch = useCallback(() => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setSelected(0);
  }, []);

  // ⌘K / Ctrl+K shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        open ? closeSearch() : openSearch();
      }
      if (e.key === "Escape" && open) closeSearch();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, openSearch, closeSearch]);

  // Debounced search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(query)}`);
        setResults(res.data.results);
        setSelected(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query]);

  function navigate(href: string) {
    router.push(href);
    closeSearch();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[selected]) navigate(results[selected].href);
  }

  return (
    <>
      <button
        onClick={openSearch}
        className="p-1.5 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        aria-label="Search (⌘K)"
        title="Search (⌘K)"
      >
        <Search className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/40" onClick={closeSearch}>
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search incidents, IOCs, tasks, documents..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              {query && (
                <button onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }}>
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
              <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-xs font-mono text-muted-foreground border border-border rounded">Esc</kbd>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {loading && (
                <p className="px-4 py-4 text-sm text-muted-foreground text-center">Searching…</p>
              )}
              {!loading && query && results.length === 0 && (
                <p className="px-4 py-4 text-sm text-muted-foreground text-center">No results for &quot;{query}&quot;</p>
              )}
              {!loading && !query && (
                <p className="px-4 py-4 text-sm text-muted-foreground text-center">Type to search across all data</p>
              )}
              {results.map((r, i) => (
                <button
                  key={r.id}
                  onClick={() => navigate(r.href)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border last:border-0 ${i === selected ? "bg-muted/50" : ""}`}
                >
                  <span className="mt-0.5">{TYPE_ICONS[r.type]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{r.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {TYPE_LABELS[r.type] ?? r.type}
                      </span>
                    </div>
                    {r.snippet && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.snippet}</p>}
                  </div>
                </button>
              ))}
            </div>

            <div className="px-4 py-2 border-t border-border flex items-center gap-3 text-xs text-muted-foreground">
              <span><kbd className="font-mono">↑↓</kbd> navigate</span>
              <span><kbd className="font-mono">↵</kbd> open</span>
              <span><kbd className="font-mono">Esc</kbd> close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
