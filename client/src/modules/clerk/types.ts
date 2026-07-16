// ─── Clerk User ──────────────────────────────────────────────────────────────

export interface ClerkUser {
  id: number;
  name: string;
  username: string;
  role: "inventory_clerk";
  avatar: string; // initials
}

// ─── Core Entities ───────────────────────────────────────────────────────────

export interface Supplier {
  id: number;
  name: string;
  contact: string;
  address: string;
}

export interface Product {
  id: number;
  barcode: string;
  name: string;
  category: string;
  supplier: string;
  supplierId: number;
  unit: string;
  quantity: number;
  reorderLevel: number;
  costPrice: number;
  description?: string;
  status: "In Stock" | "Low Stock" | "Critical" | "Out of Stock";
}

// ─── Stock In ────────────────────────────────────────────────────────────────

export interface StockInItem {
  productId: number;
  barcode: string;
  productName: string;
  unit: string;
  currentStock: number;
  costPrice: number;
  quantityReceived: number;
}

export interface StockInSession {
  id: string;
  supplierId: number;
  supplierName: string;
  invoiceNumber: string;
  date: string;
  notes?: string;
  items: StockInItem[];
}

// ─── Stock Adjustment ────────────────────────────────────────────────────────

export type AdjustmentType = "Damaged" | "Lost" | "Expired" | "Correction";

export interface StockAdjustment {
  id: string;
  productId: number;
  productName: string;
  barcode: string;
  adjustmentType: AdjustmentType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string;
  date: string;
  performedBy: string;
}

// ─── Stock Count ─────────────────────────────────────────────────────────────

export interface StockCountRow {
  productId: number;
  barcode: string;
  productName: string;
  category: string;
  systemQuantity: number;
  physicalCount: number | "";
  difference: number;
  remarks: string;
}

// ─── Logs ────────────────────────────────────────────────────────────────────

export type ActivityAction =
  | "Received Stock"
  | "Stock Adjustment"
  | "Printed Barcode"
  | "Completed Stock Count"
  | "Stock In Saved";

export interface ActivityLog {
  id: string;
  action: ActivityAction;
  product: string;
  qtyChange: string;
  performedBy: string;
  timestamp: string;
}
