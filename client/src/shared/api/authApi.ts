import axios from "axios";
import type { AuthUser } from "@/shared/utils/auth";
import { clearToken, TOKEN_KEY } from "@/shared/utils/auth";

// Auto-logout on 401 (expired token mid-session)
axios.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      const stored = localStorage.getItem(TOKEN_KEY);
      // Only force-logout if we had a token (i.e. not a login attempt failure)
      if (stored) {
        clearToken();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

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
  const response = await axios.post<LoginResponse>("/api/auth/login", payload);
  return response.data;
}
