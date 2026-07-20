import { Router, Request, Response } from "express";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();

router.use(authenticate);
router.use(requireRole("Admin"));

// ─── GET /api/inventory/summary — counts for dashboard cards ─────────────────
router.get("/summary", async (_req: Request, res: Response) => {
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

export default router;
