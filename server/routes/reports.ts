import { Router, Request, Response } from "express";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();
router.use(authenticate);
router.use(requireRole("Admin"));

// ─── GET /api/reports — full report data with date range ──────────────────────
router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      date_from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      date_to   = new Date().toISOString().slice(0, 10),
    } = req.query as Record<string, string>;

    // ── 1. Summary KPIs — exclude voided sales ───────────────────────────────
    const [summaryRows] = await pool.execute<any[]>(`
      SELECT
        COUNT(*)                          AS total_transactions,
        COALESCE(SUM(total_amount), 0)    AS total_revenue,
        COALESCE(SUM(vat_amount), 0)      AS total_vat,
        COALESCE(SUM(subtotal), 0)        AS total_subtotal,
        COALESCE(AVG(total_amount), 0)    AS avg_order_value,
        COALESCE(MAX(total_amount), 0)    AS largest_sale,
        COALESCE(MIN(total_amount), 0)    AS smallest_sale
      FROM sales
      WHERE DATE(created_at) BETWEEN ? AND ?
        AND void_status != 'voided'
    `, [date_from, date_to]);

    // ── 2. Daily sales breakdown — exclude voided ────────────────────────────
    const [dailyRows] = await pool.execute<any[]>(`
      SELECT
        DATE(created_at)                  AS sale_date,
        COUNT(*)                          AS transactions,
        COALESCE(SUM(subtotal), 0)        AS subtotal,
        COALESCE(SUM(vat_amount), 0)      AS vat,
        COALESCE(SUM(total_amount), 0)    AS total
      FROM sales
      WHERE DATE(created_at) BETWEEN ? AND ?
        AND void_status != 'voided'
      GROUP BY DATE(created_at)
      ORDER BY sale_date ASC
    `, [date_from, date_to]);

    // ── 3. Top products — exclude voided sales ───────────────────────────────
    const [topProductRows] = await pool.execute<any[]>(`
      SELECT
        p.barcode,
        p.product_name,
        COALESCE(c.category_name, '—')  AS category,
        SUM(si.quantity)                AS units_sold,
        COALESCE(SUM(si.subtotal), 0)   AS revenue,
        si.unit_price
      FROM sale_items si
      JOIN products  p ON p.id = si.product_id
      JOIN sales     s ON s.id = si.sale_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
        AND s.void_status != 'voided'
      GROUP BY si.product_id, p.product_name, p.barcode, c.category_name, si.unit_price
      ORDER BY units_sold DESC
      LIMIT 20
    `, [date_from, date_to]);

    // ── 4. Sales per cashier — exclude voided ────────────────────────────────
    const [cashierRows] = await pool.execute<any[]>(`
      SELECT
        u.full_name                       AS cashier,
        COUNT(s.id)                       AS transactions,
        COALESCE(SUM(s.total_amount), 0)  AS revenue
      FROM sales s
      JOIN users u ON u.id = s.cashier_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
        AND s.void_status != 'voided'
      GROUP BY s.cashier_id, u.full_name
      ORDER BY revenue DESC
    `, [date_from, date_to]);

    // ── 5. VAT Classification Summary (Implementation 5) ────────────────────
    // Summarizes from sale_items.tax_type — historical values are preserved.
    const [vatSummaryRows] = await pool.execute<any[]>(`
      SELECT
        si.tax_type,
        COALESCE(SUM(si.taxable_amount), 0) AS taxable_sales,
        COALESCE(SUM(si.vat_amount), 0)     AS vat_amount,
        COALESCE(SUM(si.subtotal), 0)       AS gross_amount
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
        AND s.void_status != 'voided'
      GROUP BY si.tax_type
    `, [date_from, date_to]);

    // Build structured VAT summary
    const vatMap: Record<string, { taxable_sales: number; vat_amount: number; gross_amount: number }> = {
      VATABLE:     { taxable_sales: 0, vat_amount: 0, gross_amount: 0 },
      VAT_EXEMPT:  { taxable_sales: 0, vat_amount: 0, gross_amount: 0 },
      ZERO_RATED:  { taxable_sales: 0, vat_amount: 0, gross_amount: 0 },
      NON_TAXABLE: { taxable_sales: 0, vat_amount: 0, gross_amount: 0 },
    };
    for (const row of vatSummaryRows as any[]) {
      if (vatMap[row.tax_type]) {
        vatMap[row.tax_type] = {
          taxable_sales: Number(row.taxable_sales),
          vat_amount:    Number(row.vat_amount),
          gross_amount:  Number(row.gross_amount),
        };
      }
    }
    const totalVatAmount = Object.values(vatMap).reduce((s, v) => s + v.vat_amount, 0);
    const totalSales     = Object.values(vatMap).reduce((s, v) => s + v.gross_amount, 0);

    const vat_summary = {
      vatable_sales:    vatMap.VATABLE.taxable_sales,
      vat_exempt_sales: vatMap.VAT_EXEMPT.gross_amount,
      zero_rated_sales: vatMap.ZERO_RATED.gross_amount,
      non_taxable_sales: vatMap.NON_TAXABLE.gross_amount,
      total_vat_amount: totalVatAmount,
      total_sales:      totalSales,
      by_type:          vatMap,
    };

    // ── 6. Current inventory / stock level report ────────────────────────────
    const [inventoryRows] = await pool.execute<any[]>(`
      SELECT
        p.barcode,
        p.product_name,
        COALESCE(c.category_name, '—')  AS category,
        COALESCE(s.supplier_name, '—')  AS supplier,
        COALESCE(u.abbreviation, '')     AS unit,
        p.quantity,
        p.reorder_level,
        p.damaged_stock,
        p.cost_price,
        p.selling_price,
        CASE
          WHEN p.quantity = 0                              THEN 'Out of Stock'
          WHEN p.quantity <= FLOOR(p.reorder_level * 0.5) THEN 'Critical'
          WHEN p.quantity <= p.reorder_level               THEN 'Low Stock'
          ELSE                                                  'In Stock'
        END AS stock_status
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN suppliers  s ON s.id = p.supplier_id
      LEFT JOIN units      u ON u.id = p.unit_id
      WHERE p.status = 'Active'
      ORDER BY p.product_name ASC
    `);

    const lowStockRows = (inventoryRows as any[]).filter(
      (r) => r.stock_status !== "In Stock"
    );

    res.status(200).json({
      period:       { date_from, date_to },
      summary:      summaryRows[0],
      daily_sales:  dailyRows,
      top_products: topProductRows,
      by_cashier:   cashierRows,
      vat_summary,
      inventory:    inventoryRows,
      low_stock:    lowStockRows,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[reports/GET /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

export default router;
