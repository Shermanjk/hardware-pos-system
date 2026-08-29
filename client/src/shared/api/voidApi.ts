import httpClient from "@/shared/api/httpClient";

// ─── Admin types ──────────────────────────────────────────────────────────────

export interface VoidRequestItem {
  product_name: string;
  unit: string;
  quantity: number;
  quantity_type?: "WHOLE_UNIT" | "WEIGHTED";
  unit_abbreviation?: string;
  unit_price: number;
  subtotal: number;
}

export interface VoidRequest {
  id: number;
  sale_id: number;
  invoice_number: string;
  customer_name: string;
  total_amount: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  requested_by_name: string;
  approved_by_name: string | null;
  created_at: string;
  resolved_at: string | null;
  items: VoidRequestItem[];
}

// ─── Cashier types ────────────────────────────────────────────────────────────

export interface MyVoidRequestItem {
  product_name: string;
  unit: string;
  quantity: number;
  quantity_type?: "WHOLE_UNIT" | "WEIGHTED";
  unit_abbreviation?: string;
  unit_price: number;
  subtotal: number;
}

export interface MyVoidRequest {
  id: number;
  sale_id: number;
  invoice_number: string;
  customer_name: string;
  total_amount: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  approved_by_name: string | null;
  created_at: string;
  resolved_at: string | null;
  items: MyVoidRequestItem[];
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function getMyVoidRequests(): Promise<MyVoidRequest[]> {
  const res = await httpClient.get<MyVoidRequest[]>("/api/sales/my-void-requests");
  return res.data;
}

export async function getVoidRequests(): Promise<VoidRequest[]> {
  const res = await httpClient.get<VoidRequest[]>("/api/sales/void-requests");
  return res.data;
}

export async function approveVoid(voidId: number): Promise<{ message: string }> {
  const res = await httpClient.patch<{ message: string }>(
    `/api/sales/${voidId}/void-approve`,
    {}
  );
  return res.data;
}

export async function rejectVoid(
  voidId: number,
  rejection_reason: string
): Promise<{ message: string }> {
  const res = await httpClient.patch<{ message: string }>(
    `/api/sales/${voidId}/void-reject`,
    { rejection_reason }
  );
  return res.data;
}

export async function localOverrideVoid(
  voidId: number,
  payload: { username: string; password: string }
): Promise<{ message: string; admin_name: string; admin_id: number }> {
  const res = await httpClient.post<{ message: string; admin_name: string; admin_id: number }>(
    `/api/sales/voids/${voidId}/local-override`,
    payload
  );
  return res.data;
}

export async function directOverrideVoid(payload: {
  sale_id: number;
  reason: string;
  username: string;
  password: string;
}): Promise<{ message: string; admin_name: string; admin_id: number }> {
  const res = await httpClient.post<{ message: string; admin_name: string; admin_id: number }>(
    `/api/sales/direct-override-void`,
    payload
  );
  return res.data;
}
