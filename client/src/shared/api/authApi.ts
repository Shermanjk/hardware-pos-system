import axios from "axios";
import type { AuthUser } from "@/shared/utils/auth";

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
