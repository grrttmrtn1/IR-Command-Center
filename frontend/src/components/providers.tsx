"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import { AuthContext } from "@/lib/auth";
import type { User } from "@/lib/types";
import api from "@/lib/api";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } }
  }));
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const { data } = await api.get<User>("/auth/me");
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const login = async (email: string, password: string, mfaCode?: string) => {
    await api.post("/auth/login", { email, password, mfa_code: mfaCode });
    await fetchUser();
  };

  const logout = async () => {
    await api.post("/auth/logout");
    setUser(null);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ user, loading, login, logout, refetch: fetchUser }}>
        {children}
        <Toaster position="top-right" richColors />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
