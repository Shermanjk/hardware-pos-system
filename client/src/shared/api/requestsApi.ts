import httpClient from "@/shared/api/httpClient";

export interface UnifiedRequest {
  type: 'STOCK_COUNT_STANDARD' | 'STOCK_COUNT_MARKET' | 'VOID' | 'RETURN';
  id: number;
  reference: string;
  product_name?: string;
  barcode?: string;
  invoice_number?: string;
  return_number?: string;
  requested_by_name: string;
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

export async function createStockCountRequest(data: {
  product_id: number;
  system_quantity: number;
  physical_quantity: number;
  reason: string;
  remarks?: string;
}): Promise<{ reference: string }> {
  const res = await httpClient.post<{ reference: string }>(
    "/api/requests/stock-count-standard",
    data
  );
  return res.data;
}

export async function approveRequest(type: string, id: number): Promise<void> {
  await httpClient.post(`/api/requests/${type}/${id}/approve`, {});
}

export async function rejectRequest(type: string, id: number, reason: string): Promise<void> {
  await httpClient.post(`/api/requests/${type}/${id}/reject`, {
    rejection_reason: reason,
  });
}
