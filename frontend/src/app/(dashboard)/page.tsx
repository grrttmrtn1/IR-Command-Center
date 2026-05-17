"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/utils";
import type { MetricsSummary, ActivityItem, TrendPoint } from "@/lib/types";
import {
  AlertTriangle, Shield, Clock, TrendingUp, ArrowRight, Activity,
  CheckSquare, Building2, Brain, FileText, MessageSquare,
} from "lucide-react";

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

  const { data: summary } = useQuery<MetricsSummary>({
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

  const greeting = new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Good {greeting}, {user?.name?.split(" ")[0] ?? user?.email.split("@")[0]}
        </h1>
        <p className="text-muted-foreground mt-1">
          {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          {" · "}Production incidents only
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Open Incidents" value={summary?.open_count ?? "—"} icon={<AlertTriangle className="h-5 w-5" />} color={summary?.open_count ? "text-red-500" : "text-green-500"} href="/incidents" />
        <StatCard label="Critical" value={summary?.critical_count ?? "—"} icon={<Shield className="h-5 w-5" />} color={summary?.critical_count ? "text-red-600" : "text-green-500"} href="/incidents" />
        <StatCard label="MTTD" value={mttdStr} icon={<Clock className="h-5 w-5" />} color="text-blue-500" href="/incidents" subtitle="detection" />
        <StatCard label="MTTR" value={mttrStr} icon={<TrendingUp className="h-5 w-5" />} color="text-purple-500" href="/incidents" subtitle="resolution" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Incidents by severity */}
        <div className="lg:col-span-1 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Open Incidents by Severity</h2>
          {severityData.some((d) => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={severityData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [v, "incidents"]} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {severityData.map((entry) => (
                    <Cell key={entry.name} fill={SEV_COLORS[entry.name] ?? "#6b7280"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <Shield className="h-8 w-8 text-green-500 mb-2" />
              <p className="text-sm text-muted-foreground">No open incidents</p>
            </div>
          )}
        </div>

        {/* MTTD/MTTR trends */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Incident Volume — Last 8 Weeks</h2>
          {trends?.points && trends.points.some((p) => p.opened > 0 || p.closed > 0) ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trends.points} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task backlog by owner */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Task Backlog by Owner</h2>
            <span className="text-xs text-muted-foreground">{summary?.total_tasks_open ?? 0} open</span>
          </div>
          {ownerData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={ownerData} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={(v) => [v, "tasks"]} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <CheckSquare className="h-8 w-8 text-green-500 mb-2" />
              <p className="text-sm text-muted-foreground">No open tasks</p>
            </div>
          )}
        </div>

        {/* Recent activity feed */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>
            ) : (
              activity.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-base mt-0.5">{ACTIVITY_ICONS[item.type] ?? "•"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{item.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.actor && <span>{item.actor} · </span>}
                      {timeAgo(item.occurred_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <QuickAction href="/incidents/new" label="Declare Incident" icon={<AlertTriangle className="h-4 w-4" />} color="bg-red-50 hover:bg-red-100 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400" />
          <QuickAction href="/communications" label="Draft Notification" icon={<MessageSquare className="h-4 w-4" />} color="bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-400" />
          <QuickAction href="/ransomware" label="Ransomware Tool" icon={<Brain className="h-4 w-4" />} color="bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900 text-orange-700 dark:text-orange-400" />
          <QuickAction href="/scorecard" label="IR Assessment" icon={<TrendingUp className="h-4 w-4" />} color="bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900 text-purple-700 dark:text-purple-400" />
          <QuickAction href="/vendors" label="Vendor Registry" icon={<Building2 className="h-4 w-4" />} color="bg-green-50 hover:bg-green-100 dark:bg-green-950/30 border-green-200 dark:border-green-900 text-green-700 dark:text-green-400" />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label, value, icon, color, href, subtitle,
}: {
  label: string; value: string | number; icon: React.ReactNode; color: string; href: string; subtitle?: string;
}) {
  return (
    <Link href={href}>
      <div className="rounded-xl border border-border bg-card p-5 hover:border-primary/50 transition-colors cursor-pointer">
        <div className={`${color} mb-3`}>{icon}</div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground mt-1">{label}{subtitle && <span className="text-xs ml-1 opacity-70">({subtitle})</span>}</p>
      </div>
    </Link>
  );
}

function QuickAction({ href, label, icon, color }: { href: string; label: string; icon: React.ReactNode; color: string }) {
  return (
    <Link href={href}>
      <div className={`rounded-xl border p-3 flex items-center gap-2 transition-colors cursor-pointer ${color}`}>
        {icon}
        <p className="text-sm font-medium truncate">{label}</p>
        <ArrowRight className="h-3.5 w-3.5 ml-auto shrink-0 opacity-60" />
      </div>
    </Link>
  );
}
