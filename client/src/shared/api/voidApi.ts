import axios from "axios";
import { loadToken } from "@/shared/utils/auth";

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface VoidRequest {
  id: number;
  sale_id: number;
  invoice_number: string;
  customer_name: string;
  total_amount: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requested_by_name: string;
  approved_by_name: string | null;
  created_at: string;
  resolved_at: string | null;
}

export async function getVoidRequests(): Promise<VoidRequest[]> {
  const res = await axios.get<VoidRequest[]>("/api/sales/void-requests", {
    headers: authHeaders(),
  });
  return res.data;
}

export async function approveVoid(voidId: number): Promise<{ message: string }> {
  const res = await axios.patch<{ message: string }>(
    `/api/sales/${voidId}/void-approve`,
    {},
    { headers: authHeaders() }
  );
  return res.data;
}

export async function rejectVoid(
  voidId: number,
  rejection_reason: string
): Promise<{ message: string }> {
  const res = await axios.patch<{ message: string }>(
    `/api/sales/${voidId}/void-reject`,
    { rejection_reason },
    { headers: authHeaders() }
  );
  return res.data;
}
