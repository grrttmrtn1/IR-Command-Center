"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import api from "@/lib/api";
import { toast } from "sonner";
import { Shield } from "lucide-react";

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="rounded-2xl border border-border bg-card shadow-xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Set Your Password</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Create a permanent password to continue
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-5 p-3 bg-blue-50 rounded-lg border border-blue-100 text-blue-700">
            Your account was created with a temporary password. Please set a new one to continue.
          </p>
          <form onSubmit={submit} className="space-y-4">
            {[
              { key: "current" as const, label: "Temporary Password", type: "password" },
              { key: "next" as const, label: "New Password", type: "password" },
              { key: "confirm" as const, label: "Confirm New Password", type: "password" },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">{label}</label>
                <input
                  type={type}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  required
                  autoFocus={key === "current"}
                />
              </div>
            ))}
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={saving || !form.current || !form.next || !form.confirm}
              className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm shadow-primary/20"
            >
              {saving ? "Saving…" : "Set Password & Continue"}
            </button>
          </form>
        </div>
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
        <div className="flex flex-col items-center gap-4 text-muted-foreground animate-fade-in">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>Loading…</span>
          </div>
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
