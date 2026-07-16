import type { Product, Supplier, ActivityLog } from "./types";

// ─── Suppliers ───────────────────────────────────────────────────────────────

export const mockSuppliers: Supplier[] = [
  { id: 1, name: "BuildCo Supplies", contact: "09171234567", address: "123 Industrial Ave, Manila" },
  { id: 2, name: "Hardware Plus", contact: "09281234567", address: "456 Commerce St, Quezon City" },
  { id: 3, name: "Industrial Tools Inc.", contact: "09391234567", address: "789 Trade Rd, Makati" },
  { id: 4, name: "Metro Hardware Depot", contact: "09501234567", address: "321 Supply Blvd, Pasig" },
  { id: 5, name: "Builders World", contact: "09611234567", address: "654 Material Ave, Taguig" },
];

// ─── Products ────────────────────────────────────────────────────────────────

export const mockProducts: Product[] = [
  { id: 1,  barcode: "HW-001", name: "Claw Hammer 16oz",         category: "Hand Tools",     supplier: "BuildCo Supplies",       supplierId: 1, unit: "pcs",     quantity: 45,  reorderLevel: 20,  costPrice: 185.00,  status: "In Stock"   },
  { id: 2,  barcode: "HW-002", name: "Common Nails 2\"",         category: "Fasteners",      supplier: "Hardware Plus",          supplierId: 2, unit: "boxes",   quantity: 5,   reorderLevel: 30,  costPrice: 45.00,   status: "Critical"   },
  { id: 3,  barcode: "HW-003", name: "Phillips Screws #8",       category: "Fasteners",      supplier: "Hardware Plus",          supplierId: 2, unit: "boxes",   quantity: 120, reorderLevel: 50,  costPrice: 60.00,   status: "In Stock"   },
  { id: 4,  barcode: "HW-004", name: "Wood Glue 500ml",          category: "Adhesives",      supplier: "BuildCo Supplies",       supplierId: 1, unit: "bottles", quantity: 3,   reorderLevel: 15,  costPrice: 95.00,   status: "Critical"   },
  { id: 5,  barcode: "HW-005", name: "HSS Drill Bit Set 13pcs",  category: "Power Tool Acc", supplier: "Industrial Tools Inc.",  supplierId: 3, unit: "sets",    quantity: 28,  reorderLevel: 10,  costPrice: 320.00,  status: "In Stock"   },
  { id: 6,  barcode: "HW-006", name: "PVC Pipe 1/2\" x 3m",     category: "Plumbing",       supplier: "Metro Hardware Depot",   supplierId: 4, unit: "lengths", quantity: 18,  reorderLevel: 20,  costPrice: 75.00,   status: "Low Stock"  },
  { id: 7,  barcode: "HW-007", name: "Electrical Tape Black",    category: "Electrical",     supplier: "Builders World",         supplierId: 5, unit: "rolls",   quantity: 60,  reorderLevel: 25,  costPrice: 25.00,   status: "In Stock"   },
  { id: 8,  barcode: "HW-008", name: "Measuring Tape 5m",        category: "Hand Tools",     supplier: "BuildCo Supplies",       supplierId: 1, unit: "pcs",     quantity: 14,  reorderLevel: 15,  costPrice: 145.00,  status: "Low Stock"  },
  { id: 9,  barcode: "HW-009", name: "Sandpaper Grit 120",       category: "Abrasives",      supplier: "Hardware Plus",          supplierId: 2, unit: "sheets",  quantity: 200, reorderLevel: 100, costPrice: 8.00,    status: "In Stock"   },
  { id: 10, barcode: "HW-010", name: "Paint Roller 9\"",         category: "Painting",       supplier: "Builders World",         supplierId: 5, unit: "pcs",     quantity: 9,   reorderLevel: 10,  costPrice: 65.00,   status: "Low Stock"  },
  { id: 11, barcode: "HW-011", name: "G.I. Wire Gauge 16",       category: "Fasteners",      supplier: "Metro Hardware Depot",   supplierId: 4, unit: "rolls",   quantity: 22,  reorderLevel: 10,  costPrice: 380.00,  status: "In Stock"   },
  { id: 12, barcode: "HW-012", name: "Hacksaw Frame",            category: "Hand Tools",     supplier: "Industrial Tools Inc.",  supplierId: 3, unit: "pcs",     quantity: 7,   reorderLevel: 8,   costPrice: 215.00,  status: "Low Stock"  },
  { id: 13, barcode: "HW-013", name: "Concrete Hollow Block",    category: "Construction",   supplier: "BuildCo Supplies",       supplierId: 1, unit: "pcs",     quantity: 500, reorderLevel: 200, costPrice: 12.00,   status: "In Stock"   },
  { id: 14, barcode: "HW-014", name: "Portland Cement 40kg",     category: "Construction",   supplier: "Metro Hardware Depot",   supplierId: 4, unit: "bags",    quantity: 0,   reorderLevel: 50,  costPrice: 265.00,  status: "Out of Stock"},
  { id: 15, barcode: "HW-015", name: "Angle Grinder Disc 4\"",   category: "Power Tool Acc", supplier: "Industrial Tools Inc.",  supplierId: 3, unit: "pcs",     quantity: 35,  reorderLevel: 20,  costPrice: 45.00,   status: "In Stock"   },
  { id: 16, barcode: "HW-016", name: "Spray Paint Gloss Black",  category: "Painting",       supplier: "Builders World",         supplierId: 5, unit: "cans",    quantity: 12,  reorderLevel: 15,  costPrice: 120.00,  status: "Low Stock"  },
  { id: 17, barcode: "HW-017", name: "Safety Gloves Large",      category: "Safety",         supplier: "Hardware Plus",          supplierId: 2, unit: "pairs",   quantity: 40,  reorderLevel: 20,  costPrice: 55.00,   status: "In Stock"   },
  { id: 18, barcode: "HW-018", name: "Wire Stripper",            category: "Electrical",     supplier: "Industrial Tools Inc.",  supplierId: 3, unit: "pcs",     quantity: 6,   reorderLevel: 8,   costPrice: 175.00,  status: "Low Stock"  },
  { id: 19, barcode: "HW-019", name: "Flat Washer 1/2\"",        category: "Fasteners",      supplier: "Metro Hardware Depot",   supplierId: 4, unit: "packs",   quantity: 80,  reorderLevel: 40,  costPrice: 18.00,   status: "In Stock"   },
  { id: 20, barcode: "HW-020", name: "Putty Knife 3\"",          category: "Hand Tools",     supplier: "BuildCo Supplies",       supplierId: 1, unit: "pcs",     quantity: 15,  reorderLevel: 10,  costPrice: 85.00,   status: "In Stock"   },
];

