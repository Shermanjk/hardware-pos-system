import httpClient from "@/shared/api/httpClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InventorySummary {
  total_products: number;
  out_of_stock: number;
  critical: number;
  low_stock: number;
  in_stock: number;
  total_units: number | null;
}

export interface InventoryItem {
  id: number;
  barcode: string;
  product_name: string;
  category: string;
  supplier: string;
  unit: string;
  unit_abbreviation: string;
  unit_type?: "Count" | "Weight" | "Volume" | "Length" | "Area" | "Packaging" | "Other";
  unit_allow_decimal?: boolean;
  unit_status?: "Active" | "Inactive";
  quantity: number;
  quantity_type?: "WHOLE_UNIT" | "WEIGHTED";
  pricing_type?: "FIXED_PRICE" | "MARKET_BASED";
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
  unit_abbreviation?: string;
  quantity_type?: "WHOLE_UNIT" | "WEIGHTED";
  unit_allow_decimal?: boolean;
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
  const res = await httpClient.get<InventorySummary>("/api/inventory/summary");
  return res.data;
}

export async function getInventory(
  filters: {
    search?: string;
    category_id?: string | number;
    status?: StockStatusFilter;
  } = {}
): Promise<InventoryItem[]> {
  const params: Record<string, string> = {};
  if (filters.search)      params.search      = filters.search;
  if (filters.category_id) params.category_id = String(filters.category_id);
  if (filters.status && filters.status !== "all") params.status = filters.status;

  const res = await httpClient.get<InventoryItem[]>("/api/inventory", { params });
  return res.data;
}

export async function getInventoryLogs(
  options: { product_id?: number; limit?: number; offset?: number } = {}
): Promise<InventoryLog[]> {
  const params: Record<string, string> = {};
  if (options.product_id) params.product_id = String(options.product_id);
  if (options.limit)      params.limit      = String(options.limit);
  if (options.offset)     params.offset     = String(options.offset);

  const res = await httpClient.get<InventoryLog[]>("/api/inventory/logs", { params });
  return res.data;
}

export interface StockInItem {
  product_id: number;
  quantity_received: number;
  unit_cost?: number;
}

export type StockInSource = "Supplier Delivery" | "Direct Purchase";

export interface StockInPayload {
  source: StockInSource;
  supplier_id?: number;
  invoice_number?: string;
  delivery_date: string;
  remarks?: string;
  items: StockInItem[];
}

export async function submitStockIn(
  payload: StockInPayload
): Promise<{ message: string; stock_in_id: string; reference: string }> {
  const res = await httpClient.post("/api/inventory/stock-in", payload);
  return res.data;
}

export interface StockAdjustmentPayload {
  product_id: number;
  type: "Damaged" | "Lost" | "Expired" | "Correction";
  quantity: number;
  reason: string;
}

export async function submitStockAdjustment(
  payload: StockAdjustmentPayload
): Promise<{ message: string; product_id: number; type: string; new_quantity: number }> {
  const res = await httpClient.post("/api/inventory/stock-adjustment", payload);
  return res.data;
}

// ─── Market-Based Adjustment Requests ─────────────────────────────────────────

export interface MarketBasedAdjustmentRequest {
  id: number;
  product_id: number;
  product_name: string;
  barcode: string;
  system_quantity: number;
  physical_quantity: number;
  difference: number;
  reason: string;
  remarks: string | null;
  prepared_by: number;
  prepared_by_name: string;
  prepared_at: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  reference: string;
}

export interface CreateAdjustmentRequestPayload {
  product_id: number;
  system_quantity: number;
  physical_quantity: number;
  reason: string;
  remarks?: string;
}

export type AdjustmentReason =
  | "Drying/Moisture Loss"
  | "Spillage"
  | "Theft"
  | "Processing Loss"
  | "Handling Loss"
  | "Warehouse Damage"
  | "Inventory Miscount"
  | "Other";

export async function createAdjustmentRequest(
  payload: CreateAdjustmentRequestPayload
): Promise<MarketBasedAdjustmentRequest> {
  const res = await httpClient.post<MarketBasedAdjustmentRequest>(
    "/api/market-based-adjustments/requests",
    payload
  );
  return res.data;
}

export async function getAdjustmentRequests(
  filters: {
    status?: string;
    product_id?: number;
    prepared_by?: number;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<MarketBasedAdjustmentRequest[]> {
  const params: Record<string, string> = {};
  if (filters.status && filters.status !== "all") params.status = filters.status;
  if (filters.product_id)  params.product_id  = String(filters.product_id);
  if (filters.prepared_by) params.prepared_by = String(filters.prepared_by);
  if (filters.date_from)   params.date_from   = filters.date_from;
  if (filters.date_to)     params.date_to     = filters.date_to;
  if (filters.limit)       params.limit       = String(filters.limit);
  if (filters.offset)      params.offset      = String(filters.offset);

  const res = await httpClient.get<MarketBasedAdjustmentRequest[]>(
    "/api/market-based-adjustments/requests",
    { params }
  );
  return res.data;
}

export async function getAdjustmentRequest(id: number): Promise<MarketBasedAdjustmentRequest> {
  const res = await httpClient.get<MarketBasedAdjustmentRequest>(
    `/api/market-based-adjustments/requests/${id}`
  );
  return res.data;
}

export async function approveAdjustmentRequest(
  id: number
): Promise<{ message: string; new_quantity: number; reference: string }> {
  const res = await httpClient.post<{ message: string; new_quantity: number; reference: string }>(
    `/api/market-based-adjustments/requests/${id}/approve`,
    {}
  );
  return res.data;
}

export async function rejectAdjustmentRequest(
  id: number,
  rejection_reason: string
): Promise<{ message: string; reference: string }> {
  const res = await httpClient.post<{ message: string; reference: string }>(
    `/api/market-based-adjustments/requests/${id}/reject`,
    { rejection_reason }
  );
  return res.data;
}

export async function getAdjustmentHistory(
  filters: {
    product_id?: number;
    prepared_by?: number;
    status?: string;
    reason?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<MarketBasedAdjustmentRequest[]> {
  const params: Record<string, string> = {};
  if (filters.product_id)                         params.product_id  = String(filters.product_id);
  if (filters.prepared_by)                        params.prepared_by = String(filters.prepared_by);
  if (filters.status && filters.status !== "all") params.status      = filters.status;
  if (filters.reason && filters.reason !== "all") params.reason      = filters.reason;
  if (filters.date_from)                          params.date_from   = filters.date_from;
  if (filters.date_to)                            params.date_to     = filters.date_to;
  if (filters.limit)                              params.limit       = String(filters.limit);
  if (filters.offset)                             params.offset      = String(filters.offset);

  const res = await httpClient.get<MarketBasedAdjustmentRequest[]>(
    "/api/market-based-adjustments/history",
    { params }
  );
  return res.data;
}

export async function getPendingAdjustmentCount(): Promise<{ count: number }> {
  const res = await httpClient.get<{ count: number }>(
    "/api/market-based-adjustments/pending-count"
  );
  return res.data;
}
