import httpClient from "@/shared/api/httpClient";
import type { AuthUser } from "@/shared/utils/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserRecord {
  id: number;
  full_name: string;
  username: string;
  role: "Admin" | "Inventory Clerk" | "Cashier";
  employee_id: string | null;
  status: "Active" | "Inactive";
  must_change_password: boolean;
  password_changed_at: string | null;
  updated_at: string | null;
}

export interface CreateUserPayload {
  full_name: string;
  username: string;
  employee_id?: string | null;
  role: "Cashier" | "Inventory Clerk";
  status: "Active" | "Inactive";
}

export interface CreateUserResponse {
  user: UserRecord;
  tempPassword: string;
}

export interface UpdateUserPayload {
  full_name?: string;
  role?: "Cashier" | "Inventory Clerk";
  status?: "Active" | "Inactive";
  employee_id?: string | null;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ChangePasswordResponse {
  token: string;
  user: AuthUser;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function getUsers(): Promise<UserRecord[]> {
  const response = await httpClient.get<UserRecord[]>("/api/users");
  return response.data;
}

export async function createUser(payload: CreateUserPayload): Promise<CreateUserResponse> {
  const response = await httpClient.post<CreateUserResponse>("/api/users", payload);
  return response.data;
}

export async function updateUser(id: number, payload: UpdateUserPayload): Promise<UserRecord> {
  const response = await httpClient.put<UserRecord>(`/api/users/${id}`, payload);
  return response.data;
}

export async function resetPassword(id: number): Promise<{ tempPassword: string }> {
  const response = await httpClient.post<{ tempPassword: string }>(
    `/api/users/${id}/reset-password`,
    {}
  );
  return response.data;
}

export async function deactivateUser(id: number): Promise<UserRecord> {
  const response = await httpClient.post<UserRecord>(`/api/users/${id}/deactivate`, {});
  return response.data;
}

export async function changePassword(
  id: number,
  payload: ChangePasswordPayload
): Promise<ChangePasswordResponse> {
  const response = await httpClient.post<ChangePasswordResponse>(
    `/api/users/${id}/change-password`,
    payload
  );
  return response.data;
}
