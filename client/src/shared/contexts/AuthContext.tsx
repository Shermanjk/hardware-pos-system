import { loginRequest, logoutRequest } from "@/shared/api/authApi";
import httpClient from "@/shared/api/httpClient";
import { realtimeHub } from "@/shared/hooks/useRealtimeSync";
import {
    clearToken,
    decodeTokenExpiry,
    getRedirectPath,
    getUserFromToken,
    loadToken,
    saveToken,
    type AuthUser,
} from "@/shared/utils/auth";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ─── Context shape ────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string, rememberMe: boolean) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Timing constants ─────────────────────────────────────────────────────────
// Silently renew the token when this much time remains before expiry.
// 10 min gives plenty of headroom before the 401 interceptor would fire.
const RENEWAL_BEFORE_EXPIRY_MS = 10 * 60 * 1000; // 10 min

// Show a warning toast this many ms before expiry (only if renewal fails).
const EXPIRY_WARN_MS = 5 * 60 * 1000; // 5 min

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [token, setToken]   = useState<string | null>(null);
  const [user,  setUser]    = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Timer refs — all three are cleared on logout and unmount
  const expiryTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renewalTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAllTimers = useCallback(() => {
    if (expiryTimerRef.current)  { clearTimeout(expiryTimerRef.current);  expiryTimerRef.current  = null; }
    if (renewalTimerRef.current) { clearTimeout(renewalTimerRef.current); renewalTimerRef.current = null; }
    if (retryTimerRef.current)   { clearTimeout(retryTimerRef.current);   retryTimerRef.current   = null; }
  }, []);

  // ── Expiry warning (fallback if renewal fails) ────────────────────────────
  const scheduleExpiryWarning = useCallback((tkn: string) => {
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);

    const exp = decodeTokenExpiry(tkn);
    if (!exp) return;

    const msUntilWarn = exp - Date.now() - EXPIRY_WARN_MS;
    if (msUntilWarn <= 0) return;

    expiryTimerRef.current = setTimeout(() => {
      toast.warning("Your session is expiring in 5 minutes", {
        description: "Please save your work and log in again to continue.",
        duration: 0, // persistent — must be dismissed manually
        id: "session-expiry-warning",
      });
    }, msUntilWarn);
  }, []);

  // ── Forward declaration so doRenew can call scheduleRenewal ──────────────
  // Using a ref avoids a dependency cycle between the two useCallbacks.
  const scheduleRenewalRef = useRef<(tkn: string) => void>(() => {});

  // ── Silent token renewal ──────────────────────────────────────────────────
  // Called ~10 min before expiry. On success the new token is stored, timers
  // are rescheduled, and the user never notices. On failure we fall back to the
  // 5-min warning toast.
  const doRenew = useCallback(async (isRetry: boolean) => {
    try {
      const res = await httpClient.post<{ token: string }>("/api/auth/refresh");
      const newToken = res.data.token;

      saveToken(newToken);
      setToken(newToken);

      // Parse the new user from the refreshed token
      const decoded = getUserFromToken(newToken);
      if (decoded) setUser(decoded);

      // Dismiss the expiry warning if it was already shown
      toast.dismiss("session-expiry-warning");

      // Reschedule both timers for the new token lifetime
      scheduleExpiryWarning(newToken);
      scheduleRenewalRef.current(newToken);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        // Token expired or invalid — force logout immediately
        clearAllTimers();
        clearToken();
        setToken(null);
        setUser(null);
        setLocation("/login");
      } else if (!isRetry) {
        // Network error or server down — retry once after 30 s
        retryTimerRef.current = setTimeout(() => doRenew(true), 30_000);
        // Also schedule the expiry warning so the user gets a heads-up
        const stored = loadToken();
        if (stored) scheduleExpiryWarning(stored);
      }
      // Second failure: give up and rely on the expiry warning + 401 interceptor
    }
  }, [clearAllTimers, scheduleExpiryWarning, setLocation]);

  // ── Schedule renewal ──────────────────────────────────────────────────────
  const scheduleRenewal = useCallback((tkn: string) => {
    if (renewalTimerRef.current) clearTimeout(renewalTimerRef.current);

    const exp = decodeTokenExpiry(tkn);
    if (!exp) return;

    const msUntilRenew = exp - Date.now() - RENEWAL_BEFORE_EXPIRY_MS;
    if (msUntilRenew <= 0) return; // already inside the renewal window

    renewalTimerRef.current = setTimeout(() => doRenew(false), msUntilRenew);
  }, [doRenew]);

  // Keep the ref in sync so doRenew can call scheduleRenewal without a cycle
  scheduleRenewalRef.current = scheduleRenewal;

  // ── On mount: rehydrate from sessionStorage ──────────────────────────────
  // sessionStorage is cleared when the tab/window/Electron app closes, so
  // every fresh launch starts unauthenticated. We also clear any legacy
  // localStorage token left over from before this change.
  useEffect(() => {
    // Remove legacy localStorage token if present
    try { localStorage.removeItem("pos_token"); } catch { /* ignore */ }

    // After an update restart, the install flow saves the token to localStorage
    // under a special key so the admin stays logged in. Restore it once, then
    // delete it so normal closes still require re-login.
    try {
      const persistedToken = localStorage.getItem("pos_token_persist_restart");
      if (persistedToken) {
        sessionStorage.setItem("pos_token", persistedToken);
        localStorage.removeItem("pos_token_persist_restart");
      }
    } catch { /* ignore */ }

    const stored = loadToken();
    if (stored) {
      const decoded = getUserFromToken(stored);
      if (decoded) {
        setToken(stored);
        setUser(decoded);
        scheduleExpiryWarning(stored);
        scheduleRenewal(stored);
      } else {
        clearToken();
      }
    }
    setIsLoading(false);

    // Release session if window/tab is closed
    const handlePageHide = () => {
      const currentToken = loadToken();
      if (currentToken) {
        try {
          fetch("/api/auth/logout", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${currentToken}`,
            },
            keepalive: true,
          }).catch(() => {});
        } catch { /* ignore */ }
      }
    };

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      clearAllTimers();
    };
  }, [scheduleExpiryWarning, scheduleRenewal, clearAllTimers]);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(
    async (username: string, password: string, rememberMe: boolean) => {
      const data = await loginRequest({ username, password, rememberMe });

      saveToken(data.token);
      setToken(data.token);
      setUser(data.user);
      scheduleExpiryWarning(data.token);
      scheduleRenewal(data.token);

      setLocation(getRedirectPath(data.user.role, data.user.mustChangePassword));
    },
    [setLocation, scheduleExpiryWarning, scheduleRenewal]
  );

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    const currentToken = token || loadToken();
    const currentUserId = user?.id;
    const currentUsername = user?.username;

    // Cleanly disconnect real-time sync hub to prevent 4001 force-logout echoes
    realtimeHub.disconnect();

    // Immediately route to /login atomically so the screen swaps without flash
    setLocation("/login");
    clearAllTimers();
    clearToken();
    setToken(null);
    setUser(null);

    // Asynchronously notify server in background
    logoutRequest(currentToken, currentUserId, currentUsername);
  }, [token, user, setLocation, clearAllTimers]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: user !== null,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Primary hook ─────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
