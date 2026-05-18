"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import api from "@/lib/api";
import type { ReadinessScore, ReadinessDimension } from "@/lib/types";
import { ShieldCheck, AlertTriangle, XCircle, CheckCircle2, Circle, ArrowRight, RefreshCw } from "lucide-react";

const GRADE_STYLES: Record<string, { bg: string; text: string; ring: string; label: string }> = {
  A: { bg: "from-emerald-500 to-emerald-700", text: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-200 dark:ring-emerald-900", label: "Excellent" },
  B: { bg: "from-blue-500 to-blue-700",    text: "text-blue-600 dark:text-blue-400",    ring: "ring-blue-200 dark:ring-blue-900",    label: "Good" },
  C: { bg: "from-yellow-500 to-yellow-700", text: "text-yellow-600 dark:text-yellow-400", ring: "ring-yellow-200 dark:ring-yellow-900", label: "Fair" },
  D: { bg: "from-orange-500 to-orange-700", text: "text-orange-600 dark:text-orange-400", ring: "ring-orange-200 dark:ring-orange-900", label: "Poor" },
  F: { bg: "from-red-600 to-red-800",       text: "text-red-600 dark:text-red-400",       ring: "ring-red-200 dark:ring-red-900",       label: "Critical" },
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  GOOD:     <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  WARNING:  <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  CRITICAL: <XCircle className="h-4 w-4 text-red-500" />,
};

const DIM_LINKS: Record<string, string> = {
  "Response Playbooks":    "/playbooks",
  "Contact Directory":     "/contacts",
  "IR Plan":               "/ir-plan",
  "Exercises & Testing":   "/incidents",
  "Organization Knowledge":"/knowledge",
};

function ScoreBar({ score, status }: { score: number; status: string }) {
  const color =
    status === "GOOD" ? "bg-emerald-500" :
    status === "WARNING" ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
      <div className={`${color} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${score}%` }} />
    </div>
  );
}

function DimensionCard({ dim }: { dim: ReadinessDimension }) {
  const link = DIM_LINKS[dim.label];
  const gradeStyle =
    dim.status === "GOOD" ? "border-emerald-200 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-900/10" :
    dim.status === "WARNING" ? "border-yellow-200 dark:border-yellow-900 bg-yellow-50/30 dark:bg-yellow-900/10" :
    "border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-900/10";

  return (
    <div className={`rounded-xl border ${gradeStyle} p-5`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          {STATUS_ICON[dim.status]}
          <h3 className="font-semibold text-sm">{dim.label}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-2xl font-bold tabular-nums">{dim.score}</span>
          <span className="text-muted-foreground text-sm">/100</span>
        </div>
      </div>

      <ScoreBar score={dim.score} status={dim.status} />

      <p className="text-xs text-muted-foreground mt-2 mb-3">{dim.detail}</p>

      {/* Per-item breakdown */}
      <div className="space-y-1">
        {dim.items.map((item, i) => {
          // Playbook / contact coverage items
          if ("covered" in item) {
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                {item.covered
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  : <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                <span className={item.covered ? "text-foreground" : "text-muted-foreground"}>{item.label as string}</span>
              </div>
            );
          }
          // IR Plan section items
          if ("status" in item && (item.status === "current" || item.status === "needs_review" || item.status === "missing")) {
            const icon =
              item.status === "current" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> :
              item.status === "needs_review" ? <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" /> :
              <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                {icon}
                <span className={item.status === "current" ? "text-foreground" : "text-muted-foreground"}>
                  {item.label as string}
                  {item.status === "needs_review" && " — needs review"}
                </span>
              </div>
            );
          }
          // Exercise / generic items
          if ("count" in item || "date" in item) {
            return (
              <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{item.label as string}</span>
                <span className="font-medium tabular-nums">
                  {"count" in item ? item.count as number : (item.date ? new Date(item.date as string).toLocaleDateString() : "Never")}
                </span>
              </div>
            );
          }
          return null;
        })}
      </div>

      {link && (
        <Link
          href={link}
          className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Go to {dim.label} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

export default function ReadinessPage() {
  const { data, isLoading, refetch, isFetching } = useQuery<ReadinessScore>({
    queryKey: ["readiness-score"],
    queryFn: () => api.get<ReadinessScore>("/readiness/score").then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const grade = data?.grade ?? "—";
  const gs = GRADE_STYLES[grade] ?? GRADE_STYLES.F;
  const assessedAt = data?.assessed_at ? new Date(data.assessed_at).toLocaleString() : null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">IR Readiness Score</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            How prepared is your organization to respond to an incident right now?
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-24 text-muted-foreground">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-3" />
          <p className="text-sm">Calculating readiness score…</p>
        </div>
      ) : data ? (
        <>
          {/* Hero score card */}
          <div className={`rounded-2xl border ring-4 ${gs.ring} overflow-hidden mb-8`}>
            <div className={`bg-gradient-to-br ${gs.bg} px-8 py-10 flex items-center gap-8`}>
              <div className="shrink-0">
                <div className="w-24 h-24 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shadow-lg">
                  <span className="text-5xl font-black text-white">{grade}</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/80 text-sm font-medium uppercase tracking-widest mb-1">{gs.label}</p>
                <div className="flex items-end gap-2">
                  <span className="text-6xl font-black text-white tabular-nums">{data.total}</span>
                  <span className="text-white/60 text-2xl mb-1">/100</span>
                </div>
                <div className="mt-3 w-full bg-white/20 rounded-full h-2 overflow-hidden">
                  <div className="bg-white h-2 rounded-full transition-all" style={{ width: `${data.total}%` }} />
                </div>
              </div>
              <div className="shrink-0 hidden sm:block">
                <ShieldCheck className="h-16 w-16 text-white/30" />
              </div>
            </div>
            <div className="px-8 py-4 bg-card border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>Assessed across 5 dimensions · Weighted aggregate</span>
              {assessedAt && <span>Last assessed: {assessedAt}</span>}
            </div>
          </div>

          {/* Dimension summary bar */}
          <div className="grid grid-cols-5 gap-3 mb-8">
            {data.dimensions.map((dim) => (
              <div key={dim.label} className="text-center">
                <div className="text-xl font-bold tabular-nums">{dim.score}</div>
                <ScoreBar score={dim.score} status={dim.status} />
                <div className="text-[10px] text-muted-foreground mt-1 leading-tight">{dim.label}</div>
              </div>
            ))}
          </div>

          {/* Dimension detail cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {data.dimensions.map((dim) => (
              <DimensionCard key={dim.label} dim={dim} />
            ))}
          </div>

          {/* Guidance */}
          {data.total < 75 && (
            <div className="mt-6 rounded-xl border border-yellow-200 dark:border-yellow-900 bg-yellow-50/50 dark:bg-yellow-900/10 p-5">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" /> Quick Wins to Improve Your Score
              </h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {data.dimensions.filter((d) => d.status !== "GOOD").map((d) => (
                  <li key={d.label} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-yellow-500 shrink-0" />
                    <span>
                      <strong>{d.label}:</strong>{" "}
                      {d.label === "Response Playbooks" && "Activate or create playbooks for all major threat types."}
                      {d.label === "Contact Directory" && "Add legal counsel, cyber insurer, and forensics retainer contacts."}
                      {d.label === "IR Plan" && "Complete and mark all IR Plan sections as reviewed."}
                      {d.label === "Exercises & Testing" && "Schedule a tabletop exercise — aim for at least two per year."}
                      {d.label === "Organization Knowledge" && "Fill in org profile, critical systems, and regulatory obligations."}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
