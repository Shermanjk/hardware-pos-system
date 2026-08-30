import httpClient from "@/shared/api/httpClient";

export interface UnifiedRequest {
  type: 'STOCK_COUNT_STANDARD' | 'STOCK_COUNT_MARKET' | 'VOID' | 'RETURN';
  id: number;
  reference: string;
  product_name?: string;
  barcode?: string;
  category_name?: string;
  unit_abbreviation?: string;
  invoice_number?: string;
  return_number?: string;
  requested_by_name: string;
  approved_by_name?: string;
  approved_at?: string;
  rejection_reason?: string;
  created_at: string;
  prepared_at: string;
  difference?: number;
  amount?: number;
  reason: string;
  remarks?: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'pending' | 'approved' | 'rejected' | 'waiting_for_cashier' | 'completed';
  system_quantity?: number;
  physical_quantity?: number;
  customer_name?: string;
  customer_id?: number;
  total_amount?: number;
  unit_price?: number;
  quantity_type?: 'WHOLE_UNIT' | 'WEIGHTED';
  unit_allow_decimal?: boolean;
}

export interface RequestKPI {
  pending_requests: number;
  approved_today: number;
  rejected_today: number;
  awaiting_review: number;
}

export async function getPendingRequests(): Promise<UnifiedRequest[]> {
  const res = await httpClient.get<UnifiedRequest[]>("/api/requests/pending");
  return res.data;
}

export async function getRequestHistory(filters?: {
  type?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<UnifiedRequest[]> {
  const res = await httpClient.get<UnifiedRequest[]>("/api/requests/history", {
    params: filters,
  });
  return res.data;
}

export async function getRequestKPI(): Promise<RequestKPI> {
  const res = await httpClient.get<RequestKPI>("/api/requests/kpi");
  return res.data;
}

export interface CreateStockCountPayload {
  product_id: number;
  system_quantity: number;
  physical_quantity: number;
  reason: string;
  remarks?: string;
}

export async function createStockCountRequest(data: CreateStockCountPayload): Promise<{ id: number; reference: string }> {
  const res = await httpClient.post<{ id: number; reference: string }>(
    "/api/requests/stock-count-standard",
    data
  );
  return res.data;
}

export async function authorizeStockCountRequest(
  data: CreateStockCountPayload,
  credentials: { username: string; password: string }
): Promise<{ message: string; id: number; reference: string; admin_name: string; admin_id: number; new_quantity: number }> {
  const res = await httpClient.post<{ message: string; id: number; reference: string; admin_name: string; admin_id: number; new_quantity: number }>(
    "/api/requests/stock-count-standard/authorize",
    { ...data, ...credentials }
  );
  return res.data;
}

export async function localOverrideStockCountRequest(
  id: number,
  credentials: { username: string; password: string }
): Promise<{ message: string; reference: string; admin_name: string; admin_id: number; new_quantity: number }> {
  const res = await httpClient.post<{ message: string; reference: string; admin_name: string; admin_id: number; new_quantity: number }>(
    `/api/requests/stock-count-standard/${id}/local-override`,
    credentials
  );
  return res.data;
}

export async function approveRequest(type: string, id: number): Promise<void> {
  await httpClient.post(`/api/requests/${type}/${id}/approve`, {});
}

export async function approveReturnRequest(id: number, payload: {
  resolution: "refund" | "exchange" | "store_credit" | "rejected";
  customer_id?: number;
  exchange_product_id?: number;
  exchange_quantity?: number;
  additional_payment?: number;
  refund_difference?: number;
  rejection_reason?: string;
}): Promise<void> {
  await httpClient.patch(`/api/returns/${id}/approve`, payload);
}

export async function rejectRequest(type: string, id: number, reason: string): Promise<void> {
  await httpClient.post(`/api/requests/${type}/${id}/reject`, {
    rejection_reason: reason,
  });
}

// ─── Batch stock count API ───────────────────────────────────────────────────

export interface StockCountBatchItemPayload {
  product_id: number;
  system_quantity: number;
  physical_quantity: number;
  reason: string;
  remarks?: string;
  is_market_based?: boolean;
}

export interface CreateStockCountBatchPayload {
  items: StockCountBatchItemPayload[];
}

export interface BatchItemDecision {
  id: number;
  type: "stock-count-standard" | "stock-count-market" | "STOCK_COUNT_STANDARD" | "STOCK_COUNT_MARKET";
  action: "approve" | "reject";
  rejection_reason?: string | null;
}

export interface BatchDecisionPayload {
  reference?: string | null;
  decisions: BatchItemDecision[];
}

export interface BatchDecisionResult {
  message: string;
  approved_count: number;
  rejected_count: number;
  results: Array<{ id: number; status: "APPROVED" | "REJECTED"; reason?: string; action: "approve" | "reject" }>;
}

export interface BatchRequestDetails {
  reference: string;
  items_count: number;
  requested_by_name: string;
  prepared_at: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "PARTIALLY_APPROVED";
  items: UnifiedRequest[];
}

export async function submitStockCountBatch(data: CreateStockCountBatchPayload): Promise<{ reference: string; count: number; items: any[] }> {
  const res = await httpClient.post<{ reference: string; count: number; items: any[] }>(
    "/api/requests/stock-count/batch",
    data
  );
  return res.data;
}

export async function authorizeStockCountBatch(
  data: CreateStockCountBatchPayload,
  credentials: { username: string; password: string }
): Promise<{ message: string; reference: string; count: number; admin_name: string; admin_id: number }> {
  const res = await httpClient.post<{ message: string; reference: string; count: number; admin_name: string; admin_id: number }>(
    "/api/requests/stock-count/batch/authorize",
    { ...data, ...credentials }
  );
  return res.data;
}

export async function decideStockCountBatch(data: BatchDecisionPayload): Promise<BatchDecisionResult> {
  const res = await httpClient.post<BatchDecisionResult>(
    "/api/requests/stock-count/batch/decide",
    data
  );
  return res.data;
}

export async function getBatchRequestDetails(reference: string): Promise<BatchRequestDetails> {
  const res = await httpClient.get<BatchRequestDetails>(`/api/requests/batch/${encodeURIComponent(reference)}`);
  return res.data;
}

