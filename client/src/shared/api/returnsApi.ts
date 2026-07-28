import axios from "axios";
import { loadToken } from "@/shared/utils/auth";

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReturnItem {
  id: number;
  return_id: number;
  sale_item_id: number;
  product_id: number;
  product_name: string;
  quantity_returned: number;
  quantity_type?: "WHOLE_UNIT" | "WEIGHTED";
  unit_abbreviation?: string;
  unit_price: number;
}

export interface Return {
  id: number;
  return_number: string;
  sale_id: number;
  invoice_number: string;
  customer_name: string;
  processed_by: number;
  cashier_name: string;
  approved_by: number | null;
  admin_name: string | null;
  status: "pending" | "approved" | "rejected";
  resolution: "refund" | "replacement" | null;
  item_condition: "good" | "damaged" | null;
  return_reason: string;
  refund_amount: number | null;
  created_at: string;
  resolved_at: string | null;
  items: ReturnItem[];
}

export interface CreateReturnPayload {
  sale_id: number;
  return_reason: string;
  items: Array<{
    sale_item_id: number;
    product_id: number;
    quantity_returned: number;
    unit_price: number;
  }>;
}

export interface ResolveReturnPayload {
  resolution: "refund" | "replacement";
  item_condition: "good" | "damaged";
}

// ─── API functions ────────────────────────────────────────────────────────────

export interface ApprovedReturnSummary {
  id: number;
  return_number: string;
  invoice_number: string;
  customer_name: string;
  return_reason: string;
  status: string;
  resolution: string | null;
  created_at: string;
}

export async function searchApprovedReturns(customer_name: string): Promise<ApprovedReturnSummary[]> {
  const response = await axios.get<ApprovedReturnSummary[]>("/api/returns/search-approved", {
    headers: authHeaders(),
    params: { customer_name },
  });
  return response.data;
}

export async function createReturn(
  payload: CreateReturnPayload
): Promise<{ return_number: string; id: number }> {
  const response = await axios.post<{ return_number: string; id: number }>(
    "/api/returns",
    payload,
    { headers: authHeaders() }
  );
  return response.data;
}

export async function getReturns(params?: {
  status?: string;
  date_from?: string;
  date_to?: string;
}): Promise<Return[]> {
  const response = await axios.get<Return[]>("/api/returns", {
    headers: authHeaders(),
    params,
  });
  return response.data;
}

export async function getReturnById(id: number): Promise<Return> {
  const response = await axios.get<Return>(`/api/returns/${id}`, {
    headers: authHeaders(),
  });
  return response.data;
}

export async function approveReturn(id: number): Promise<Return> {
  const response = await axios.patch<Return>(
    `/api/returns/${id}/approve`,
    {},
    { headers: authHeaders() }
  );
  return response.data;
}

export async function rejectReturn(
  id: number,
  return_reason: string
): Promise<Return> {
  const response = await axios.patch<Return>(
    `/api/returns/${id}/reject`,
    { return_reason },
    { headers: authHeaders() }
  );
  return response.data;
}

export async function resolveReturn(
  id: number,
  payload: ResolveReturnPayload
): Promise<Return> {
  const response = await axios.patch<Return>(
    `/api/returns/${id}/resolve`,
    payload,
    { headers: authHeaders() }
  );
  return response.data;
}

export async function getMyPendingReturns(): Promise<Return[]> {
  const response = await axios.get<Return[]>("/api/returns/my-pending", {
    headers: authHeaders(),
  });
  return response.data;
}
