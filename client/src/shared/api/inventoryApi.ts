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
