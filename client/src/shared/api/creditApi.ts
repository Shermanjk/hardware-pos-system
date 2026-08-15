import httpClient from "./httpClient";

export interface CreditLimitOverridePending {
  id: number;
  customer_id: number;
  customer_name: string;
  customer_code: string;
  requested_amount: number;
  current_limit: number;
  current_balance: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  cashier_name: string;
  cashier_user_id: number;
}

export interface SubmitOverridePayload {
  customer_id: number;
  requested_amount: number;
  reason?: string;
}

export interface DecisionPayload {
  admin_password: string;
  rejection_reason?: string;
}

// ─── Request an override (Cashier) ────────────────────────────────────────────
export async function requestCreditLimitOverride(
  payload: SubmitOverridePayload
): Promise<{ override_id: number; message: string }> {
  const res = await httpClient.post("/api/credit-limit-overrides", payload);
  return res.data;
}

// ─── Get pending overrides (Admin) ────────────────────────────────────────────
export async function getPendingCreditLimitOverrides(): Promise<CreditLimitOverridePending[]> {
  const res = await httpClient.get<CreditLimitOverridePending[]>("/api/credit-limit-overrides/pending");
  return res.data;
}

// ─── Approve override (Admin) ─────────────────────────────────────────────────
export async function approveCreditLimitOverride(
  overrideId: number,
  payload: DecisionPayload
): Promise<void> {
  await httpClient.post(`/api/credit-limit-overrides/${overrideId}/approve`, payload);
}

// ─── Reject override (Admin) ──────────────────────────────────────────────────
export async function rejectCreditLimitOverride(
  overrideId: number,
  payload: DecisionPayload
): Promise<void> {
  await httpClient.post(`/api/credit-limit-overrides/${overrideId}/reject`, payload);
}
