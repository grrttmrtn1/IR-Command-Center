"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, hasRole } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  Shield, AlertTriangle, CheckSquare, FileText, MessageSquare,
  Brain, BookOpen, Settings, Users, Key, ClipboardList,
  Activity, Database, BarChart3, LogOut, ChevronRight, ListTodo, Building2,
  ShieldCheck, Mail,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { GlobalSearch } from "@/components/GlobalSearch";

const navItems = [
  { href: "/", label: "Overview", icon: Activity, minRole: "OBSERVER" },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle, minRole: "OBSERVER" },
  { href: "/tasks", label: "Task Board", icon: CheckSquare, minRole: "OBSERVER" },
  { href: "/scorecard", label: "IR Readiness", icon: BarChart3, minRole: "OBSERVER" },
  { href: "/documents", label: "Documents", icon: FileText, minRole: "OBSERVER" },
  { href: "/communications", label: "Crisis Comms", icon: MessageSquare, minRole: "ANALYST" },
  { href: "/ransomware", label: "Ransomware Decision", icon: Brain, minRole: "ANALYST" },
  { href: "/vendors", label: "Vendor Registry", icon: Building2, minRole: "OBSERVER" },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpen, minRole: "OBSERVER" },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck, minRole: "OBSERVER" },
];

const adminItems = [
  { href: "/admin/users", label: "Users", icon: Users, minRole: "ADMIN" },
  { href: "/admin/api-keys", label: "API Keys", icon: Key, minRole: "ADMIN" },
  { href: "/admin/sso", label: "SSO Config", icon: Shield, minRole: "ADMIN" },
  { href: "/admin/task-templates", label: "Task Templates", icon: ListTodo, minRole: "ADMIN" },
  { href: "/ai-config", label: "AI Config", icon: Settings, minRole: "ADMIN" },
  { href: "/audit", label: "Audit Log", icon: ClipboardList, minRole: "ADMIN" },
  { href: "/admin/reports", label: "Exec Reports", icon: Mail, minRole: "ADMIN" },
  { href: "/admin/backup", label: "Backup", icon: Database, minRole: "SUPER_ADMIN" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  function NavLink({ href, label, icon: Icon, minRole }: { href: string; label: string; icon: React.ElementType; minRole: string }) {
    if (!hasRole(user, minRole)) return null;
    const active = pathname === href || (href !== "/" && pathname.startsWith(href));
    return (
      <Link
        href={href}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
        {active && <ChevronRight className="h-3 w-3 ml-auto" />}
      </Link>
    );
  }

  return (
    <div className="w-64 bg-sidebar flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 shrink-0">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-sidebar-foreground">IR Command</p>
            <p className="text-xs text-sidebar-foreground/50">Center</p>
          </div>
          <GlobalSearch />
          <NotificationBell userId={user?.id ?? ""} />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}

        {hasRole(user, "ADMIN") && (
          <div className="pt-4 mt-4 border-t border-sidebar-border">
            <p className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
              Administration
            </p>
            {adminItems.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </div>
        )}

        <div className="pt-4 mt-4 border-t border-sidebar-border">
          <Link
            href="/api-docs"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <Database className="h-4 w-4 shrink-0" />
            API Docs
          </Link>
        </div>
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-foreground text-sm font-semibold">
            {user?.name?.[0] ?? user?.email[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.name ?? user?.email}</p>
            <p className="text-xs text-sidebar-foreground/50">{user?.role?.replace("_", " ")}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
