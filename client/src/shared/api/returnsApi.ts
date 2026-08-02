import httpClient from "@/shared/api/httpClient";

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
  status: "pending" | "approved" | "rejected" | "waiting_for_cashier" | "completed";
  resolution: "refund" | "exchange" | "store_credit" | "rejected" | null;
  item_condition: "good" | "damaged" | "defective" | null;
  return_reason: string;
  refund_amount: number | null;
  exchange_product_id?: number | null;
  exchange_barcode?: string | null;
  exchange_quantity?: number | null;
  additional_payment?: number | null;
  refund_difference?: number | null;
  created_at: string;
  resolved_at: string | null;
  items: ReturnItem[];
}

export interface CreateReturnPayload {
  sale_id: number;
  return_reason: string;
  item_condition: "good" | "damaged" | "defective";
  items: Array<{
    sale_item_id: number;
    product_id: number;
    quantity_returned: number;
    unit_price: number;
  }>;
}

/**
 * Resolution execution has no mutable fields. The server uses the Admin
 * approval and the condition already stored on the return request.
 */
export type ResolveReturnPayload = Record<string, never>;

export interface ApproveReturnPayload {
  resolution: "refund" | "exchange" | "store_credit" | "rejected";
  exchange_barcode?: string;
  exchange_quantity?: number;
  additional_payment?: number;
  refund_difference?: number;
  rejection_reason?: string;
}

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

// ─── API functions ────────────────────────────────────────────────────────────

export async function searchApprovedReturns(customer_name: string): Promise<ApprovedReturnSummary[]> {
  const response = await httpClient.get<ApprovedReturnSummary[]>("/api/returns/search-approved", {
    params: { customer_name },
  });
  return response.data;
}

export async function getWaitingForCashierReturns(customer_name: string): Promise<ApprovedReturnSummary[]> {
  const response = await httpClient.get<ApprovedReturnSummary[]>("/api/returns/search-approved", {
    params: { customer_name },
  });
  return response.data;
}

export async function createReturn(
  payload: CreateReturnPayload
): Promise<{ return_number: string; id: number }> {
  const response = await httpClient.post<{ return_number: string; id: number }>(
    "/api/returns",
    payload
  );
  return response.data;
}

export async function getReturns(params?: {
  status?: string;
  date_from?: string;
  date_to?: string;
}): Promise<Return[]> {
  const response = await httpClient.get<Return[]>("/api/returns", { params });
  return response.data;
}

export async function getReturnById(id: number): Promise<Return> {
  const response = await httpClient.get<Return>(`/api/returns/${id}`);
  return response.data;
}

export async function approveReturn(id: number, payload: ApproveReturnPayload): Promise<Return> {
  const response = await httpClient.patch<Return>(`/api/returns/${id}/approve`, payload);
  return response.data;
}

export async function rejectReturn(id: number, return_reason: string): Promise<Return> {
  const response = await httpClient.patch<Return>(`/api/returns/${id}/reject`, { return_reason });
  return response.data;
}

export async function resolveReturn(id: number, payload: ResolveReturnPayload): Promise<Return> {
  const response = await httpClient.patch<Return>(`/api/returns/${id}/resolve`, payload);
  return response.data;
}

export async function getMyPendingReturns(): Promise<Return[]> {
  const response = await httpClient.get<Return[]>("/api/returns/my-pending");
  return response.data;
}

export async function getMyReturnHistory(search?: string): Promise<Return[]> {
  const response = await httpClient.get<Return[]>("/api/returns/my-history", {
    params: { search },
  });
  return response.data;
}
