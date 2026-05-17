"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { ShieldCheck, CheckCircle2, Circle, ChevronDown, ChevronRight } from "lucide-react";

type FrameworkCategory = {
  id: string;
  label: string;
  function: string;
  tag: string;
  count: number;
};

type FrameworkCoverage = {
  name: string;
  covered: FrameworkCategory[];
  uncovered: FrameworkCategory[];
  coverage_pct: number;
};

type CoverageData = Record<string, FrameworkCoverage>;

const FW_COLORS: Record<string, string> = {
  NIST_CSF: "bg-blue-500",
  ISO_27001: "bg-emerald-500",
  SOC2: "bg-purple-500",
};

const FW_RING: Record<string, string> = {
  NIST_CSF: "ring-blue-200 dark:ring-blue-900",
  ISO_27001: "ring-emerald-200 dark:ring-emerald-900",
  SOC2: "ring-purple-200 dark:ring-purple-900",
};

function CoverageBar({ pct, fwKey }: { pct: number; fwKey: string }) {
  const color = FW_COLORS[fwKey] ?? "bg-gray-500";
  return (
    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function FrameworkCard({ fwKey, fw }: { fwKey: string; fw: FrameworkCoverage }) {
  const [open, setOpen] = useState(false);
  const allCategories = [...fw.covered, ...fw.uncovered].sort((a, b) =>
    a.function.localeCompare(b.function) || a.id.localeCompare(b.id)
  );
  const functions = Array.from(new Set(allCategories.map((c) => c.function)));

  return (
    <div className={`rounded-xl border border-border bg-card ring-2 ${FW_RING[fwKey] ?? "ring-border"} overflow-hidden`}>
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-base">{fw.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {fw.covered.length} / {fw.covered.length + fw.uncovered.length} criteria covered
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{fw.coverage_pct}%</div>
            <div className="text-xs text-muted-foreground">coverage</div>
          </div>
        </div>
        <CoverageBar pct={fw.coverage_pct} fwKey={fwKey} />
      </div>

      <div className="border-t border-border">
        <button
          onClick={() => setOpen(!open)}
          className="w-full px-5 py-3 flex items-center justify-between text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
        >
          <span>View breakdown</span>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {open && (
          <div className="px-5 pb-5 space-y-4">
            {functions.map((fn) => {
              const cats = allCategories.filter((c) => c.function === fn);
              return (
                <div key={fn}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{fn}</p>
                  <div className="space-y-1">
                    {cats.map((cat) => (
                      <div key={cat.tag} className="flex items-center gap-2.5 py-1">
                        {cat.count > 0 ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                        )}
                        <span className="text-xs font-mono text-muted-foreground w-20 shrink-0">{cat.id}</span>
                        <span className="text-sm flex-1">{cat.label}</span>
                        {cat.count > 0 && (
                          <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
                            {cat.count}×
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CompliancePage() {
  const { data: coverage, isLoading } = useQuery({
    queryKey: ["compliance-coverage"],
    queryFn: () => api.get<CoverageData>("/compliance/coverage").then((r) => r.data),
  });

  const totalCovered = coverage
    ? Object.values(coverage).reduce((s, fw) => s + fw.covered.length, 0)
    : 0;
  const totalCriteria = coverage
    ? Object.values(coverage).reduce((s, fw) => s + fw.covered.length + fw.uncovered.length, 0)
    : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Compliance Framework Coverage</h1>
      </div>
      <p className="text-muted-foreground mb-6 text-sm">
        Coverage is derived from framework tags applied to timeline events and tasks across all incidents. Tag events and tasks in the IR War Room to build this view.
      </p>

      {!isLoading && coverage && (
        <div className="rounded-xl border border-border bg-card p-4 mb-6 flex items-center gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold">{totalCovered}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Criteria Covered</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold">{totalCriteria}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Criteria</div>
          </div>
          <div className="flex-1">
            <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
              <div
                className="bg-primary h-3 rounded-full transition-all"
                style={{ width: `${totalCriteria ? Math.round(totalCovered / totalCriteria * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalCriteria ? Math.round(totalCovered / totalCriteria * 100) : 0}% overall coverage across all frameworks
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card h-40 animate-pulse" />
          ))}
        </div>
      ) : coverage ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(coverage).map(([fwKey, fw]) => (
            <FrameworkCard key={fwKey} fwKey={fwKey} fw={fw} />
          ))}
        </div>
      ) : null}

      <div className="mt-8 rounded-xl border border-border bg-muted/30 p-5">
        <h2 className="font-semibold mb-2 text-sm">How to tag activities</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Open any incident, then go to the <strong>Timeline</strong> tab. On each event, click the tag icon to assign framework criteria. Do the same on individual tasks from the <strong>Tasks</strong> tab. Tags are stored as <code className="text-xs bg-muted px-1 rounded">FRAMEWORK:CRITERIA_ID</code> identifiers (e.g. <code className="text-xs bg-muted px-1 rounded">NIST_CSF:RS.MA</code>).
        </p>
        <div className="flex gap-3 flex-wrap text-xs">
          {[
            { key: "NIST_CSF", label: "NIST CSF 2.0", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
            { key: "ISO_27001", label: "ISO 27001 Annex A", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
            { key: "SOC2", label: "SOC 2 TSC", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
          ].map(({ key, label, color }) => (
            <span key={key} className={`px-2 py-1 rounded-full font-medium ${color}`}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
