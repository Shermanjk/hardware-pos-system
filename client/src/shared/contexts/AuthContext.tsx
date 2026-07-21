import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { loginRequest } from "@/shared/api/authApi";
import {
  type AuthUser,
  saveToken,
  loadToken,
  clearToken,
  getUserFromToken,
  getRedirectPath,
} from "@/shared/utils/auth";

// ─── Context shape ────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (
    username: string,
    password: string,
    rememberMe: boolean
  ) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: rehydrate from localStorage
  useEffect(() => {
    const stored = loadToken();
    if (stored) {
      const decoded = getUserFromToken(stored);
      if (decoded) {
        setToken(stored);
        setUser(decoded);
      } else {
        clearToken();
      }
    }
    setIsLoading(false);
  }, []);


  const login = useCallback(
    async (
      username: string,
      password: string,
      rememberMe: boolean
    ) => {
      const data = await loginRequest({ username, password, rememberMe });

      saveToken(data.token);
      setToken(data.token);
      setUser(data.user);

      setLocation(getRedirectPath(data.user.role, data.user.mustChangePassword));
    },
    [setLocation]
  );

  const logout = useCallback(() => {
    clearToken();
    setToken(null);
    setUser(null);
    setLocation("/login");
  }, [setLocation]);

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
