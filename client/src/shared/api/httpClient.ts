// ─── Centralized Axios instance ───────────────────────────────────────────────
// All API modules import this instead of bare `axios` so that:
//   1. Every outgoing request automatically carries the JWT bearer token.
//   2. A single 401 handler redirects to /login without duplicating logic.
//   3. A global 15 s timeout prevents hung requests from silently blocking UI.
//
// The login endpoint still works because the request interceptor only attaches
// the header when a token is actually stored. During login no token exists yet,
// so the Authorization header is omitted and the public endpoint is reachable.

import axios from "axios";
import { loadToken, clearToken, TOKEN_KEY } from "@/shared/utils/auth";
import { API_BASE_URL } from "@/config/api";
import { realtimeHub } from "@/shared/hooks/useRealtimeSync";

const httpClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000, // 10 s — prevents requests from hanging indefinitely
});

// ── Request interceptor: attach JWT ──────────────────────────────────────────
httpClient.interceptors.request.use((config) => {
  const token = loadToken();
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: force-logout on 401 & fail-fast offline trigger ────
httpClient.interceptors.response.use(
  (res) => res,
  (error) => {
    // If request failed because of a network error / severed cable, trigger offline banner in <50ms
    if (
      !error.response ||
      error.code === "ERR_NETWORK" ||
      error.code === "ECONNABORTED" ||
      error.message?.includes("Network Error") ||
      error.message?.includes("timeout")
    ) {
      realtimeHub.setOffline(true);
    }

    if (error.response?.status === 401) {
      const stored = localStorage.getItem(TOKEN_KEY);
      // Only force-logout if we had a token (i.e. not a failed login attempt)
      if (stored) {
        clearToken();
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default httpClient;
