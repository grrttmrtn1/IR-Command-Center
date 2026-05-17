"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, SEVERITY_COLORS, STATUS_COLORS } from "@/lib/utils";
import type { Incident, Assessment } from "@/lib/types";
import { AlertTriangle, Shield, CheckSquare, BarChart3, ArrowRight, Clock } from "lucide-react";

export default function HomePage() {
  const { user } = useAuth();

  const { data: incidents } = useQuery({
    queryKey: ["incidents"],
    queryFn: () => api.get<Incident[]>("/incidents").then((r) => r.data),
  });

  const { data: assessments } = useQuery({
    queryKey: ["assessments"],
    queryFn: () => api.get<Assessment[]>("/scorecard").then((r) => r.data),
  });

  const openIncidents = incidents?.filter((i) => i.status !== "CLOSED") ?? [];
  const criticalCount = openIncidents.filter((i) => i.severity === "CRITICAL").length;
  const latestAssessment = assessments?.[0];

  const maturityLabels = ["", "Initial", "Developing", "Defined", "Managed", "Optimizing"];
  const maturityColors = ["", "bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-blue-500", "bg-green-500"];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},{" "}
          {user?.name?.split(" ")[0] ?? user?.email.split("@")[0]}
        </h1>
        <p className="text-muted-foreground mt-1">IR Command Center — {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Open Incidents"
          value={openIncidents.length}
          icon={<AlertTriangle className="h-5 w-5" />}
          color={openIncidents.length > 0 ? "text-red-500" : "text-green-500"}
          href="/incidents"
        />
        <StatCard
          label="Critical Incidents"
          value={criticalCount}
          icon={<Shield className="h-5 w-5" />}
          color={criticalCount > 0 ? "text-red-600" : "text-green-500"}
          href="/incidents"
        />
        <StatCard
          label="IR Maturity"
          value={latestAssessment ? `${maturityLabels[latestAssessment.maturity_level ?? 0]} (${latestAssessment.maturity_level ?? 0}/5)` : "Not assessed"}
          icon={<BarChart3 className="h-5 w-5" />}
          color="text-blue-500"
          href="/scorecard"
        />
        <StatCard
          label="Total Documents"
          value="—"
          icon={<CheckSquare className="h-5 w-5" />}
          color="text-purple-500"
          href="/documents"
        />
      </div>

      {/* Active Incidents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Active Incidents</h2>
            <Link href="/incidents/new" className="text-sm text-primary hover:underline">
              + New Incident
            </Link>
          </div>

          {openIncidents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <Shield className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <p className="font-medium text-foreground">No active incidents</p>
              <p className="text-sm text-muted-foreground mt-1">All clear — your organization has no open incidents.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {openIncidents.slice(0, 8).map((incident) => (
                <Link key={incident.id} href={`/incidents/${incident.id}`}>
                  <div className="rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-colors cursor-pointer">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${SEVERITY_COLORS[incident.severity]}`}>
                            {incident.severity}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[incident.status]}`}>
                            {incident.status}
                          </span>
                          <span className="text-xs text-muted-foreground">{incident.incident_type.replace("_", " ")}</span>
                        </div>
                        <p className="font-medium text-foreground truncate">{incident.title}</p>
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDate(incident.started_at)}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <QuickAction href="/incidents/new" label="Declare New Incident" description="Start a new incident response" color="bg-red-50 hover:bg-red-100 dark:bg-red-950/30 border-red-200 dark:border-red-900" icon="🚨" />
            <QuickAction href="/communications" label="Draft Notification" description="Crisis comms for any jurisdiction" color="bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900" icon="📨" />
            <QuickAction href="/ransomware" label="Ransomware Decision Tool" description="Structured response framework" color="bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900" icon="⚡" />
            <QuickAction href="/scorecard" label="Run IR Assessment" description="Evaluate your readiness maturity" color="bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900" icon="📊" />
            <QuickAction href="/documents/templates" label="Browse Templates" description="Playbooks, procedures, notifications" color="bg-green-50 hover:bg-green-100 dark:bg-green-950/30 border-green-200 dark:border-green-900" icon="📋" />
          </div>

          {latestAssessment && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Latest Assessment</h3>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{latestAssessment.title}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white ${maturityColors[latestAssessment.maturity_level ?? 0]}`}>
                    Level {latestAssessment.maturity_level}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${maturityColors[latestAssessment.maturity_level ?? 0]}`}
                    style={{ width: `${(latestAssessment.overall_score ?? 0)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{latestAssessment.overall_score?.toFixed(0)}% — {maturityLabels[latestAssessment.maturity_level ?? 0]}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color, href }: { label: string; value: string | number; icon: React.ReactNode; color: string; href: string }) {
  return (
    <Link href={href}>
      <div className="rounded-xl border border-border bg-card p-5 hover:border-primary/50 transition-colors cursor-pointer">
        <div className={`${color} mb-3`}>{icon}</div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground mt-1">{label}</p>
      </div>
    </Link>
  );
}

function QuickAction({ href, label, description, color, icon }: { href: string; label: string; description: string; color: string; icon: string }) {
  return (
    <Link href={href}>
      <div className={`rounded-xl border p-3 flex items-center gap-3 transition-colors cursor-pointer ${color}`}>
        <span className="text-xl">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        </div>
      </div>
    </Link>
  );
}
