"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/utils";
import type { MetricsSummary, ActivityItem, TrendPoint, ReadinessScore } from "@/lib/types";
import {
  AlertTriangle, Shield, Clock, TrendingUp, ArrowRight, Activity,
  CheckSquare, Building2, Brain, MessageSquare, ShieldCheck,
} from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";

const SEV_COLORS: Record<string, string> = {
  CRITICAL: "#dc2626",
  HIGH: "#f97316",
  MEDIUM: "#eab308",
  LOW: "#3b82f6",
};

const ACTIVITY_ICONS: Record<string, string> = {
  timeline: "📍",
  audit: "📋",
};

export default function HomePage() {
  const { user } = useAuth();

  const { data: summary, isLoading: summaryLoading } = useQuery<MetricsSummary>({
    queryKey: ["metrics-summary"],
    queryFn: () => api.get<MetricsSummary>("/metrics/summary").then((r) => r.data),
    staleTime: 60_000,
  });

  const { data: activity = [] } = useQuery<ActivityItem[]>({
    queryKey: ["metrics-activity"],
    queryFn: () => api.get<ActivityItem[]>("/metrics/activity").then((r) => r.data),
    staleTime: 30_000,
  });

  const { data: trends } = useQuery<{ points: TrendPoint[] }>({
    queryKey: ["metrics-trends"],
    queryFn: () => api.get<{ points: TrendPoint[] }>("/metrics/trends").then((r) => r.data),
    staleTime: 120_000,
  });

  const mttdStr = summary?.mttd_hours != null
    ? summary.mttd_hours >= 24
      ? `${(summary.mttd_hours / 24).toFixed(1)}d`
      : `${summary.mttd_hours}h`
    : "—";

  const mttrStr = summary?.mttr_hours != null
    ? summary.mttr_hours >= 24
      ? `${(summary.mttr_hours / 24).toFixed(1)}d`
      : `${summary.mttr_hours}h`
    : "—";

  const severityData = summary
    ? Object.entries(summary.incidents_by_severity).map(([name, value]) => ({ name, value }))
    : [];

  const ownerData = (summary?.task_backlog_by_owner ?? []).map((o) => ({
    name: o.name.split(" ")[0],
    value: o.count,
  }));

  const { data: readiness } = useQuery<ReadinessScore>({
    queryKey: ["readiness-score"],
    queryFn: () => api.get<ReadinessScore>("/readiness/score").then((r) => r.data),
    staleTime: 10 * 60 * 1000,
  });

  const greeting = new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-7 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Good {greeting}, {user?.name?.split(" ")[0] ?? user?.email.split("@")[0]}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          <span className="mx-1.5 text-border">·</span>Production incidents only
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryLoading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border border-t-2 border-t-muted bg-card p-5 shadow-sm">
              <Skeleton className="h-5 w-5 mb-3" />
              <Skeleton className="h-7 w-16 mb-2" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))
        ) : (
          <>
            <StatCard
              label="Open Incidents"
              value={summary?.open_count ?? "—"}
              icon={<AlertTriangle className="h-5 w-5" />}
              iconColor={summary?.open_count ? "text-red-500" : "text-green-500"}
              accentColor="border-t-red-500"
              href="/incidents"
            />
            <StatCard
              label="Critical"
              value={summary?.critical_count ?? "—"}
              icon={<Shield className="h-5 w-5" />}
              iconColor={summary?.critical_count ? "text-red-600" : "text-green-500"}
              accentColor="border-t-red-600"
              href="/incidents"
            />
            <StatCard
              label="MTTD"
              value={mttdStr}
              icon={<Clock className="h-5 w-5" />}
              iconColor="text-blue-500"
              accentColor="border-t-blue-500"
              href="/incidents"
              subtitle="detection"
            />
            <StatCard
              label="MTTR"
              value={mttrStr}
              icon={<TrendingUp className="h-5 w-5" />}
              iconColor="text-purple-500"
              accentColor="border-t-purple-500"
              href="/incidents"
              subtitle="resolution"
            />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Incidents by severity */}
        <div className="lg:col-span-1 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">Open by Severity</h2>
          {severityData.some((d) => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={severityData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v) => [v, "incidents"]}
                  contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {severityData.map((entry) => (
                    <Cell key={entry.name} fill={SEV_COLORS[entry.name] ?? "#6b7280"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center mb-3">
                <Shield className="h-6 w-6 text-green-500" />
              </div>
              <p className="text-sm font-medium text-foreground">All clear</p>
              <p className="text-xs text-muted-foreground mt-0.5">No open incidents</p>
            </div>
          )}
        </div>

        {/* Incident volume trends */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Incident Volume — Last 8 Weeks</h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500 inline-block" />Opened</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500 inline-block" />Closed</span>
            </div>
          </div>
          {trends?.points && trends.points.some((p) => p.opened > 0 || p.closed > 0) ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trends.points} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                />
                <Line type="monotone" dataKey="opened" stroke="#ef4444" strokeWidth={2} dot={false} name="Opened" />
                <Line type="monotone" dataKey="closed" stroke="#22c55e" strokeWidth={2} dot={false} name="Closed" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm text-muted-foreground">Not enough data yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Task backlog + Activity feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Task backlog by owner */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Task Backlog by Owner</h2>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {summary?.total_tasks_open ?? 0} open
            </span>
          </div>
          {ownerData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={ownerData} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v) => [v, "tasks"]}
                  contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center mb-3">
                <CheckSquare className="h-6 w-6 text-green-500" />
              </div>
              <p className="text-sm font-medium text-foreground">All tasks done</p>
              <p className="text-xs text-muted-foreground mt-0.5">No open tasks</p>
            </div>
          )}
        </div>

        {/* Recent activity feed */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="space-y-0 max-h-52 overflow-y-auto pr-1 divide-y divide-border">
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>
            ) : (
              activity.map((item, i) => (
                <div key={i} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="text-base mt-0.5 shrink-0">{ACTIVITY_ICONS[item.type] ?? "•"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{item.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.actor && <span className="font-medium">{item.actor} · </span>}
                      {timeAgo(item.occurred_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* IR Readiness widget */}
      {readiness && (
        <Link href="/readiness" className="block group">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-all duration-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">IR Readiness Score</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-black tabular-nums ${readiness.total >= 75 ? "text-emerald-600 dark:text-emerald-400" : readiness.total >= 50 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}>
                  {readiness.total}
                </span>
                <span className={`text-lg font-black px-2 py-0.5 rounded-lg ${readiness.grade === "A" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : readiness.grade === "B" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : readiness.grade === "C" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                  {readiness.grade}
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {readiness.dimensions.map((dim) => (
                <div key={dim.label} className="text-center">
                  <div className="text-xs font-semibold tabular-nums">{dim.score}</div>
                  <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-1 rounded-full ${dim.status === "GOOD" ? "bg-emerald-500" : dim.status === "WARNING" ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${dim.score}%` }}
                    />
                  </div>
                  <div className="text-[9px] text-muted-foreground mt-1 leading-tight truncate">{dim.label.split(" ")[0]}</div>
                </div>
              ))}
            </div>
          </div>
        </Link>
      )}

      {/* Onboarding checklist */}
      <OnboardingChecklist />

      {/* Quick Actions */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <QuickAction href="/incidents/new" label="Declare Incident" icon={<AlertTriangle className="h-4 w-4" />} color="bg-red-50 hover:bg-red-100 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-400" />
          <QuickAction href="/playbooks" label="Run a Playbook" icon={<ShieldCheck className="h-4 w-4" />} color="bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-400" />
          <QuickAction href="/ransomware" label="Ransomware Tool" icon={<Brain className="h-4 w-4" />} color="bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700 dark:bg-orange-950/30 dark:border-orange-900 dark:text-orange-400" />
          <QuickAction href="/contacts" label="Contact Directory" icon={<CheckSquare className="h-4 w-4" />} color="bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700 dark:bg-purple-950/30 dark:border-purple-900 dark:text-purple-400" />
          <QuickAction href="/vendors" label="Vendor Registry" icon={<Building2 className="h-4 w-4" />} color="bg-green-50 hover:bg-green-100 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-900 dark:text-green-400" />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label, value, icon, iconColor, accentColor, href, subtitle,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconColor: string;
  accentColor: string;
  href: string;
  subtitle?: string;
}) {
  return (
    <Link href={href} className="group block">
      <div className={`rounded-xl border border-border border-t-2 ${accentColor} bg-card p-5 shadow-sm hover:shadow-md transition-all duration-200 group-hover:border-b-border/70`}>
        <div className={`${iconColor} mb-3 transition-transform duration-200 group-hover:scale-110 w-fit`}>
          {icon}
        </div>
        <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {label}
          {subtitle && <span className="text-xs ml-1.5 opacity-60">({subtitle})</span>}
        </p>
      </div>
    </Link>
  );
}

function QuickAction({ href, label, icon, color }: { href: string; label: string; icon: React.ReactNode; color: string }) {
  return (
    <Link href={href} className="group block">
      <div className={`rounded-xl border p-3.5 flex items-center gap-2.5 transition-all duration-150 ${color}`}>
        <span className="shrink-0">{icon}</span>
        <p className="text-sm font-medium flex-1 truncate">{label}</p>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-50 transition-transform duration-150 group-hover:translate-x-1" />
      </div>
    </Link>
  );
}
