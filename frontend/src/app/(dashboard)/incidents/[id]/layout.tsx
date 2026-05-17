"use client";

import { useParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import api from "@/lib/api";
import type { Incident } from "@/lib/types";
import { Shield, AlertTriangle } from "lucide-react";

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "text-red-500",
  HIGH: "text-orange-400",
  MEDIUM: "text-yellow-400",
  LOW: "text-blue-400",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  CONTAINED: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  ERADICATED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  RECOVERING: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  CLOSED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

export default function IncidentLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();

  const { data: incident } = useQuery({
    queryKey: ["incident", id],
    queryFn: () => api.get<Incident>(`/incidents/${id}`).then((r) => r.data),
  });

  const tabs = [
    { href: `/incidents/${id}`, label: "War Room", exact: true },
    { href: `/incidents/${id}/iocs`, label: "IOCs" },
    { href: `/incidents/${id}/assets`, label: "Assets" },
    { href: `/incidents/${id}/tasks`, label: "Tasks" },
    { href: `/incidents/${id}/evidence`, label: "Evidence" },
    { href: `/incidents/${id}/comms`, label: "Comms" },
    { href: `/incidents/${id}/timeline`, label: "Timeline" },
  ];

  return (
    <div className="flex flex-col min-h-0">
      {/* Incident header */}
      <div className="px-6 pt-6 pb-0 border-b border-border bg-card">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-foreground truncate">{incident?.title ?? "Loading..."}</h1>
              {incident && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[incident.status] ?? STATUS_COLORS.OPEN}`}>
                  {incident.status}
                </span>
              )}
              {incident && (
                <span className={`text-xs font-bold ${SEVERITY_COLORS[incident.severity] ?? ""}`}>
                  {incident.severity}
                </span>
              )}
            </div>
            {incident && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {incident.incident_type} · Phase: {incident.phase} · Started {new Date(incident.started_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        {/* Tab navigation */}
        <nav className="flex gap-1">
          {tabs.map((tab) => {
            const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}
