"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { User } from "@/lib/types";
import { toast } from "sonner";
import { useAuth, hasRole } from "@/lib/auth";
import { Plus, Pencil, Trash2, Shield, UserCheck, UserX, ChevronDown, ChevronUp, Info } from "lucide-react";

const ROLES = ["OBSERVER", "ANALYST", "IR_LEAD", "ADMIN", "SUPER_ADMIN"];
const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  ADMIN: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  IR_LEAD: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  ANALYST: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  OBSERVER: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

const ROLE_DEFINITIONS = [
  {
    role: "OBSERVER",
    label: "Observer",
    color: ROLE_COLORS.OBSERVER,
    description: "Read-only access. Can view incidents, documents, and dashboards but cannot create or modify anything.",
    permissions: ["View all incidents", "View IOCs, assets, tasks, evidence", "View documents and assessments", "View audit logs (no)"],
  },
  {
    role: "ANALYST",
    label: "Analyst",
    color: ROLE_COLORS.ANALYST,
    description: "Standard incident responder. Can create and update most content within active incidents.",
    permissions: ["All Observer permissions", "Create and update incidents", "Add IOCs, assets, evidence, notes, tasks", "Create/edit comms drafts", "Complete scorecard assessments"],
  },
  {
    role: "IR_LEAD",
    label: "IR Lead",
    color: ROLE_COLORS.IR_LEAD,
    description: "Incident commander. Can close and delete incidents, approve comms, and generate AI executive briefs.",
    permissions: ["All Analyst permissions", "Close and delete incidents", "Approve crisis communications", "Generate AI executive briefings", "Access ransomware decision tool"],
  },
  {
    role: "ADMIN",
    label: "Admin",
    color: ROLE_COLORS.ADMIN,
    description: "Platform administrator. Manages users, API keys, SSO configuration, and AI provider settings.",
    permissions: ["All IR Lead permissions", "Create/edit/delete users", "Manage API keys and scopes", "Configure SSO providers", "View full audit log", "Manage AI provider configuration"],
  },
  {
    role: "SUPER_ADMIN",
    label: "Super Admin",
    color: ROLE_COLORS.SUPER_ADMIN,
    description: "Highest privilege level. Can modify other admins and cannot be deleted by regular admins.",
    permissions: ["All Admin permissions", "Modify other admin accounts", "Cannot be deleted or demoted by regular admins"],
  },
];

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "ANALYST" });
  const [showRoleDefs, setShowRoleDefs] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);

  const isAdmin = hasRole(currentUser, "ADMIN");

  const { data: users = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<User[]>("/admin/users").then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post("/admin/users", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setForm({ name: "", email: "", password: "", role: "ANALYST" });
      setShowCreate(false);
      toast.success("User created");
    },
    onError: (err: { response?: { data?: { detail?: string } } }) =>
      toast.error(err.response?.data?.detail ?? "Failed to create user"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<User> }) => api.patch(`/admin/users/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setEditUser(null);
      toast.success("User updated");
    },
    onError: (err: { response?: { data?: { detail?: string } } }) =>
      toast.error(err.response?.data?.detail ?? "Failed to update user"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.patch(`/admin/users/${id}`, { is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User status updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setConfirmDelete(null);
      toast.success("User deleted");
    },
    onError: (err: { response?: { data?: { detail?: string } } }) =>
      toast.error(err.response?.data?.detail ?? "Failed to delete user"),
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-muted-foreground mt-1">{users.length} users · Local authentication with optional SSO</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowRoleDefs(!showRoleDefs)}
            className="flex items-center gap-1.5 px-3 py-2 border border-border text-sm rounded-lg hover:bg-muted transition-colors"
          >
            <Info className="h-4 w-4" />
            Role Definitions
            {showRoleDefs ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New User
            </button>
          )}
        </div>
      </div>

      {/* Role definitions panel */}
      {showRoleDefs && (
        <div className="rounded-xl border border-border bg-card p-5 mb-6">
          <h3 className="font-semibold mb-4">RBAC Role Definitions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ROLE_DEFINITIONS.map((def) => (
              <div key={def.role} className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${def.color}`}>{def.label}</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{def.description}</p>
                <ul className="space-y-1">
                  {def.permissions.map((perm) => (
                    <li key={perm} className="text-xs text-foreground flex gap-1.5">
                      <span className="text-primary shrink-0">✓</span>
                      {perm}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && showCreate && (
        <div className="rounded-xl border border-border bg-card p-5 mb-6 space-y-3">
          <h3 className="font-semibold text-sm">Create User</h3>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name..." className="px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email..." type="email" className="px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
            <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Initial password (user will be prompted to change)..." type="password" className="px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="px-3 py-2 text-sm border border-border rounded-lg bg-background">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate(form)} disabled={!form.email || !form.password || !form.name || createMutation.isPending} className="flex-1 py-2 bg-primary text-primary-foreground text-sm rounded-lg disabled:opacity-50">Create User</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 border border-border text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">User</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Auth</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">MFA</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Last Login</th>
              {isAdmin && <th className="px-5 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-3">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </td>
                <td className="px-5 py-3">
                  {isAdmin && editUser?.id === user.id ? (
                    <select
                      value={editUser.role}
                      onChange={(e) => setEditUser({ ...editUser, role: e.target.value as User["role"] })}
                      className="px-2 py-1 text-xs border border-border rounded bg-background"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[user.role] ?? ROLE_COLORS.OBSERVER}`}>
                      {user.role}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">
                  {user.sso_provider
                    ? <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded">{user.sso_provider}</span>
                    : <span className="text-xs text-muted-foreground">Local</span>}
                </td>
                <td className="px-5 py-3">
                  {user.sso_provider ? (
                    <span title={user.mfa_enabled ? "MFA enabled" : "MFA not enabled"}>
                      <Shield className={`h-4 w-4 ${user.mfa_enabled ? "text-green-500" : "text-muted-foreground"}`} />
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground" title="MFA via TOTP is available for SSO accounts only">—</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                    {user.is_active ? "Active" : "Disabled"}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground">
                  {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : "Never"}
                </td>
                {isAdmin && (
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {editUser?.id === user.id ? (
                        <>
                          <button onClick={() => updateMutation.mutate({ id: user.id, data: { role: editUser.role } })} className="px-2.5 py-1 bg-primary text-primary-foreground text-xs rounded">Save</button>
                          <button onClick={() => setEditUser(null)} className="px-2.5 py-1 border border-border text-xs rounded">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setEditUser(user)} className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors" title="Edit role">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => toggleActiveMutation.mutate({ id: user.id, is_active: !user.is_active })}
                            className="p-1.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                            title={user.is_active ? "Disable user" : "Enable user"}
                          >
                            {user.is_active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                          </button>
                          {user.id !== currentUser?.id && user.role !== "SUPER_ADMIN" && (
                            <button
                              onClick={() => setConfirmDelete(user)}
                              className="p-1.5 text-muted-foreground hover:text-red-500 rounded transition-colors"
                              title="Delete user"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-xl border border-border p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="font-semibold text-lg mb-2 text-red-600">Delete User</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Permanently delete <span className="font-medium text-foreground">{confirmDelete.name} ({confirmDelete.email})</span>? This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 border border-border text-sm rounded-lg">Cancel</button>
              <button
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
