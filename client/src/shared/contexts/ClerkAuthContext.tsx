import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { ClerkUser } from "@/modules/clerk/types";

// ─── Mock clerk user ──────────────────────────────────────────────────────────

const MOCK_CLERK: ClerkUser = {
  id: 1,
  name: "Maria Santos",
  username: "clerk01",
  role: "inventory_clerk",
  avatar: "MS",
};

const SESSION_KEY = "clerk_auth";

// ─── Context shape ────────────────────────────────────────────────────────────

interface ClerkAuthContextValue {
  clerkUser: ClerkUser | null;
  isAuthenticated: boolean;
  login: (username: string) => void;
  logout: () => void;
}

const ClerkAuthContext = createContext<ClerkAuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ClerkAuthProvider({ children }: { children: React.ReactNode }) {
  const [clerkUser, setClerkUser] = useState<ClerkUser | null>(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      return stored ? (JSON.parse(stored) as ClerkUser) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback((_username: string) => {
    // In a real implementation, validate against the API.
    // For now, always return the mock clerk.
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(MOCK_CLERK));
    setClerkUser(MOCK_CLERK);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setClerkUser(null);
  }, []);

  return (
    <ClerkAuthContext.Provider
      value={{ clerkUser, isAuthenticated: clerkUser !== null, login, logout }}
    >
      {children}
    </ClerkAuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useClerkAuth(): ClerkAuthContextValue {
  const ctx = useContext(ClerkAuthContext);
  if (!ctx) throw new Error("useClerkAuth must be used inside <ClerkAuthProvider>");
  return ctx;
}
