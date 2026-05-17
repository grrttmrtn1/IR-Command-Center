"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, hasRole } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  Shield, AlertTriangle, CheckSquare, FileText, MessageSquare,
  Brain, BookOpen, Settings, Users, Key, ClipboardList,
  Activity, Database, BarChart3, LogOut, ListTodo, Building2,
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

/* Deterministic avatar color from a character */
const AVATAR_COLORS = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
  "#ef4444", "#06b6d4", "#ec4899", "#6366f1",
];
function avatarColor(char: string) {
  return AVATAR_COLORS[char.charCodeAt(0) % AVATAR_COLORS.length];
}

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
          "relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 overflow-hidden",
          active
            ? "bg-white/[0.07] text-sidebar-foreground"
            : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-white/[0.05]"
        )}
      >
        {active && (
          <span
            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-sidebar-primary"
            aria-hidden="true"
          />
        )}
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-colors duration-150",
            active ? "text-sidebar-primary" : ""
          )}
        />
        {label}
      </Link>
    );
  }

  const initial = (user?.name?.[0] ?? user?.email?.[0] ?? "U").toUpperCase();
  const badgeColor = avatarColor(initial);

  return (
    <div className="w-64 flex flex-col h-screen sticky top-0 z-10" style={{ background: "hsl(var(--sidebar-background))" }}>
      {/* Logo */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 bg-gradient-to-br from-blue-500 to-blue-700 shadow-md shadow-blue-900/40">
            <Shield className="h-4 w-4 text-white drop-shadow-sm" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-sidebar-foreground tracking-tight leading-none">IR Command</p>
            <p className="text-[10px] text-sidebar-foreground/40 uppercase tracking-widest font-medium mt-0.5">Center</p>
          </div>
          <GlobalSearch />
          <NotificationBell userId={user?.id ?? ""} />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}

        {hasRole(user, "ADMIN") && (
          <div className="pt-4 mt-3 border-t border-sidebar-border">
            <p className="px-3 mb-1.5 text-[10px] font-semibold text-sidebar-foreground/30 uppercase tracking-widest">
              Administration
            </p>
            {adminItems.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </div>
        )}

        <div className="pt-4 mt-3 border-t border-sidebar-border">
          <Link
            href="/api-docs"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-white/[0.05] transition-all duration-150"
          >
            <Database className="h-4 w-4 shrink-0" />
            API Docs
          </Link>
        </div>
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-white text-sm font-semibold shrink-0 shadow-sm"
            style={{ backgroundColor: badgeColor }}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate leading-tight">
              {user?.name ?? user?.email}
            </p>
            <p className="text-[11px] text-sidebar-foreground/40 mt-0.5">{user?.role?.replace("_", " ")}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-white/[0.05] transition-all duration-150"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
