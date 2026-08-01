// ─── Token storage key ────────────────────────────────────────────────────────
export const TOKEN_KEY = "pos_token";

// ─── Auth user shape (mirrors JWT payload) ───────────────────────────────────
export interface AuthUser {
  id: number;
  full_name: string;
  username: string;
  role: "Admin" | "Inventory Clerk" | "Cashier";
  employee_id: string | null;
  /** Present (and true) only in the restricted 15-min token issued at first login */
  mustChangePassword?: boolean;
}

// ─── Minimal JWT decode (no signature verification — server does that) ────────
function decodeJwt(token: string): (AuthUser & { exp?: number }) | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ─── Extract expiry timestamp in ms from a JWT ───────────────────────────────
// Returns null if the token has no exp claim or cannot be decoded.
export function decodeTokenExpiry(token: string): number | null {
  const decoded = decodeJwt(token);
  if (!decoded?.exp) return null;
  return decoded.exp * 1000; // convert seconds → ms
}

// ─── Extract user from token (returns null if expired) ───────────────────────
export function getUserFromToken(token: string | null): AuthUser | null {
  if (!token) return null;
  const decoded = decodeJwt(token);
  if (!decoded) return null;
  if (decoded.exp && decoded.exp * 1000 < Date.now()) return null;
  return {
    id: decoded.id,
    full_name: decoded.full_name,
    username: decoded.username,
    role: decoded.role,
    employee_id: decoded.employee_id,
    ...(decoded.mustChangePassword ? { mustChangePassword: true } : {}),
  };
}

// ─── localStorage helpers ─────────────────────────────────────────────────────
export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function loadToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ─── Role → default redirect path ────────────────────────────────────────────
export function getRedirectPath(role: AuthUser["role"], mustChangePassword?: boolean): string {
  // If the account requires a password change, always redirect there first
  if (mustChangePassword) return "/change-password";
  switch (role) {
    case "Admin":
      return "/";
    case "Inventory Clerk":
      return "/clerk/dashboard";
    case "Cashier":
      return "/cashier";
  }
}
