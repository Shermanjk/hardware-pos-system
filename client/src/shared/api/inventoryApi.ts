import axios from "axios";
import { loadToken } from "@/shared/utils/auth";

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InventorySummary {
  total_products: number;
  out_of_stock: number;
  critical: number;
  low_stock: number;
  in_stock: number;
  total_units: number;
}

export interface InventoryItem {
  id: number;
  barcode: string;
  product_name: string;
  category: string;
  supplier: string;
  unit: string;
  unit_abbreviation: string;
  quantity: number;
  reorder_level: number;
  damaged_stock: number;
  cost_price: number;
  selling_price: number;
  updated_at: string | null;
}

export interface InventoryLog {
  id: number;
  product_id: number;
  product_name: string;
  barcode: string;
  transaction_type: string | null;
  action: string | null;
  quantity_change: number | null;
  quantity: number | null;
  remaining_stock: number | null;
  reference: string | null;
  created_at: string;
  performed_by: string;
}

export type StockStatusFilter = "all" | "In Stock" | "Low Stock" | "Critical" | "Out of Stock";

// ─── API ──────────────────────────────────────────────────────────────────────

export async function getInventorySummary(): Promise<InventorySummary> {
  const res = await axios.get<InventorySummary>("/api/inventory/summary", {
    headers: authHeaders(),
  });
  return res.data;
}

export async function getInventory(filters: {
  search?: string;
  category_id?: string | number;
  status?: StockStatusFilter;
} = {}): Promise<InventoryItem[]> {
  const params: Record<string, string> = {};
  if (filters.search)      params.search      = filters.search;
  if (filters.category_id) params.category_id = String(filters.category_id);
  if (filters.status && filters.status !== "all") params.status = filters.status;

  const res = await axios.get<InventoryItem[]>("/api/inventory", {
    headers: authHeaders(),
    params,
  });
  return res.data;
}

export async function getInventoryLogs(options: {
  product_id?: number;
  limit?: number;
  offset?: number;
} = {}): Promise<InventoryLog[]> {
  const params: Record<string, string> = {};
  if (options.product_id) params.product_id = String(options.product_id);
  if (options.limit)      params.limit      = String(options.limit);
  if (options.offset)     params.offset     = String(options.offset);

  const res = await axios.get<InventoryLog[]>("/api/inventory/logs", {
    headers: authHeaders(),
    params,
  });
  return res.data;
}

export interface StockInItem {
  product_id: number;
  quantity_received: number;
  unit_cost?: number;
}

export type StockInSource =
  | "Supplier Delivery"
  | "Direct Purchase";

export interface StockInPayload {
  source: StockInSource;
  supplier_id?: number;
  invoice_number?: string;
  delivery_date: string;
  remarks?: string;
  items: StockInItem[];
}

export async function submitStockIn(payload: StockInPayload): Promise<{ message: string; stock_in_id: string; reference: string }> {
  const res = await axios.post("/api/inventory/stock-in", payload, { headers: authHeaders() });
  return res.data;
}

export interface StockAdjustmentPayload {
  product_id: number;
  type: "Damaged" | "Lost" | "Expired" | "Correction";
  quantity: number;
  reason: string;
}

export async function submitStockAdjustment(payload: StockAdjustmentPayload): Promise<{ message: string; product_id: number; type: string; new_quantity: number }> {
  const res = await axios.post("/api/inventory/stock-adjustment", payload, { headers: authHeaders() });
  return res.data;
}
