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

const httpClient = axios.create({
  timeout: 15_000, // 15 s — prevents requests from hanging indefinitely
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

// ── Response interceptor: force-logout on 401 ────────────────────────────────
// This is the single canonical place for 401 handling. The old global
// `axios.interceptors.response.use` in authApi.ts is removed once this is in
// place to avoid double-redirect side effects.
httpClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      const stored = localStorage.getItem(TOKEN_KEY);
      // Only force-logout if we had a token (i.e. not a failed login attempt)
      if (stored) {
        clearToken();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default httpClient;
