"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Shield } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [needsMFA, setNeedsMFA] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password, needsMFA ? mfaCode : undefined);
      router.push("/");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      if (error.response?.data?.detail === "MFA_REQUIRED") {
        setNeedsMFA(true);
        toast.info("Enter your MFA code to continue.");
      } else {
        const detail = error.response?.data?.detail;
        const message = Array.isArray(detail)
          ? detail.map((e: { msg?: string }) => e.msg ?? String(e)).join("; ")
          : typeof detail === "string"
          ? detail
          : "Login failed";
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-slate-950">
      {/* Background gradient layers */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950" />

      {/* Ambient glow orbs */}
      <div className="absolute top-1/4 -left-16 w-96 h-96 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-16 w-96 h-96 rounded-full bg-indigo-600/8 blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-blue-900/10 blur-3xl pointer-events-none" />

      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.07) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md px-4 animate-slide-up">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40 p-8">
          {/* Brand mark */}
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-900/40 mb-4">
              <Shield className="w-8 h-8 text-white drop-shadow-sm" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">IR Command Center</h1>
            <p className="text-sm text-slate-400 mt-1">Enterprise Incident Response Platform</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus={!needsMFA}
                className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500/50 transition-all"
                placeholder="admin@ircc.local"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500/50 transition-all"
              />
            </div>

            {needsMFA && (
              <div className="animate-slide-up">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  MFA Code
                </label>
                <input
                  type="text"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  required
                  autoFocus
                  maxLength={8}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.06] border border-white/[0.1] text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500/50 transition-all font-mono tracking-[0.3em] text-center text-lg"
                  placeholder="000000"
                />
                <p className="text-xs text-slate-500 mt-1.5 text-center">
                  Enter your authenticator app code or backup code
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-all duration-150 shadow-lg shadow-blue-900/30 mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Signing in…
                </span>
              ) : "Sign In"}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/[0.07]">
            <p className="text-xs text-center text-slate-500">
              SSO via SAML / OIDC available — configure in Admin settings
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
