import { Router, Request, Response } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { logAuditEvent } from "../utils/auditLogger.js";

const router = Router();

router.use(authenticate);

function requireAdminOrClerk(req: Request, res: Response): boolean {
  if (req.user?.role !== "Admin" && req.user?.role !== "Inventory Clerk") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}

function requireAdmin(req: Request, res: Response): boolean {
  if (req.user?.role !== "Admin") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}

// ─── GET /api/inventory/summary — counts for dashboard cards ─────────────────
router.get("/summary", async (req: Request, res: Response) => {
  if (!requireAdminOrClerk(req, res)) return;

  try {
    const [rows] = await pool.execute<any[]>(`
      SELECT
        COUNT(*)                                                   AS total_products,
        SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END)             AS out_of_stock,
        SUM(CASE WHEN quantity > 0
                  AND quantity <= FLOOR(reorder_level * 0.5)
                 THEN 1 ELSE 0 END)                               AS critical,
        SUM(CASE WHEN quantity > FLOOR(reorder_level * 0.5)
                  AND quantity <= reorder_level
                 THEN 1 ELSE 0 END)                               AS low_stock,
        SUM(CASE WHEN quantity > reorder_level THEN 1 ELSE 0 END) AS in_stock,
        SUM(quantity)                                              AS total_units
      FROM products
      WHERE status = 'Active'
    `);
    res.status(200).json(rows[0]);
  } catch (err) {
    console.error("[inventory/GET /summary]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/inventory — stock levels for all active products ────────────────
router.get("/", async (req: Request, res: Response) => {
  if (!requireAdminOrClerk(req, res)) return;

  try {
    const { search, category_id, status, product_status } = req.query;

    // Default: show only Active products. Allow override via product_status=all or product_status=Inactive
    let where = "";
    const params: any[] = [];
    const productStatusVal = typeof product_status === "string" ? product_status.trim() : "";
    if (productStatusVal === "all") {
      where = "WHERE 1=1";
    } else if (productStatusVal === "Inactive" || productStatusVal === "Active") {
      where = "WHERE p.status = ?";
      params.push(productStatusVal);
    } else {
      where = "WHERE p.status = 'Active'";
    }

    if (search) {
      where += " AND (p.product_name LIKE ? OR p.barcode LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category_id) {
      where += " AND p.category_id = ?";
      params.push(Number(category_id));
    }
    if (status && status !== "all") {
      switch (status) {
        case "In Stock":
          where += " AND p.quantity > p.reorder_level"; break;
        case "Low Stock":
          where += " AND p.quantity > FLOOR(p.reorder_level * 0.5) AND p.quantity <= p.reorder_level"; break;
        case "Critical":
          where += " AND p.quantity > 0 AND p.quantity <= FLOOR(p.reorder_level * 0.5)"; break;
        case "Out of Stock":
          where += " AND p.quantity = 0"; break;
      }
    }

    const [rows] = await pool.execute<any[]>(`
      SELECT
        p.id,
        p.barcode,
        p.product_name,
        COALESCE(c.category_name, '—')  AS category,
        COALESCE(s.supplier_name, '—')  AS supplier,
        COALESCE(u.unit_name, '')        AS unit,
        COALESCE(u.abbreviation, '')     AS unit_abbreviation,
        COALESCE(u.unit_type, 'Other')  AS unit_type,
        COALESCE(u.allow_decimal, 0)    AS unit_allow_decimal,
        COALESCE(u.status, 'Active')    AS unit_status,
        p.quantity,
        p.reorder_level,
        p.damaged_stock,
        p.cost_price,
        p.selling_price,
        p.pricing_type,
        p.quantity_type,
        p.updated_at
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN suppliers  s ON s.id = p.supplier_id
      LEFT JOIN units      u ON u.id = p.unit_id
      ${where}
      ORDER BY
        CASE
          WHEN p.quantity = 0 THEN 0
          WHEN p.quantity <= FLOOR(p.reorder_level * 0.5) THEN 1
          WHEN p.quantity <= p.reorder_level THEN 2
          ELSE 3
        END,
        p.product_name ASC
    `, params);

    res.status(200).json(rows);
  } catch (err) {
    console.error("[inventory/GET /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/inventory/logs — movement history ───────────────────────────────
router.get("/logs", async (req: Request, res: Response) => {
  if (!requireAdminOrClerk(req, res)) return;

  try {
    const limit  = Math.min(1000, Math.max(1,  parseInt((req.query.limit  as string) || "50", 10)));
    const offset = Math.max(0, parseInt((req.query.offset as string) || "0",  10));
    const { product_id } = req.query;

    let where = "WHERE 1=1";
    const params: any[] = [];

    if (product_id) {
      where += " AND il.product_id = ?";
      params.push(parseInt(product_id as string, 10));
    }

    const [rows] = await pool.execute<any[]>(`
      SELECT
        il.id,
        il.product_id,
        p.product_name,
        p.barcode,
        COALESCE(units.abbreviation, '') AS unit_abbreviation,
        p.quantity_type,
        COALESCE(units.allow_decimal, 0) AS unit_allow_decimal,
        il.transaction_type,
        il.action,
        il.quantity_change,
        il.quantity,
        il.remaining_stock,
        il.reference,
        il.created_at,
        COALESCE(u.full_name, '—') AS performed_by
      FROM inventory_logs il
      LEFT JOIN products p ON p.id = il.product_id
      LEFT JOIN units ON units.id = p.unit_id
      LEFT JOIN users    u ON u.id = il.user_id
      ${where}
      ORDER BY il.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `, params);

    res.status(200).json(rows);
  } catch (err) {
    console.error("[inventory/GET /logs]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── Schemas for stock-in and stock-adjustment ─────────────────────────────────
const stockInItemSchema = z.object({
  product_id: z.number().int().positive(),
  // Accept decimals for commodity products (e.g. 100.5 kg).
  // Whole-number products continue to work unchanged.
  quantity_received: z.number().positive("Quantity must be greater than 0"),
  unit_cost: z.number().min(0).optional().nullable(),
});

const STOCK_IN_SOURCES = [
  "Supplier Delivery",
  "Direct Purchase",
] as const;

const stockInSchema = z.object({
  source: z.enum(STOCK_IN_SOURCES),
  supplier_id: z.number().int().positive().optional().nullable(),
  invoice_number: z.string().optional().nullable(),
  delivery_date: z.string().min(1, "Delivery date is required"),
  remarks: z.string().optional().nullable(),
  items: z.array(stockInItemSchema).min(1, "At least one item is required"),
});

const stockAdjustmentSchema = z.object({
  product_id: z.number().int().positive(),
  type: z.enum(["Damaged", "Lost", "Expired", "Correction"]),
  quantity: z.number().min(0),
  reason: z.string().min(1, "Reason is required")
});

// ─── POST /api/inventory/stock-in ─────────────────────────────────────────────
router.post("/stock-in", async (req: Request, res: Response) => {
  if (!requireAdminOrClerk(req, res)) return;

  const parsed = stockInSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }

  const { source, supplier_id, invoice_number, delivery_date, remarks, items } = parsed.data;
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Generate unique Stock In ID: SI-YYYYMMDD-NNNNNN (concurrency-safe row-locked sequence)
    const dateStr = delivery_date.replace(/-/g, "").slice(0, 8);
    const [seqRows] = await conn.execute<any[]>(
      `SELECT id, current_number FROM invoice_sequences WHERE prefix = 'SI' LIMIT 1 FOR UPDATE`
    );
    if (!seqRows[0]) {
      await conn.rollback();
      res.status(500).json({ message: "Stock-in sequence not found. Run migration 011." });
      return;
    }
    const nextSeq = (seqRows[0].current_number as number) + 1;
    await conn.execute(
      `UPDATE invoice_sequences SET current_number = ?, updated_at = NOW() WHERE id = ?`,
      [nextSeq, seqRows[0].id]
    );
    const stockInId = `SI-${dateStr}-${String(nextSeq).padStart(6, "0")}`;

    const reference = invoice_number?.trim() || stockInId;

    for (const item of items) {
      const [productRows] = await conn.execute<any[]>("SELECT id, quantity, product_name FROM products WHERE id = ? FOR UPDATE", [item.product_id]);
      if (productRows.length === 0) {
        await conn.rollback();
        res.status(404).json({ message: `Product ID ${item.product_id} not found` });
        return;
      }

      const product = productRows[0];
      const newQuantity = product.quantity + item.quantity_received;

      await conn.execute("UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?", [newQuantity, product.id]);
      await conn.execute(`
        INSERT INTO inventory_logs
          (product_id, transaction_type, action, quantity_change, quantity, remaining_stock, reference, user_id)
        VALUES (?, 'Stock In', 'Received Stock', ?, ?, ?, ?, ?)
      `, [
        item.product_id,
        item.quantity_received,
        product.quantity,
        newQuantity,
        reference,
        req.user?.id,
      ]);
    }

    await conn.commit();

    await logAuditEvent({
      action: "STOCK_RECEIVED",
      performedById: req.user!.id,
      performedByUsername: req.user!.username ?? "unknown",
      entityType: "inventory",
      newValues: { stock_in_id: stockInId, reference, source, item_count: items.length },
    });

    res.status(201).json({ message: "Stock in successful", stock_in_id: stockInId, reference });
  } catch (err) {
    await conn.rollback();
    console.error("[inventory/POST /stock-in]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

// ─── POST /api/inventory/stock-adjustment ─────────────────────────────────────
router.post("/stock-adjustment", async (req: Request, res: Response) => {
  if (!requireAdminOrClerk(req, res)) return;

  const parsed = stockAdjustmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }

  const { product_id, type, quantity, reason } = parsed.data;
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [productRows] = await conn.execute<any[]>("SELECT id, quantity, product_name, pricing_type FROM products WHERE id = ? FOR UPDATE", [product_id]);
    if (productRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: `Product ID ${product_id} not found` });
      return;
    }

    const product = productRows[0];

    // Block direct adjustments for Market-Based products
    if (product.pricing_type === "MARKET_BASED") {
      await conn.rollback();
      res.status(422).json({ message: "Market-Based products require the approval workflow. Use the Stock Count panel to submit adjustment requests." });
      return;
    }
    let newQuantity: number;
    let quantityChange: number;

    if (type === "Correction") {
      quantityChange = quantity - product.quantity;
      newQuantity = quantity;
    } else {
      if (quantity > product.quantity) {
        await conn.rollback();
        res.status(422).json({ message: "Insufficient stock for this adjustment" });
        return;
      }
      quantityChange = -quantity;
      newQuantity = product.quantity - quantity;
    }

    await conn.execute("UPDATE products SET quantity = ? WHERE id = ?", [newQuantity, product_id]);
    await conn.execute(`
      INSERT INTO inventory_logs 
        (product_id, transaction_type, action, quantity_change, quantity, remaining_stock, reference, user_id)
      VALUES (?, 'Adjustment', ?, ?, ?, ?, ?, ?)
    `, [product_id, type, quantityChange, product.quantity, newQuantity, reason, req.user?.id]);

    await conn.commit();

    await logAuditEvent({
      action: type === "Damaged" ? "DAMAGED_ITEM_RECORDED" : "STOCK_ADJUSTED",
      performedById: req.user!.id,
      performedByUsername: req.user!.username ?? "unknown",
      entityType: "products",
      entityId: product_id,
      reason,
      previousValues: { quantity: product.quantity },
      newValues: { quantity: newQuantity, adjustment_type: type },
    });

    res.status(201).json({ message: "Stock adjustment successful", product_id, type, new_quantity: newQuantity });
  } catch (err) {
    await conn.rollback();
    console.error("[inventory/POST /stock-adjustment]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

// ─── GET /api/inventory/notifications — clerk notifications ─────────────────────
router.get("/notifications", async (req: Request, res: Response) => {
  if (!requireAdminOrClerk(req, res)) return;

  try {
    // Get low stock and out of stock items
    const [stockAlertRows] = await pool.execute<any[]>(`
      SELECT
        p.id,
        p.product_name,
        p.barcode,
        p.quantity,
        p.reorder_level,
        p.updated_at,
        CASE
          WHEN p.quantity = 0 THEN 'out_of_stock'
          WHEN p.quantity <= FLOOR(p.reorder_level * 0.5) THEN 'critical'
          WHEN p.quantity <= p.reorder_level THEN 'low_stock'
        END AS alert_type
      FROM products p
      WHERE p.status = 'Active' AND p.quantity <= p.reorder_level
      ORDER BY
        CASE
          WHEN p.quantity = 0 THEN 0
          WHEN p.quantity <= FLOOR(p.reorder_level * 0.5) THEN 1
          ELSE 2
        END,
        p.product_name ASC
      LIMIT 10
    `);

    // Get recent stock-ins from last 24 hours
    const [recentStockInRows] = await pool.execute<any[]>(`
      SELECT
        il.id,
        il.reference,
        il.created_at,
        COUNT(*) AS item_count
      FROM inventory_logs il
      WHERE il.transaction_type = 'Stock In'
        AND il.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY il.reference, il.created_at, il.id
      ORDER BY il.created_at DESC
      LIMIT 5
    `);

    const notifications = [
      ...stockAlertRows.map((row) => ({
        id: `stock-${row.id}`,
        type: row.alert_type === 'out_of_stock' ? 'danger' : row.alert_type === 'critical' ? 'danger' : 'warning',
        message: row.alert_type === 'out_of_stock'
          ? `${row.product_name} is out of stock`
          : `${row.product_name} is below reorder level (${row.quantity} remaining)`,
        time: formatTimeAgo(row.updated_at || new Date()),
        product_id: row.id,
        product_name: row.product_name,
        quantity: row.quantity,
        reorder_level: row.reorder_level,
      })),
      ...recentStockInRows.map((row) => ({
        id: `stockin-${row.id}`,
        type: 'success',
        message: `Stock In ${row.reference} saved successfully (${row.item_count} items)`,
        time: formatTimeAgo(row.created_at),
        reference: row.reference,
      })),
    ];

    res.status(200).json({ notifications, unread_count: notifications.length });
  } catch (err) {
    console.error("[inventory/GET /notifications]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

function formatTimeAgo(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hr ago`;
  return `${Math.floor(diffHours / 24)} days ago`;
}

export default router;
