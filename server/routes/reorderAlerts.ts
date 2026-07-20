import { Router, Request, Response } from "express";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();
router.use(authenticate);
router.use(requireRole("Admin"));

// ─── GET /api/reorder-alerts ──────────────────────────────────────────────────
// Returns all active products that are at or below reorder level,
// sorted by urgency (out of stock first, then critical, then low stock)
router.get("/", async (req: Request, res: Response) => {
  try {
    const { category_id } = req.query;

    let where = `WHERE p.status = 'Active' AND p.quantity <= p.reorder_level`;
    const params: any[] = [];

    if (category_id) {
      where += " AND p.category_id = ?";
      params.push(Number(category_id));
    }

    const [rows] = await pool.execute<any[]>(`
      SELECT
        p.id,
        p.barcode,
        p.product_name,
        COALESCE(c.category_name, '—')  AS category,
        COALESCE(s.supplier_name, '—')  AS supplier,
        s.contact_number                AS supplier_contact,
        COALESCE(u.unit_name, '')        AS unit,
        COALESCE(u.abbreviation, '')     AS unit_abbreviation,
        p.quantity,
        p.reorder_level,
        p.cost_price,
        p.selling_price,
        -- urgency level: 0 = out of stock, 1 = critical, 2 = low stock
        CASE
          WHEN p.quantity = 0                               THEN 'Out of Stock'
          WHEN p.quantity <= FLOOR(p.reorder_level * 0.5)  THEN 'Critical'
          ELSE                                                   'Low Stock'
        END AS urgency,
        -- units needed to reach reorder level
        (p.reorder_level - p.quantity)  AS units_needed
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN suppliers  s ON s.id = p.supplier_id
      LEFT JOIN units      u ON u.id = p.unit_id
      ${where}
      ORDER BY
        CASE
          WHEN p.quantity = 0                               THEN 0
          WHEN p.quantity <= FLOOR(p.reorder_level * 0.5)  THEN 1
          ELSE                                                   2
        END,
        p.product_name ASC
    `, params);

    res.status(200).json(rows);
  } catch (err) {
    console.error("[reorder-alerts/GET /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/reorder-alerts/summary ─────────────────────────────────────────
router.get("/summary", async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute<any[]>(`
      SELECT
        COUNT(*)                                                                  AS total_alerts,
        SUM(CASE WHEN p.quantity = 0 THEN 1 ELSE 0 END)                          AS out_of_stock,
        SUM(CASE WHEN p.quantity > 0
                  AND p.quantity <= FLOOR(p.reorder_level * 0.5) THEN 1 ELSE 0 END) AS critical,
        SUM(CASE WHEN p.quantity > FLOOR(p.reorder_level * 0.5)
                  AND p.quantity <= p.reorder_level THEN 1 ELSE 0 END)            AS low_stock
      FROM products p
      WHERE p.status = 'Active' AND p.quantity <= p.reorder_level
    `);
    res.status(200).json(rows[0]);
  } catch (err) {
    console.error("[reorder-alerts/GET /summary]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

export default router;
