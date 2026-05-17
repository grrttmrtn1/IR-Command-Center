"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">IR Command Center</h1>
            <p className="text-sm text-slate-500 mt-1">Enterprise Incident Response Platform</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus={!needsMFA}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="admin@ircc.local"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {needsMFA && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">MFA Code</label>
                <input
                  type="text"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  required
                  autoFocus
                  maxLength={8}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest text-center text-lg"
                  placeholder="000000"
                />
                <p className="text-xs text-slate-500 mt-1 text-center">Enter your authenticator app code or backup code</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <p className="text-xs text-center text-slate-500">
              SSO via SAML/OIDC available — configure in Admin settings
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
