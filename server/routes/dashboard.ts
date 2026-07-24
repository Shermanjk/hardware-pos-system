import { Router, Request, Response } from "express";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();
router.use(authenticate);
router.use(requireRole("Admin"));

// ─── GET /api/dashboard/pending-counts — counts for Admin requires attention ───
router.get("/pending-counts", async (_req: Request, res: Response) => {
  try {
    const [commodityPending] = await pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM commodity_purchases WHERE status = 'PENDING_APPROVAL'"
    );
    const [returnsPending] = await pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM returns WHERE status = 'pending'"
    );
    const [voidsPending] = await pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM sale_voids WHERE status = 'pending'"
    );
    
    res.status(200).json({
      pending_commodity_approvals: Number(commodityPending[0]?.count || 0),
      pending_returns: Number(returnsPending[0]?.count || 0),
      pending_voids: Number(voidsPending[0]?.count || 0),
    });
  } catch (err) {
    console.error("[dashboard/GET /pending-counts]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/dashboard — all KPIs in one round-trip ─────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  try {
    const today      = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + "-01";

    // ── Today's sales ────────────────────────────────────────────────────────
    const [todayRows] = await pool.execute<any[]>(`
      SELECT
        COUNT(*)            AS today_transactions,
        COALESCE(SUM(total_amount), 0) AS today_revenue
      FROM sales
      WHERE DATE(created_at) = ?
        AND void_status != 'voided'
    `, [today]);

    // ── Monthly sales ────────────────────────────────────────────────────────
    const [monthRows] = await pool.execute<any[]>(`
      SELECT COALESCE(SUM(total_amount), 0) AS monthly_revenue
      FROM sales
      WHERE DATE(created_at) >= ?
        AND void_status != 'voided'
    `, [monthStart]);

    // ── Product counts ───────────────────────────────────────────────────────
    const [productRows] = await pool.execute<any[]>(`
      SELECT
        COUNT(*)                                                                AS total_products,
        SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END)                          AS out_of_stock,
        SUM(CASE WHEN quantity > 0 AND quantity <= reorder_level THEN 1 ELSE 0 END) AS low_stock
      FROM products
      WHERE status = 'Active'
    `);

    // ── Supplier count ───────────────────────────────────────────────────────
    const [supplierRows] = await pool.execute<any[]>(`
      SELECT COUNT(*) AS total_suppliers FROM suppliers WHERE status = 'Active'
    `);

    // ── Pending returns ──────────────────────────────────────────────────────
    const [returnsRows] = await pool.execute<any[]>(`
      SELECT COUNT(*) AS pending_returns FROM returns WHERE status = 'pending'
    `);

    // ── Daily sales for the last 7 days ──────────────────────────────────────
    const [weeklyRows] = await pool.execute<any[]>(`
      SELECT
        DATE(created_at)               AS sale_date,
        COUNT(*)                        AS transactions,
        COALESCE(SUM(total_amount), 0)  AS revenue
      FROM sales
      WHERE DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        AND void_status != 'voided'
      GROUP BY DATE(created_at)
      ORDER BY sale_date ASC
    `);

    // ── Monthly revenue for last 6 months ────────────────────────────────────
    const [monthlyRows] = await pool.execute<any[]>(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m') AS month,
        COALESCE(SUM(total_amount), 0)   AS revenue
      FROM sales
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH)
        AND void_status != 'voided'
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month ASC
    `);

    // ── Top 5 selling products (by qty sold, all time) ───────────────────────
    const [topProductRows] = await pool.execute<any[]>(`
      SELECT
        p.product_name AS name,
        SUM(si.quantity) AS units_sold,
        SUM(si.subtotal) AS revenue
      FROM sale_items si
      JOIN products p ON p.id = si.product_id
      JOIN sales s ON s.id = si.sale_id
      WHERE s.void_status != 'voided'
      GROUP BY si.product_id, p.product_name
      ORDER BY units_sold DESC
      LIMIT 5
    `);

    // ── Recent 8 sales ───────────────────────────────────────────────────────
    const [recentSalesRows] = await pool.execute<any[]>(`
      SELECT
        s.invoice_number,
        s.customer_name,
        s.total_amount,
        u.full_name AS cashier_name,
        s.created_at
      FROM sales s
      JOIN users u ON u.id = s.cashier_id
      WHERE s.void_status != 'voided'
      ORDER BY s.created_at DESC
      LIMIT 8
    `);

    // ── Low stock items (top 5 most urgent) ──────────────────────────────────
    const [lowStockRows] = await pool.execute<any[]>(`
      SELECT
        p.product_name,
        p.barcode,
        p.quantity,
        p.reorder_level,
        CASE
          WHEN p.quantity = 0 THEN 'Out of Stock'
          WHEN p.quantity <= FLOOR(p.reorder_level * 0.5) THEN 'Critical'
          ELSE 'Low Stock'
        END AS urgency
      FROM products p
      WHERE p.status = 'Active' AND p.quantity <= p.reorder_level
      ORDER BY p.quantity ASC
      LIMIT 5
    `);

    res.status(200).json({
      kpis: {
        today_transactions: Number(todayRows[0].today_transactions),
        today_revenue:      Number(todayRows[0].today_revenue),
        monthly_revenue:    Number(monthRows[0].monthly_revenue),
        total_products:     Number(productRows[0].total_products),
        out_of_stock:       Number(productRows[0].out_of_stock),
        low_stock:          Number(productRows[0].low_stock),
        total_suppliers:    Number(supplierRows[0].total_suppliers),
        pending_returns:    Number(returnsRows[0].pending_returns),
      },
      weekly_sales:   weeklyRows,
      monthly_sales:  monthlyRows,
      top_products:   topProductRows,
      recent_sales:   recentSalesRows,
      low_stock_items: lowStockRows,
    });
  } catch (err) {
    console.error("[dashboard/GET /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

export default router;
