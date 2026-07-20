import axios from "axios";
import { loadToken } from "@/shared/utils/auth";

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SaleItem {
  id: number;
  sale_id: number;
  product_id: number;
  product_name: string;
  barcode: string | null;
  is_returnable: number;
  quantity: number;
  unit_price: number;
  subtotal: number;
  quantity_returned: number;
}

export interface Sale {
  id: number;
  invoice_number: string;
  customer_name: string;
  customer_address: string | null;
  customer_tin: string | null;
  cashier_id: number;
  cashier_name: string;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  cash_tendered: number;
  change_amount: number;
  created_at: string;
  items: SaleItem[];
}

export interface SaleSummary {
  id: number;
  invoice_number: string;
  customer_name: string;
  cashier_name: string;
  total_amount: number;
  created_at: string;
}

export interface CreateSalePayload {
  customer_name: string;
  customer_address?: string;
  customer_tin?: string;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  cash_tendered: number;
  change_amount: number;
  items: Array<{
    product_id: number;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function createSale(
  payload: CreateSalePayload
): Promise<{ invoice_number: string; id: number }> {
  const response = await axios.post<{ invoice_number: string; id: number }>(
    "/api/sales",
    payload,
    { headers: authHeaders() }
  );
  return response.data;
}

export async function getSaleByInvoice(invoiceNumber: string): Promise<Sale> {
  const response = await axios.get<Sale>(
    `/api/sales/${encodeURIComponent(invoiceNumber)}`,
    { headers: authHeaders() }
  );
  return response.data;
}

export async function searchSales(params: {
  invoice_number?: string;
  customer_name?: string;
  date_from?: string;
  date_to?: string;
}): Promise<SaleSummary[]> {
  const response = await axios.get<SaleSummary[]>("/api/sales", {
    headers: authHeaders(),
    params,
  });
  return response.data;
}
