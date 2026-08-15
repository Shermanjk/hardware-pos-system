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
    const [creditOverridesPending] = await pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM credit_limit_overrides WHERE status = 'pending'"
    );
    
    res.status(200).json({
      pending_commodity_approvals: Number(commodityPending[0]?.count || 0),
      pending_returns: Number(returnsPending[0]?.count || 0),
      pending_voids: Number(voidsPending[0]?.count || 0),
      pending_credit_overrides: Number(creditOverridesPending[0]?.count || 0),
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
        COALESCE(SUM(total_amount), 0) AS today_gross_revenue
      FROM sales
      WHERE DATE(created_at) = ?
        AND void_status != 'voided'
    `, [today]);

    const [todayRefunds] = await pool.execute<any[]>(`
      SELECT COALESCE(SUM(r.refund_amount), 0) AS today_refunds
      FROM returns r
      JOIN sales s ON s.id = r.sale_id
      WHERE DATE(r.resolved_at) = ?
        AND r.status = 'completed'
        AND s.void_status != 'voided'
    `, [today]);

    const today_revenue = Number(todayRows[0].today_gross_revenue) - Number(todayRefunds[0].today_refunds);

    // ── Monthly sales ────────────────────────────────────────────────────────
    const [monthRows] = await pool.execute<any[]>(`
      SELECT COALESCE(SUM(total_amount), 0) AS monthly_gross_revenue
      FROM sales
      WHERE DATE(created_at) >= ?
        AND void_status != 'voided'
    `, [monthStart]);

    const [monthRefunds] = await pool.execute<any[]>(`
      SELECT COALESCE(SUM(r.refund_amount), 0) AS month_refunds
      FROM returns r
      JOIN sales s ON s.id = r.sale_id
      WHERE DATE(r.resolved_at) >= ?
        AND r.status = 'completed'
        AND s.void_status != 'voided'
    `, [monthStart]);

    const monthly_revenue = Number(monthRows[0].monthly_gross_revenue) - Number(monthRefunds[0].month_refunds);

    // ── Product counts ───────────────────────────────────────────────────────
    const [productRows] = await pool.execute<any[]>(`
      SELECT
        COUNT(*)                                                                AS total_products,
        SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END)                          AS out_of_stock,
        SUM(CASE WHEN quantity > 0 AND quantity <= FLOOR(reorder_level * 0.5) THEN 1 ELSE 0 END) AS critical,
        SUM(CASE WHEN quantity > FLOOR(reorder_level * 0.5) AND quantity <= reorder_level THEN 1 ELSE 0 END) AS low_stock
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

    // ── Accounts Receivable / Utang ──────────────────────────────────────────
    const [arRows] = await pool.execute<any[]>(`
      SELECT
        COALESCE(SUM(current_balance), 0) AS total_receivables,
        COUNT(CASE WHEN current_balance > 0 THEN 1 END) AS customers_with_balance
      FROM customers
      WHERE status = 'Active'
    `);

    // ── Daily sales for the last 7 days ──────────────────────────────────────
    const [weeklyRows] = await pool.execute<any[]>(`
      SELECT
        DATE_FORMAT(s.created_at, '%Y-%m-%d') AS sale_date,
        COUNT(*)                              AS transactions,
        COALESCE(SUM(s.total_amount), 0)      AS gross_revenue
      FROM sales s
      WHERE DATE(s.created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        AND s.void_status != 'voided'
      GROUP BY DATE_FORMAT(s.created_at, '%Y-%m-%d')
      ORDER BY sale_date ASC
    `);

    // Get refunds for each day to subtract from gross revenue
    const [weeklyRefunds] = await pool.execute<any[]>(`
      SELECT
        DATE_FORMAT(r.resolved_at, '%Y-%m-%d') AS sale_date,
        COALESCE(SUM(r.refund_amount), 0)      AS refunds
      FROM returns r
      JOIN sales s ON s.id = r.sale_id
      WHERE DATE(r.resolved_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        AND r.status = 'completed'
        AND s.void_status != 'voided'
      GROUP BY DATE_FORMAT(r.resolved_at, '%Y-%m-%d')
    `);

    // Merge refunds into weekly data
    const refundMap = new Map(weeklyRefunds.map((r: any) => [r.sale_date, Number(r.refunds)]));
    const weekly_sales = weeklyRows.map((row: any) => ({
      sale_date: row.sale_date,
      transactions: row.transactions,
      revenue: Number(row.gross_revenue) - (refundMap.get(row.sale_date) || 0)
    }));

    // ── Monthly revenue for last 6 months ────────────────────────────────────
    const [monthlyRows] = await pool.execute<any[]>(`
      SELECT
        DATE_FORMAT(s.created_at, '%Y-%m') AS month,
        COALESCE(SUM(s.total_amount), 0)   AS gross_revenue
      FROM sales s
      WHERE s.created_at >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH)
        AND s.void_status != 'voided'
      GROUP BY DATE_FORMAT(s.created_at, '%Y-%m')
      ORDER BY month ASC
    `);

    // Get refunds for each month
    const [monthlyRefunds] = await pool.execute<any[]>(`
      SELECT
        DATE_FORMAT(r.resolved_at, '%Y-%m') AS month,
        COALESCE(SUM(r.refund_amount), 0) AS refunds
      FROM returns r
      JOIN sales s ON s.id = r.sale_id
      WHERE r.resolved_at >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH)
        AND r.status = 'completed'
        AND s.void_status != 'voided'
      GROUP BY DATE_FORMAT(r.resolved_at, '%Y-%m')
    `);

    // Merge refunds into monthly data
    const monthlyRefundMap = new Map(monthlyRefunds.map((r: any) => [r.month, Number(r.refunds)]));
    const monthly_sales = monthlyRows.map((row: any) => ({
      month: row.month,
      revenue: Number(row.gross_revenue) - (monthlyRefundMap.get(row.month) || 0)
    }));

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
        today_transactions:     Number(todayRows[0].today_transactions),
        today_revenue:          today_revenue,
        monthly_revenue:        monthly_revenue,
        total_products:         Number(productRows[0].total_products),
        out_of_stock:           Number(productRows[0].out_of_stock),
        critical:               Number(productRows[0].critical),
        low_stock:              Number(productRows[0].low_stock),
        total_suppliers:        Number(supplierRows[0].total_suppliers),
        pending_returns:        Number(returnsRows[0].pending_returns),
        total_receivables:      Number(arRows[0].total_receivables),
        customers_with_balance: Number(arRows[0].customers_with_balance),
      },
      weekly_sales:   weekly_sales,
      monthly_sales:  monthly_sales,
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
