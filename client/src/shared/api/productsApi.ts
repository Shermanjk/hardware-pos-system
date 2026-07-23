import axios from "axios";
import { loadToken } from "@/shared/utils/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Category {
  id: number;
  category_name: string;
  description?: string | null;
}

export interface Supplier {
  id: number;
  supplier_name: string;
  contact_person?: string | null;
  contact_number?: string | null;
  email?: string | null;
  address?: string | null;
  status?: string;
}

export interface Unit {
  id: number;
  unit_name: string;
  abbreviation: string;
  description?: string | null;
}

export type TaxType = "VATABLE" | "VAT_EXEMPT" | "ZERO_RATED" | "NON_TAXABLE";
export type PricingType = "FIXED_PRICE" | "MARKET_BASED";

export interface ProductRecord {
  id: number;
  barcode: string;
  barcode_source: "manufacturer" | "store";
  supplier_barcode: string | null;
  product_name: string;
  description: string | null;
  category_id: number | null;
  category: string;
  supplier_id: number | null;
  supplier: string;
  unit_id: number | null;
  unit: string;
  unit_abbreviation: string;
  cost_price: number;
  selling_price: number;
  quantity: number;
  reorder_level: number;
  image: string | null;
  status: "Active" | "Inactive";
  is_returnable: boolean;
  damaged_stock: number;
  tax_type: TaxType;
  pricing_type: PricingType;
  created_at: string | null;
  updated_at: string | null;
}

export type StockStatus = "In Stock" | "Low Stock" | "Critical" | "Out of Stock";

export function deriveStatus(quantity: number, reorderLevel: number): StockStatus {
  if (quantity === 0) return "Out of Stock";
  if (quantity <= Math.floor(reorderLevel * 0.5)) return "Critical";
  if (quantity <= reorderLevel) return "Low Stock";
  return "In Stock";
}

export interface CreateProductPayload {
  barcode: string;
  barcode_source: "manufacturer" | "store";
  supplier_barcode?: string | null;
  product_name: string;
  description?: string | null;
  category_id: number;
  supplier_id?: number | null;
  unit_id: number;
  cost_price: number;
  selling_price: number;
  reorder_level: number;
  is_returnable?: boolean;
  status?: "Active" | "Inactive";
  tax_type?: TaxType;
  pricing_type?: PricingType;
}

export type UpdateProductPayload = Partial<CreateProductPayload>;

export interface ProductFilters {
  search?: string;
  category_id?: number | string;
  supplier_id?: number | string;
  status?: StockStatus | "";
}

// ─── Axios auth headers ───────────────────────────────────────────────────────

function authHeaders() {
  const token = loadToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function getProducts(filters: ProductFilters = {}): Promise<ProductRecord[]> {
  const params: Record<string, string> = {};
  if (filters.search)      params.search      = filters.search;
  if (filters.category_id) params.category_id = String(filters.category_id);
  if (filters.supplier_id) params.supplier_id = String(filters.supplier_id);
  if (filters.status)      params.status      = filters.status;

  const res = await axios.get<ProductRecord[]>("/api/products", {
    headers: authHeaders(),
    params,
  });
  return res.data;
}

export async function getProduct(id: number): Promise<ProductRecord> {
  const res = await axios.get<ProductRecord>(`/api/products/${id}`, {
    headers: authHeaders(),
  });
  return res.data;
}

export async function getNextBarcode(): Promise<string> {
  const res = await axios.get<{ barcode: string }>("/api/products/next-barcode", {
    headers: authHeaders(),
  });
  return res.data.barcode;
}

export async function createProduct(payload: CreateProductPayload): Promise<ProductRecord> {
  const res = await axios.post<ProductRecord>("/api/products", payload, {
    headers: authHeaders(),
  });
  return res.data;
}

export async function updateProduct(id: number, payload: UpdateProductPayload): Promise<ProductRecord> {
  const res = await axios.put<ProductRecord>(`/api/products/${id}`, payload, {
    headers: authHeaders(),
  });
  return res.data;
}

export async function deleteProduct(id: number): Promise<{ message: string; soft: boolean }> {
  const res = await axios.delete<{ message: string; soft: boolean }>(`/api/products/${id}`, {
    headers: authHeaders(),
  });
  return res.data;
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
  const res = await axios.get<Category[]>("/api/categories", { headers: authHeaders() });
  return res.data;
}

export async function createCategory(payload: { category_name: string; description?: string }): Promise<Category> {
  const res = await axios.post<Category>("/api/categories", payload, { headers: authHeaders() });
  return res.data;
}

export async function updateCategory(id: number, payload: { category_name: string; description?: string }): Promise<Category> {
  const res = await axios.put<Category>(`/api/categories/${id}`, payload, { headers: authHeaders() });
  return res.data;
}

export async function deleteCategory(id: number): Promise<void> {
  await axios.delete(`/api/categories/${id}`, { headers: authHeaders() });
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

export async function getSuppliers(): Promise<Supplier[]> {
  const res = await axios.get<Supplier[]>("/api/suppliers", { headers: authHeaders() });
  return res.data;
}

// ─── Units ────────────────────────────────────────────────────────────────────

export async function getUnits(): Promise<Unit[]> {
  const res = await axios.get<Unit[]>("/api/units", { headers: authHeaders() });
  return res.data;
}

// ─── Cashier product lookup — search by barcode or name ──────────────────────

export interface CashierProduct {
  id: number;
  barcode: string;
  product_name: string;
  selling_price: number;
  quantity: number;       // current stock
  unit: string;
  unit_abbreviation: string;
  is_returnable: boolean;
  tax_type: TaxType;
  pricing_type: PricingType;
}

export async function lookupProduct(query: string): Promise<CashierProduct[]> {
  const res = await axios.get<CashierProduct[]>("/api/products/lookup", {
    headers: authHeaders(),
    params: { q: query },
  });
  return res.data;
}

// ─── Supplier mutations ────────────────────────────────────────────────────────

export interface CreateSupplierPayload {
  supplier_name: string;
  contact_person?: string | null;
  contact_number?: string | null;
  email?: string | null;
  address?: string | null;
  status?: "Active" | "Inactive";
}

export async function createSupplier(payload: CreateSupplierPayload): Promise<Supplier> {
  const res = await axios.post<Supplier>("/api/suppliers", payload, { headers: authHeaders() });
  return res.data;
}

export async function updateSupplier(id: number, payload: CreateSupplierPayload): Promise<Supplier> {
  const res = await axios.put<Supplier>(`/api/suppliers/${id}`, payload, { headers: authHeaders() });
  return res.data;
}

export async function deleteSupplier(id: number): Promise<void> {
  await axios.delete(`/api/suppliers/${id}`, { headers: authHeaders() });
}
