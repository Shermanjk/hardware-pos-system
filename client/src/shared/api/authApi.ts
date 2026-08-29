import httpClient from "@/shared/api/httpClient";
import type { AuthUser } from "@/shared/utils/auth";

// NOTE: The global 401 → redirect interceptor that used to live here has been
// moved to httpClient.ts so it fires exactly once for every API module.

export interface LoginPayload {
  username:   string;
  password:   string;
  rememberMe: boolean;
}

export interface LoginResponse {
  token: string;
  user:  AuthUser;
}

export async function loginRequest(payload: LoginPayload): Promise<LoginResponse> {
  // Login uses httpClient. The request interceptor skips the Authorization
  // header when no token is stored yet, so public endpoints remain accessible.
  const response = await httpClient.post<LoginResponse>("/api/auth/login", payload);
  return response.data;
}

export async function logoutRequest(
  token?: string | null,
  userId?: number | null,
  username?: string | null
): Promise<void> {
  try {
    const t = token ?? null;
    const config: { headers?: Record<string, string> } = {};
    if (t) {
      config.headers = { Authorization: `Bearer ${t}` };
    }
    await httpClient.post("/api/auth/logout", { userId, username }, config);
  } catch {
    /* silent — local state cleanup will proceed regardless */
  }
}
