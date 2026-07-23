import axios from "axios";
import { loadToken } from "@/shared/utils/auth";

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface SuspendedCartItem {
  product_id: number;
  name: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  tax_type?: "VATABLE" | "VAT_EXEMPT" | "ZERO_RATED" | "NON_TAXABLE";
  tax_rate?: number;
  taxable_amount?: number;
  vat_amount?: number;
}

export interface SuspendedSale {
  id: number;
  suspended_order_id: string;
  customer_name: string;
  customer_address: string | null;
  customer_tin: string | null;
  cart_data: SuspendedCartItem[];
  status: "SUSPENDED" | "COMPLETED" | "CANCELLED";
  label: string | null;
  created_at: string;
  updated_at: string;
}

export interface SuspendSalePayload {
  customer_name?: string;
  customer_address?: string;
  customer_tin?: string;
  cart_items: SuspendedCartItem[];
  label?: string;
}

export interface CompleteSuspendedSalePayload {
  cash_tendered?: number;
  change_amount?: number;
}

// Get all suspended sales for current cashier
export async function getSuspendedSales(): Promise<SuspendedSale[]> {
  const res = await axios.get<SuspendedSale[]>("/api/suspended-sales", {
    headers: authHeaders(),
  });
  return res.data;
}

// Get specific suspended sale
export async function getSuspendedSale(id: string): Promise<SuspendedSale> {
  const res = await axios.get<SuspendedSale>(`/api/suspended-sales/${id}`, {
    headers: authHeaders(),
  });
  return res.data;
}

// Suspend (save) a sale
export async function suspendSale(payload: SuspendSalePayload): Promise<{ id: string; message: string }> {
  const res = await axios.post<{ id: string; message: string }>("/api/suspended-sales", payload, {
    headers: authHeaders(),
  });
  return res.data;
}

// Update suspended sale (for resuming)
export async function updateSuspendedSale(
  id: string,
  payload: SuspendSalePayload
): Promise<{ message: string }> {
  const res = await axios.put<{ message: string }>(`/api/suspended-sales/${id}`, payload, {
    headers: authHeaders(),
  });
  return res.data;
}

// Discard a suspended sale
export async function discardSuspendedSale(id: string): Promise<{ message: string }> {
  const res = await axios.delete<{ message: string }>(`/api/suspended-sales/${id}`, {
    headers: authHeaders(),
  });
  return res.data;
}

// Complete a suspended sale (convert to actual sale)
export async function completeSuspendedSale(
  id: string,
  payload: CompleteSuspendedSalePayload
): Promise<{
  invoice_number: string;
  id: number;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  change_amount: number;
  items: any[];
}> {
  const res = await axios.post(`/api/suspended-sales/${id}/complete`, payload, {
    headers: authHeaders(),
  });
  return res.data;
}