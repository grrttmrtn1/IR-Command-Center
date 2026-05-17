"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import api from "@/lib/api";
import { toast } from "sonner";

function ChangePasswordGate({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.next !== form.confirm) { setError("Passwords do not match"); return; }
    if (form.next.length < 8) { setError("New password must be at least 8 characters"); return; }
    setSaving(true);
    try {
      await api.post("/auth/me/change-password", { current_password: form.current, new_password: form.next });
      toast.success("Password updated — welcome!");
      onDone();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e.response?.data?.detail ?? "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl p-8">
        <h2 className="text-xl font-bold mb-1">Set Your Password</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Your account was created with a temporary password. Please set a new password to continue.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Temporary Password</label>
            <input
              type="password"
              value={form.current}
              onChange={(e) => setForm({ ...form, current: e.target.value })}
              className="w-full mt-1.5 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New Password</label>
            <input
              type="password"
              value={form.next}
              onChange={(e) => setForm({ ...form, next: e.target.value })}
              className="w-full mt-1.5 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Confirm New Password</label>
            <input
              type="password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              className="w-full mt-1.5 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={saving || !form.current || !form.next || !form.confirm}
            className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Set Password & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, refetch } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (user.must_change_password) {
    return <ChangePasswordGate onDone={refetch} />;
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