// ─── Activity Logs ───────────────────────────────────────────────────────────

export const mockActivityLogs: ActivityLog[] = [
  { id: "AL-001", action: "Received Stock",       product: "Claw Hammer 16oz",      qtyChange: "+50",  performedBy: "Maria Santos", timestamp: "2025-01-15 08:32 AM" },
  { id: "AL-002", action: "Stock Adjustment",     product: "Common Nails 2\"",       qtyChange: "-10",  performedBy: "Maria Santos", timestamp: "2025-01-15 09:15 AM" },
  { id: "AL-003", action: "Received Stock",       product: "Portland Cement 40kg",  qtyChange: "+100", performedBy: "Maria Santos", timestamp: "2025-01-15 10:05 AM" },
  { id: "AL-004", action: "Printed Barcode",      product: "HSS Drill Bit Set 13pcs", qtyChange: "—",  performedBy: "Maria Santos", timestamp: "2025-01-15 10:48 AM" },
  { id: "AL-005", action: "Stock Adjustment",     product: "Wood Glue 500ml",       qtyChange: "-2",   performedBy: "Maria Santos", timestamp: "2025-01-15 11:20 AM" },
  { id: "AL-006", action: "Received Stock",       product: "Phillips Screws #8",    qtyChange: "+200", performedBy: "Maria Santos", timestamp: "2025-01-14 02:15 PM" },
  { id: "AL-007", action: "Completed Stock Count", product: "All Products",         qtyChange: "—",    performedBy: "Maria Santos", timestamp: "2025-01-14 04:00 PM" },
  { id: "AL-008", action: "Received Stock",       product: "PVC Pipe 1/2\" x 3m",  qtyChange: "+40",  performedBy: "Maria Santos", timestamp: "2025-01-13 09:00 AM" },
  { id: "AL-009", action: "Stock Adjustment",     product: "Angle Grinder Disc 4\"", qtyChange: "-5",  performedBy: "Maria Santos", timestamp: "2025-01-13 11:30 AM" },
  { id: "AL-010", action: "Printed Barcode",      product: "Measuring Tape 5m",     qtyChange: "—",    performedBy: "Maria Santos", timestamp: "2025-01-13 03:45 PM" },
];

// ─── Unique categories / suppliers for filters ───────────────────────────────

export const mockCategories = [
  "Hand Tools", "Fasteners", "Adhesives", "Power Tool Acc", "Plumbing",
  "Electrical", "Abrasives", "Painting", "Construction", "Safety",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Derive status from quantity vs reorderLevel */
export function deriveStatus(quantity: number, reorderLevel: number): Product["status"] {
  if (quantity === 0) return "Out of Stock";
  if (quantity <= reorderLevel * 0.5) return "Critical";
  if (quantity <= reorderLevel) return "Low Stock";
  return "In Stock";
}
