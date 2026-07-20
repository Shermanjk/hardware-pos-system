import { Router, Request, Response } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";

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
    const { search, category_id, status } = req.query;

    let where = "WHERE p.status = 'Active'";
    const params: any[] = [];

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
        p.quantity,
        p.reorder_level,
        p.damaged_stock,
        p.cost_price,
        p.selling_price,
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
    const { product_id, limit = "50", offset = "0" } = req.query;

    let where = "WHERE 1=1";
    const params: any[] = [];

    if (product_id) {
      where += " AND il.product_id = ?";
      params.push(Number(product_id));
    }

    params.push(Number(limit), Number(offset));

    const [rows] = await pool.execute<any[]>(`
      SELECT
        il.id,
        il.product_id,
        p.product_name,
        p.barcode,
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
      LEFT JOIN users    u ON u.id = il.user_id
      ${where}
      ORDER BY il.created_at DESC
      LIMIT ? OFFSET ?
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
  quantity_received: z.number().int().positive(),
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
  quantity: z.number().int().positive(),
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

    // Generate unique Stock In ID: SI-YYYYMMDD-XXXX
    const dateStr = delivery_date.replace(/-/g, "").slice(0, 8);
    const [countRows] = await conn.execute<any[]>(
      `SELECT COUNT(*) AS cnt FROM inventory_logs WHERE transaction_type = 'Stock In' AND DATE(created_at) = CURDATE()`
    );
    const seq = String((countRows[0]?.cnt ?? 0) + 1).padStart(4, "0");
    const stockInId = `SI-${dateStr}-${seq}`;

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

    const [productRows] = await conn.execute<any[]>("SELECT id, quantity, product_name FROM products WHERE id = ? FOR UPDATE", [product_id]);
    if (productRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: `Product ID ${product_id} not found` });
      return;
    }

    const product = productRows[0];
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

    res.status(201).json({ message: "Stock adjustment successful", product_id, type, new_quantity: newQuantity });
  } catch (err) {
    await conn.rollback();
    console.error("[inventory/POST /stock-adjustment]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

export default router;
