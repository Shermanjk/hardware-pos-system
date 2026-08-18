import { Request, Response, Router } from "express";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();
router.use(authenticate);
router.use(requireRole("Admin"));

// ─── GET /api/reports — full report data with date range & filters ───────────
router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      date_from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      date_to   = new Date().toISOString().slice(0, 10),
      report_type = "full",
      category_id,
      cashier_id,
    } = req.query as Record<string, string>;

    const categoryFilter = category_id ? "AND p.category_id = ?" : "";
    const categoryParams = category_id ? [Number(category_id)] : [];
    const cashierFilter = cashier_id ? "AND s.cashier_id = ?" : "";
    const cashierParams = cashier_id ? [Number(cashier_id)] : [];

    // ── 1. Summary KPIs — exclude voided sales ───────────────────────────────
    const [summaryRows] = await pool.execute<any[]>(`
      SELECT
        COUNT(*)                          AS total_transactions,
        COALESCE(SUM(total_amount), 0)    AS gross_revenue,
        COALESCE(SUM(vat_amount), 0)      AS total_vat,
        COALESCE(SUM(subtotal), 0)        AS total_subtotal,
        COALESCE(AVG(total_amount), 0)    AS avg_order_value,
        COALESCE(MAX(total_amount), 0)    AS largest_sale,
        COALESCE(MIN(total_amount), 0)    AS smallest_sale,
        COALESCE(SUM(COALESCE(discount, 0)), 0) AS total_discounts,
        COALESCE(SUM(COALESCE(vat_exempt_amount, 0)), 0) AS total_vat_exempt,
        COALESCE(SUM(CASE WHEN sc_pwd_type = 'SENIOR_CITIZEN' THEN 1 ELSE 0 END), 0) AS senior_count,
        COALESCE(SUM(CASE WHEN sc_pwd_type = 'PWD' THEN 1 ELSE 0 END), 0) AS pwd_count
      FROM sales
      WHERE DATE(created_at) BETWEEN ? AND ?
        AND void_status != 'voided'
        ${cashierFilter}
    `, [date_from, date_to, ...cashierParams]);

    // Get total refunds for the period
    const [refundRows] = await pool.execute<any[]>(`
      SELECT COALESCE(SUM(r.refund_amount), 0) AS total_refunds
      FROM returns r
      JOIN sales s ON s.id = r.sale_id
      WHERE DATE(r.resolved_at) BETWEEN ? AND ?
        AND r.status = 'completed'
        AND s.void_status != 'voided'
        ${cashierFilter.replace('s.', 's.')}
    `, [date_from, date_to, ...cashierParams]);

    const grossRevenue = Number(summaryRows[0].gross_revenue);
    const totalRefunds = Number(refundRows[0].total_refunds);
    const totalDiscounts = Number(summaryRows[0].total_discounts);
    const netRevenue = grossRevenue - totalRefunds;

    // Update summary with net revenue
    const summary = {
      ...summaryRows[0],
      gross_revenue: grossRevenue,
      total_discounts: totalDiscounts,
      total_revenue: netRevenue,
      total_refunds: totalRefunds,
      total_vat_exempt: Number(summaryRows[0].total_vat_exempt ?? 0),
      senior_count: Number(summaryRows[0].senior_count ?? 0),
      pwd_count: Number(summaryRows[0].pwd_count ?? 0),
      sc_pwd_count: Number(summaryRows[0].senior_count ?? 0) + Number(summaryRows[0].pwd_count ?? 0),
    };

    // ── 2. Daily sales breakdown — exclude voided ────────────────────────────
    const [dailyRows] = await pool.execute<any[]>(`
      SELECT
        DATE(s.created_at)                  AS sale_date,
        COUNT(*)                          AS transactions,
        COALESCE(SUM(s.subtotal), 0)      AS subtotal,
        COALESCE(SUM(s.vat_amount), 0)    AS vat,
        COALESCE(SUM(s.total_amount), 0)  AS gross_total
      FROM sales s
      WHERE DATE(s.created_at) BETWEEN ? AND ?
        AND s.void_status != 'voided'
        ${cashierFilter}
      GROUP BY DATE(s.created_at)
      ORDER BY sale_date ASC
    `, [date_from, date_to, ...cashierParams]);

    // Get daily refunds
    const [dailyRefunds] = await pool.execute<any[]>(`
      SELECT
        DATE(r.resolved_at) AS sale_date,
        COALESCE(SUM(r.refund_amount), 0) AS refunds
      FROM returns r
      JOIN sales s ON s.id = r.sale_id
      WHERE DATE(r.resolved_at) BETWEEN ? AND ?
        AND r.status = 'completed'
        AND s.void_status != 'voided'
        ${cashierFilter.replace('s.', 's.')}
      GROUP BY DATE(r.resolved_at)
    `, [date_from, date_to, ...cashierParams]);

    // Merge refunds into daily data
    const dailyRefundMap = new Map(dailyRefunds.map((r: any) => [r.sale_date, Number(r.refunds)]));
    const daily_sales = dailyRows.map((row: any) => ({
      sale_date: row.sale_date,
      transactions: row.transactions,
      subtotal: Number(row.subtotal),
      vat: Number(row.vat),
      total: Number(row.gross_total) - (dailyRefundMap.get(row.sale_date) || 0)
    }));

    // ── 3. Top products — exclude voided sales ───────────────────────────────
    const [topProductRows] = await pool.execute<any[]>(`
      SELECT
        p.barcode,
        p.product_name,
        COALESCE(c.category_name, '—')  AS category,
        SUM(si.quantity)                AS units_sold,
        COALESCE(SUM(si.subtotal), 0)   AS revenue,
        CASE
          WHEN SUM(si.quantity) > 0 THEN COALESCE(SUM(si.subtotal), 0) / SUM(si.quantity)
          ELSE 0
        END                             AS unit_price
      FROM sale_items si
      JOIN products  p ON p.id = si.product_id
      JOIN sales     s ON s.id = si.sale_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
        AND s.void_status != 'voided'
        ${categoryFilter}
        ${cashierFilter.replace('s.', 's.')}
      GROUP BY si.product_id, p.product_name, p.barcode, c.category_name
      ORDER BY units_sold DESC
      LIMIT 20
    `, [date_from, date_to, ...categoryParams, ...cashierParams]);

    // ── 4. Sales per cashier — exclude voided ────────────────────────────────
    const [cashierRows] = await pool.execute<any[]>(`
      SELECT
        u.full_name                       AS cashier,
        u.id                              AS cashier_id,
        COUNT(s.id)                       AS transactions,
        COALESCE(SUM(s.total_amount), 0)  AS revenue
      FROM sales s
      JOIN users u ON u.id = s.cashier_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
        AND s.void_status != 'voided'
        ${cashierFilter}
      GROUP BY s.cashier_id, u.full_name
      ORDER BY revenue DESC
    `, [date_from, date_to, ...cashierParams]);

    // ── 5. VAT Classification Summary ────────────────────────────────────────
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
        ${cashierFilter.replace('s.', 's.')}
      GROUP BY si.tax_type
    `, [date_from, date_to, ...cashierParams]);

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
        p.quantity_type,
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
        ${categoryFilter.replace('p.', 'p.')}
      ORDER BY p.product_name ASC
    `, [...categoryParams]);

    const lowStockRows = (inventoryRows as any[]).filter(
      (r) => r.stock_status !== "In Stock"
    );

    // ── 7. Get available cashiers for filter dropdown ────────────────────────
    const [cashierListRows] = await pool.execute<any[]>(`
      SELECT DISTINCT u.id, u.full_name
      FROM sales s
      JOIN users u ON u.id = s.cashier_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
        AND s.void_status != 'voided'
      ORDER BY u.full_name ASC
    `, [date_from, date_to]);

    // ── 8. Get available categories for filter dropdown ──────────────────────
    const [categoryListRows] = await pool.execute<any[]>(`
      SELECT DISTINCT c.id, c.category_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'Active'
      ORDER BY c.category_name ASC
    `);

    res.status(200).json({
      period:       { date_from, date_to },
      summary:      summary,
      daily_sales:  daily_sales,
      top_products: topProductRows,
      by_cashier:   cashierRows,
      vat_summary,
      inventory:    inventoryRows,
      low_stock:    lowStockRows,
      filters: {
        cashiers: cashierListRows,
        categories: categoryListRows,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[reports/GET /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/reports/sales — Sales Report with detailed transaction data ───────
router.get("/sales", async (req: Request, res: Response) => {
  try {
    const {
      date_from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      date_to = new Date().toISOString().slice(0, 10),
      cashier_id,
      status,
      search,
    } = req.query as Record<string, string>;

    const cashierFilter = cashier_id ? "AND s.cashier_id = ?" : "";
    const cashierParams = cashier_id ? [Number(cashier_id)] : [];

    let statusFilter = "";
    const statusParams: any[] = [];
    if (status && status !== "all") {
      switch (status) {
        case "completed":
          statusFilter = "AND s.void_status != 'voided'";
          break;
        case "voided":
          statusFilter = "AND s.void_status = 'voided'";
          break;
        case "cancelled":
          statusFilter = "AND s.void_status = 'voided'";
          break;
        case "returned":
          statusFilter = "AND EXISTS (SELECT 1 FROM returns r WHERE r.sale_id = s.id AND r.status = 'completed')";
          break;
      }
    }

    let searchFilter = "";
    const searchParams: any[] = [];
    if (search) {
      searchFilter = "AND (s.invoice_number LIKE ? OR s.customer_name LIKE ?)";
      searchParams.push(`%${search}%`, `%${search}%`);
    }

    const [salesRows] = await pool.execute<any[]>(`
      SELECT
        s.invoice_number AS receipt_number,
        s.created_at AS date_time,
        s.customer_name,
        u.full_name AS cashier,
        s.subtotal AS gross_sales,
        COALESCE(s.discount, 0) AS discounts,
        s.sc_pwd_type,
        s.sc_pwd_id,
        COALESCE(s.vat_exempt_amount, 0) AS vat_exempt_amount,
        COALESCE((SELECT SUM(r.refund_amount) FROM returns r WHERE r.sale_id = s.id AND r.status = 'completed'), 0) AS returns,
        CASE WHEN s.void_status = 'voided' THEN s.total_amount ELSE 0 END AS voids,
        CASE WHEN s.void_status = 'voided' THEN 0 ELSE s.total_amount - COALESCE((SELECT SUM(r.refund_amount) FROM returns r WHERE r.sale_id = s.id AND r.status = 'completed'), 0) END AS net_sales
      FROM sales s
      JOIN users u ON u.id = s.cashier_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
        ${cashierFilter}
        ${statusFilter}
        ${searchFilter}
      ORDER BY s.created_at DESC
    `, [date_from, date_to, ...cashierParams, ...statusParams, ...searchParams]);

    // Get available cashiers for filter
    const [cashierListRows] = await pool.execute<any[]>(`
      SELECT DISTINCT u.id, u.full_name
      FROM sales s
      JOIN users u ON u.id = s.cashier_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
      ORDER BY u.full_name ASC
    `, [date_from, date_to]);

    res.status(200).json({
      period: { date_from, date_to },
      data: salesRows,
      filters: {
        cashiers: cashierListRows,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[reports/GET /sales]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/reports/inventory — Inventory Report with stock movement ──────────
router.get("/inventory", async (req: Request, res: Response) => {
  try {
    const {
      date_from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      date_to = new Date().toISOString().slice(0, 10),
      category_id,
      supplier_id,
      product_id,
    } = req.query as Record<string, string>;

    const categoryFilter = category_id ? "AND p.category_id = ?" : "";
    const categoryParams = category_id ? [Number(category_id)] : [];
    const supplierFilter = supplier_id ? "AND p.supplier_id = ?" : "";
    const supplierParams = supplier_id ? [Number(supplier_id)] : [];
    const productFilter = product_id ? "AND p.id = ?" : "";
    const productParams = product_id ? [Number(product_id)] : [];

    // Get current inventory data (simplified without movement tracking)
    const [inventoryRows] = await pool.execute<any[]>(`
      SELECT
        p.id,
        p.barcode,
        p.product_name,
        COALESCE(c.category_name, '—') AS category,
        COALESCE(s.supplier_name, '—') AS supplier,
        p.quantity AS current_stock,
        p.quantity_type,
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
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.status = 'Active'
        ${categoryFilter}
        ${supplierFilter}
        ${productFilter}
      ORDER BY p.product_name ASC
    `, [...categoryParams, ...supplierParams, ...productParams]);

    // Get available categories, suppliers, products for filters
    const [categoryListRows] = await pool.execute<any[]>(`
      SELECT DISTINCT c.id, c.category_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'Active'
      ORDER BY c.category_name ASC
    `);

    const [supplierListRows] = await pool.execute<any[]>(`
      SELECT DISTINCT s.id, s.supplier_name
      FROM products p
      JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.status = 'Active'
      ORDER BY s.supplier_name ASC
    `);

    const [productListRows] = await pool.execute<any[]>(`
      SELECT id, product_name
      FROM products
      WHERE status = 'Active'
      ORDER BY product_name ASC
    `);

    res.status(200).json({
      period: { date_from, date_to },
      data: inventoryRows.map((row: any) => ({
        ...row,
        beginning_stock: row.current_stock,
        stock_in: 0,
        stock_out: 0,
        ending_stock: row.current_stock,
      })),
      filters: {
        categories: categoryListRows,
        suppliers: supplierListRows,
        products: productListRows,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[reports/GET /inventory]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/reports/stock-movement — Stock Movement Report ───────────────────
router.get("/stock-movement", async (req: Request, res: Response) => {
  try {
    const {
      date_from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      date_to = new Date().toISOString().slice(0, 10),
      product_id,
      supplier_id,
    } = req.query as Record<string, string>;

    const productFilter = product_id ? "AND p.id = ?" : "";
    const productParams = product_id ? [Number(product_id)] : [];
    const supplierFilter = supplier_id ? "AND p.supplier_id = ?" : "";
    const supplierParams = supplier_id ? [Number(supplier_id)] : [];

    // Since inventory_movements table doesn't exist, return empty data with message
    res.status(200).json({
      period: { date_from, date_to },
      data: [],
      message: "Stock movement tracking requires inventory_movements table",
      filters: {
        products: [],
        suppliers: [],
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[reports/GET /stock-movement]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/reports/product-sales — Product Sales Report ─────────────────────
router.get("/product-sales", async (req: Request, res: Response) => {
  try {
    const {
      date_from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      date_to = new Date().toISOString().slice(0, 10),
      category_id,
      product_id,
    } = req.query as Record<string, string>;

    const categoryFilter = category_id ? "AND p.category_id = ?" : "";
    const categoryParams = category_id ? [Number(category_id)] : [];
    const productFilter = product_id ? "AND p.id = ?" : "";
    const productParams = product_id ? [Number(product_id)] : [];

    const [productSalesRows] = await pool.execute<any[]>(`
      SELECT
        p.product_name,
        COALESCE(c.category_name, '—') AS category,
        SUM(si.quantity) AS quantity_sold,
        COALESCE(SUM(si.subtotal), 0) AS revenue,
        COALESCE(SUM(si.subtotal) - SUM(si.quantity * p.cost_price), 0) AS profit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
        AND s.void_status != 'voided'
        ${categoryFilter}
        ${productFilter}
      GROUP BY si.product_id, p.product_name, c.category_name, p.cost_price
      ORDER BY revenue DESC
    `, [date_from, date_to, ...categoryParams, ...productParams]);

    // Get available filters
    const [categoryListRows] = await pool.execute<any[]>(`
      SELECT DISTINCT c.id, c.category_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'Active'
      ORDER BY c.category_name ASC
    `);

    const [productListRows] = await pool.execute<any[]>(`
      SELECT id, product_name
      FROM products
      WHERE status = 'Active'
      ORDER BY product_name ASC
    `);

    res.status(200).json({
      period: { date_from, date_to },
      data: productSalesRows,
      filters: {
        categories: categoryListRows,
        products: productListRows,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[reports/GET /product-sales]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/reports/top-products — Top Selling Products Report ───────────────
router.get("/top-products", async (req: Request, res: Response) => {
  try {
    const {
      date_from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      date_to = new Date().toISOString().slice(0, 10),
      category_id,
    } = req.query as Record<string, string>;

    const categoryFilter = category_id ? "AND p.category_id = ?" : "";
    const categoryParams = category_id ? [Number(category_id)] : [];

    const [topProductsRows] = await pool.execute<any[]>(`
      SELECT
        p.product_name,
        COALESCE(c.category_name, '—') AS category,
        SUM(si.quantity) AS quantity_sold,
        COALESCE(SUM(si.subtotal), 0) AS revenue
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
        AND s.void_status != 'voided'
        ${categoryFilter}
      GROUP BY si.product_id, p.product_name, c.category_name
      ORDER BY quantity_sold DESC
      LIMIT 50
    `, [date_from, date_to, ...categoryParams]);

    // Add ranking
    const rankedProducts = topProductsRows.map((row: any, index: number) => ({
      ...row,
      ranking: index + 1,
    }));

    // Get available categories
    const [categoryListRows] = await pool.execute<any[]>(`
      SELECT DISTINCT c.id, c.category_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'Active'
      ORDER BY c.category_name ASC
    `);

    res.status(200).json({
      period: { date_from, date_to },
      data: rankedProducts,
      filters: {
        categories: categoryListRows,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[reports/GET /top-products]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/reports/supplier-purchases — Supplier Purchase Report ─────────────
router.get("/supplier-purchases", async (req: Request, res: Response) => {
  try {
    const {
      date_from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      date_to = new Date().toISOString().slice(0, 10),
      supplier_id,
    } = req.query as Record<string, string>;

    const supplierFilter = supplier_id ? "AND p.supplier_id = ?" : "";
    const supplierParams = supplier_id ? [Number(supplier_id)] : [];

    // Since inventory_movements table doesn't exist, return empty data with message
    res.status(200).json({
      period: { date_from, date_to },
      data: [],
      message: "Supplier purchase tracking requires inventory_movements table",
      filters: {
        suppliers: [],
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[reports/GET /supplier-purchases]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/reports/returns — Return Report ───────────────────────────────────
router.get("/returns", async (req: Request, res: Response) => {
  try {
    const {
      date_from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      date_to = new Date().toISOString().slice(0, 10),
      cashier_id,
      resolution,
    } = req.query as Record<string, string>;

    const cashierFilter = cashier_id ? "AND s.cashier_id = ?" : "";
    const cashierParams = cashier_id ? [Number(cashier_id)] : [];
    const resolutionFilter = resolution && resolution !== "all" ? "AND r.resolution = ?" : "";
    const resolutionParams = resolution && resolution !== "all" ? [resolution] : [];

    console.log("[returns] Query params:", { date_from, date_to, cashier_id, resolution });
    console.log("[returns] Filters:", { cashierFilter, resolutionFilter });

    const [returnRows] = await pool.execute<any[]>(`
      SELECT
        r.id AS return_number,
        s.invoice_number AS receipt_number,
        s.customer_name,
        p.product_name,
        r.resolution,
        r.refund_amount AS amount,
        u.full_name AS cashier,
        a.full_name AS approved_by,
        r.resolved_at
      FROM returns r
      JOIN sales s ON s.id = r.sale_id
      JOIN return_items ri ON ri.return_id = r.id
      JOIN products p ON p.id = ri.product_id
      JOIN users u ON u.id = s.cashier_id
      LEFT JOIN users a ON a.id = r.approved_by
      WHERE DATE(r.created_at) BETWEEN ? AND ?
        ${cashierFilter}
        ${resolutionFilter}
      ORDER BY r.created_at DESC
    `, [date_from, date_to, ...cashierParams, ...resolutionParams]);

    console.log("[returns] Found rows:", returnRows.length);
    if (returnRows.length > 0) {
      console.log("[returns] Sample row:", returnRows[0]);
    }

    // Get available cashiers and admins
    const [cashierListRows] = await pool.execute<any[]>(`
      SELECT DISTINCT u.id, u.full_name
      FROM returns r
      JOIN sales s ON s.id = r.sale_id
      JOIN users u ON u.id = s.cashier_id
      ORDER BY u.full_name ASC
    `);

    const [adminListRows] = await pool.execute<any[]>(`
      SELECT DISTINCT u.id, u.full_name
      FROM returns r
      JOIN users u ON u.id = r.approved_by
      WHERE r.approved_by IS NOT NULL
      ORDER BY u.full_name ASC
    `);

    res.status(200).json({
      period: { date_from, date_to },
      data: returnRows,
      filters: {
        cashiers: cashierListRows,
        admins: adminListRows,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[reports/GET /returns]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/reports/voids — Void Report ───────────────────────────────────────
router.get("/voids", async (req: Request, res: Response) => {
  try {
    const {
      date_from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      date_to = new Date().toISOString().slice(0, 10),
      cashier_id,
      approved_by,
    } = req.query as Record<string, string>;

    const cashierFilter = cashier_id ? "AND sv.requested_by = ?" : "";
    const cashierParams = cashier_id ? [Number(cashier_id)] : [];
    const approvedByFilter = approved_by ? "AND sv.approved_by = ?" : "";
    const approvedByParams = approved_by ? [Number(approved_by)] : [];

    console.log("[voids] Query params:", { date_from, date_to, cashier_id, approved_by });
    console.log("[voids] Filters:", { cashierFilter, approvedByFilter });

    const [voidRows] = await pool.execute<any[]>(`
      SELECT
        s.invoice_number AS receipt_number,
        sv.reason AS void_reason,
        c.full_name AS cashier,
        a.full_name AS approved_by,
        s.created_at AS date_time
      FROM sales s
      JOIN sale_voids sv ON sv.sale_id = s.id
      JOIN users c ON c.id = sv.requested_by
      LEFT JOIN users a ON a.id = sv.approved_by
      WHERE DATE(s.created_at) BETWEEN ? AND ?
        AND s.void_status = 'voided'
        ${cashierFilter}
        ${approvedByFilter}
      ORDER BY s.created_at DESC
    `, [date_from, date_to, ...cashierParams, ...approvedByParams]);

    console.log("[voids] Found rows:", voidRows.length);

    // Get available cashiers and admins
    const [cashierListRows] = await pool.execute<any[]>(`
      SELECT DISTINCT u.id, u.full_name
      FROM sale_voids sv
      JOIN users u ON u.id = sv.requested_by
      ORDER BY u.full_name ASC
    `);

    const [adminListRows] = await pool.execute<any[]>(`
      SELECT DISTINCT u.id, u.full_name
      FROM sale_voids sv
      JOIN users u ON u.id = sv.approved_by
      WHERE sv.approved_by IS NOT NULL
      ORDER BY u.full_name ASC
    `);

    res.status(200).json({
      period: { date_from, date_to },
      data: voidRows,
      filters: {
        cashiers: cashierListRows,
        admins: adminListRows,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[reports/GET /voids]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/reports/discounts — Discount Report ───────────────────────────────
router.get("/discounts", async (req: Request, res: Response) => {
  try {
    const {
      date_from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      date_to = new Date().toISOString().slice(0, 10),
      cashier_id,
      approved_by,
    } = req.query as Record<string, string>;

    const cashierFilter = cashier_id ? "AND s.cashier_id = ?" : "";
    const cashierParams = cashier_id ? [Number(cashier_id)] : [];

    console.log("[discounts] Query params:", { date_from, date_to, cashier_id });
    console.log("[discounts] Filters:", { cashierFilter });

    const [discountRows] = await pool.execute<any[]>(`
      SELECT
        s.invoice_number AS receipt_number,
        d.discount_name,
        d.discount_type,
        s.discount AS discount_amount,
        s.sc_pwd_type,
        COALESCE(s.vat_exempt_amount, 0) AS vat_exempt_amount,
        c.full_name AS cashier,
        NULL AS approved_by,
        s.created_at
      FROM sales s
      JOIN discounts d ON d.id = s.discount_id
      JOIN users c ON c.id = s.cashier_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
        AND s.discount > 0
        AND s.void_status != 'voided'
        ${cashierFilter}
      ORDER BY s.created_at DESC
    `, [date_from, date_to, ...cashierParams]);

    console.log("[discounts] Found rows:", discountRows.length);

    // Get available cashiers and admins
    const [cashierListRows] = await pool.execute<any[]>(`
      SELECT DISTINCT u.id, u.full_name
      FROM sales s
      JOIN users u ON u.id = s.cashier_id
      WHERE s.discount > 0 AND s.void_status != 'voided'
      ORDER BY u.full_name ASC
    `);

    res.status(200).json({
      period: { date_from, date_to },
      data: discountRows,
      filters: {
        cashiers: cashierListRows,
        admins: [],
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[reports/GET /discounts]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/reports/cash-reconciliation — Cash Reconciliation Report ───────────
router.get("/cash-reconciliation", async (req: Request, res: Response) => {
  try {
    const {
      date_from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      date_to = new Date().toISOString().slice(0, 10),
      cashier_id,
      status,
    } = req.query as Record<string, string>;

    const cashierFilter = cashier_id ? "AND cs.cashier_id = ?" : "";
    const cashierParams = cashier_id ? [Number(cashier_id)] : [];

    let statusFilter = "";
    const statusParams: any[] = [];
    if (status && status !== "all") {
      statusFilter = "AND cs.session_status = ?";
      statusParams.push(status);
    }

    console.log("[cash-reconciliation] Query params:", { date_from, date_to, cashier_id, status });
    console.log("[cash-reconciliation] Filters:", { cashierFilter, statusFilter });

    const [reconciliationRows] = await pool.execute<any[]>(`
      SELECT
        u.full_name AS cashier,
        cs.shift_label AS shift,
        cs.opening_cash,
        cs.expected_cash,
        cs.actual_cash,
        (cs.actual_cash - cs.expected_cash) AS variance,
        cs.session_status AS status,
        cs.closed_at AS submitted_at
      FROM cash_sessions cs
      JOIN users u ON u.id = cs.cashier_id
      WHERE DATE(cs.shift_date) BETWEEN ? AND ?
        ${cashierFilter}
        ${statusFilter}
      ORDER BY cs.closed_at DESC
    `, [date_from, date_to, ...cashierParams, ...statusParams]);

    console.log("[cash-reconciliation] Found rows:", reconciliationRows.length);
    if (reconciliationRows.length > 0) {
      console.log("[cash-reconciliation] Sample row:", reconciliationRows[0]);
    }

    // Get available cashiers
    const [cashierListRows] = await pool.execute<any[]>(`
      SELECT DISTINCT u.id, u.full_name
      FROM cash_sessions cs
      JOIN users u ON u.id = cs.cashier_id
      ORDER BY u.full_name ASC
    `);

    res.status(200).json({
      period: { date_from, date_to },
      data: reconciliationRows,
      filters: {
        cashiers: cashierListRows,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[reports/GET /cash-reconciliation]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/reports/authorization-history — Authorization History Report ───────
router.get("/authorization-history", async (req: Request, res: Response) => {
  try {
    const {
      date_from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      date_to = new Date().toISOString().slice(0, 10),
      authorization_type,
      cashier_id,
      approved_by,
    } = req.query as Record<string, string>;

    const typeFilter = authorization_type && authorization_type !== "all" ? "AND auth_type = ?" : "";
    const typeParams = authorization_type && authorization_type !== "all" ? [authorization_type] : [];
    const cashierFilter = cashier_id ? "AND requester_id = ?" : "";
    const cashierParams = cashier_id ? [Number(cashier_id)] : [];
    const approvedByFilter = approved_by ? "AND admin_id = ?" : "";
    const approvedByParams = approved_by ? [Number(approved_by)] : [];

    console.log("[authorization-history] Query params:", { date_from, date_to, authorization_type, cashier_id, approved_by });
    console.log("[authorization-history] Filters:", { typeFilter, cashierFilter, approvedByFilter });

    // Query from discount_requests
    const selectDiscounts = `
      SELECT
        'DISCOUNT' AS authorization_type,
        CONCAT('DISC-', LPAD(dr.id, 6, '0')) AS reference_number,
        COALESCE(u_req.full_name, u_req.username, '—') AS cashier,
        COALESCE(u_adm.full_name, u_adm.username, '—') AS admin,
        dr.status AS decision,
        COALESCE(s.invoice_number, '—') AS reference,
        dr.reason,
        dr.created_at AS date_time
      FROM discount_requests dr
      JOIN users u_req ON u_req.id = dr.cashier_id
      LEFT JOIN users u_adm ON u_adm.id = dr.approved_by
      LEFT JOIN sales s ON s.id = dr.sale_id
      WHERE DATE(dr.created_at) BETWEEN ? AND ?
        ${typeFilter}
        ${cashierFilter}
        ${approvedByFilter}
    `;

    // Query from sale_voids
    const selectVoids = `
      SELECT
        'VOID' AS authorization_type,
        CONCAT('VOID-', LPAD(sv.id, 6, '0')) AS reference_number,
        COALESCE(u_req.full_name, u_req.username, '—') AS cashier,
        COALESCE(u_adm.full_name, u_adm.username, '—') AS admin,
        sv.status AS decision,
        s.invoice_number AS reference,
        sv.reason,
        sv.created_at AS date_time
      FROM sale_voids sv
      JOIN sales s ON s.id = sv.sale_id
      JOIN users u_req ON u_req.id = sv.requested_by
      LEFT JOIN users u_adm ON u_adm.id = sv.approved_by
      WHERE DATE(sv.created_at) BETWEEN ? AND ?
        ${typeFilter}
        ${cashierFilter}
        ${approvedByFilter}
    `;

    const [authRows] = await pool.execute<any[]>(`
      ${selectDiscounts}
      UNION ALL
      ${selectVoids}
      ORDER BY date_time DESC
    `, [date_from, date_to, ...typeParams, ...cashierParams, ...approvedByParams,
        date_from, date_to, ...typeParams, ...cashierParams, ...approvedByParams]);

    console.log("[authorization-history] Found rows:", authRows.length);
    if (authRows.length > 0) {
      console.log("[authorization-history] Sample row:", authRows[0]);
    }

    // Get available cashiers and admins
    const [cashierListRows] = await pool.execute<any[]>(`
      SELECT DISTINCT u.id, u.full_name
      FROM discount_requests dr
      JOIN users u ON u.id = dr.cashier_id
      UNION
      SELECT DISTINCT u.id, u.full_name
      FROM sale_voids sv
      JOIN users u ON u.id = sv.requested_by
      ORDER BY full_name ASC
    `);

    const [adminListRows] = await pool.execute<any[]>(`
      SELECT DISTINCT u.id, u.full_name
      FROM discount_requests dr
      JOIN users u ON u.id = dr.approved_by
      WHERE dr.approved_by IS NOT NULL
      UNION
      SELECT DISTINCT u.id, u.full_name
      FROM sale_voids sv
      JOIN users u ON u.id = sv.approved_by
      WHERE sv.approved_by IS NOT NULL
      ORDER BY full_name ASC
    `);

    res.status(200).json({
      period: { date_from, date_to },
      data: authRows,
      filters: {
        cashiers: cashierListRows,
        admins: adminListRows,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[reports/GET /authorization-history]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/reports/audit-logs — Audit Log Report ─────────────────────────────
router.get("/audit-logs", async (req: Request, res: Response) => {
  try {
    const {
      date_from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      date_to = new Date().toISOString().slice(0, 10),
      user_id,
      action_type,
    } = req.query as Record<string, string>;

    const userFilter = user_id ? "AND al.performed_by_id = ?" : "";
    const userParams = user_id ? [Number(user_id)] : [];
    const actionFilter = action_type && action_type !== "all" ? "AND al.action = ?" : "";
    const actionParams = action_type && action_type !== "all" ? [action_type] : [];

    console.log("[audit-logs] Query params:", { date_from, date_to, user_id, action_type });
    console.log("[audit-logs] Filters:", { userFilter, actionFilter });

    const [auditRows] = await pool.execute<any[]>(`
      SELECT
        al.action AS action_type,
        al.performed_by_username AS user,
        al.reason AS details,
        al.entity_type,
        al.entity_id,
        al.created_at AS date_time
      FROM audit_logs al
      WHERE DATE(al.created_at) BETWEEN ? AND ?
        ${userFilter}
        ${actionFilter}
      ORDER BY al.created_at DESC
    `, [date_from, date_to, ...userParams, ...actionParams]);

    console.log("[audit-logs] Found rows:", auditRows.length);
    if (auditRows.length > 0) {
      console.log("[audit-logs] Sample row:", auditRows[0]);
    }

    // Get available users and action types
    const [userListRows] = await pool.execute<any[]>(`
      SELECT DISTINCT performed_by_id AS id, performed_by_username AS full_name
      FROM audit_logs
      ORDER BY performed_by_username ASC
    `);

    const [actionTypeListRows] = await pool.execute<any[]>(`
      SELECT DISTINCT action AS value, action AS label
      FROM audit_logs
      ORDER BY action ASC
    `);

    res.status(200).json({
      period: { date_from, date_to },
      data: auditRows,
      filters: {
        users: userListRows,
        action_types: actionTypeListRows,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[reports/GET /audit-logs]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/reports/credit-receivables — Accounts Receivable & Aging Report ─
router.get("/credit-receivables", async (req: Request, res: Response) => {
  try {
    const {
      date_from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      date_to   = new Date().toISOString().slice(0, 10),
      status = "all", // "all" | "with_balance" | "active"
      customer_id,
    } = req.query as Record<string, string>;

    // 1. Overall Summary KPIs
    const [summaryRows] = await pool.execute<any[]>(`
      SELECT
        COALESCE(SUM(current_balance), 0) AS total_receivables,
        COUNT(*) AS total_customers,
        COUNT(CASE WHEN current_balance > 0 THEN 1 END) AS customers_with_balance,
        COUNT(CASE WHEN is_credit_enabled = 1 THEN 1 END) AS credit_enabled_customers
      FROM customers
      WHERE status = 'Active'
    `);

    // 2. Period activity (Credit sales, payments, void reversals, return credits, and adjustments)
    const [activityRows] = await pool.execute<any[]>(`
      SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'CREDIT_SALE' THEN amount ELSE 0 END), 0) AS period_credit_sales,
        COALESCE(SUM(CASE WHEN entry_type = 'PAYMENT' THEN ABS(amount) ELSE 0 END), 0) AS period_payments,
        COALESCE(SUM(CASE WHEN entry_type = 'VOID_REVERSAL' THEN ABS(amount) ELSE 0 END), 0) AS period_void_reversals,
        COALESCE(SUM(CASE WHEN entry_type = 'RETURN_CREDIT' THEN ABS(amount) ELSE 0 END), 0) AS period_return_credits,
        COALESCE(SUM(CASE WHEN entry_type = 'ADJUSTMENT' THEN amount ELSE 0 END), 0) AS period_adjustments
      FROM credit_ledger
      WHERE DATE(created_at) BETWEEN ? AND ?
    `, [date_from, date_to]);

    // 3. Customer-by-customer list with balances and aging
    let customerFilter = "";
    const customerParams: any[] = [];
    if (status === "with_balance") {
      customerFilter += " AND c.current_balance > 0";
    } else if (status === "active") {
      customerFilter += " AND c.status = 'Active'";
    }
    if (customer_id) {
      customerFilter += " AND c.id = ?";
      customerParams.push(Number(customer_id));
    }

    const [customerRows] = await pool.execute<any[]>(`
      SELECT
        c.id,
        c.customer_code,
        c.full_name,
        c.contact_number,
        c.credit_limit,
        c.current_balance,
        c.is_credit_enabled,
        c.status,
        c.created_at,
        (SELECT MAX(created_at) FROM credit_ledger WHERE customer_id = c.id AND entry_type = 'CREDIT_SALE') AS last_credit_sale_date,
        (SELECT MAX(created_at) FROM credit_ledger WHERE customer_id = c.id AND entry_type = 'PAYMENT') AS last_payment_date
      FROM customers c
      WHERE 1=1
        ${customerFilter}
      ORDER BY c.current_balance DESC, c.full_name ASC
    `, customerParams);

    // 4. Calculate aging breakdown for each customer with outstanding balance
    // Uses open CREDIT_SALE ledger entries (unallocated remainder)
    const [openEntries] = await pool.execute<any[]>(`
      SELECT
        cl.customer_id,
        cl.amount AS original_amount,
        cl.created_at,
        DATEDIFF(CURDATE(), DATE(cl.created_at)) AS days_old,
        (cl.amount - COALESCE((SELECT SUM(ca.amount_applied) FROM credit_allocations ca WHERE ca.sale_ledger_id = cl.id), 0)) AS remaining_amount
      FROM credit_ledger cl
      WHERE cl.entry_type = 'CREDIT_SALE'
      HAVING remaining_amount > 0
    `);

    // Group aging per customer
    const agingMap: Record<number, { current_30: number; days_31_60: number; days_61_90: number; over_90: number }> = {};
    let totalAging = { current_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0 };

    for (const entry of openEntries) {
      const custId = entry.customer_id;
      if (!agingMap[custId]) {
        agingMap[custId] = { current_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0 };
      }
      const rem = Number(entry.remaining_amount);
      const days = Number(entry.days_old);

      if (days <= 30) {
        agingMap[custId].current_30 += rem;
        totalAging.current_30 += rem;
      } else if (days <= 60) {
        agingMap[custId].days_31_60 += rem;
        totalAging.days_31_60 += rem;
      } else if (days <= 90) {
        agingMap[custId].days_61_90 += rem;
        totalAging.days_61_90 += rem;
      } else {
        agingMap[custId].over_90 += rem;
        totalAging.over_90 += rem;
      }
    }

    const customers = customerRows.map((c: any) => ({
      id: c.id,
      customer_code: c.customer_code,
      full_name: c.full_name,
      contact_number: c.contact_number,
      credit_limit: Number(c.credit_limit),
      current_balance: Number(c.current_balance),
      is_credit_enabled: c.is_credit_enabled === 1 || c.is_credit_enabled === true,
      status: c.status,
      created_at: c.created_at,
      last_credit_sale_date: c.last_credit_sale_date,
      last_payment_date: c.last_payment_date,
      aging: agingMap[c.id] || { current_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0 },
    }));

    res.status(200).json({
      period: { date_from, date_to },
      summary: {
        total_receivables: Number(summaryRows[0]?.total_receivables || 0),
        total_customers: Number(summaryRows[0]?.total_customers || 0),
        customers_with_balance: Number(summaryRows[0]?.customers_with_balance || 0),
        credit_enabled_customers: Number(summaryRows[0]?.credit_enabled_customers || 0),
        period_credit_sales: Number(activityRows[0]?.period_credit_sales || 0),
        period_payments: Number(activityRows[0]?.period_payments || 0),
        period_void_reversals: Number(activityRows[0]?.period_void_reversals || 0),
        period_return_credits: Number(activityRows[0]?.period_return_credits || 0),
        period_adjustments: Number(activityRows[0]?.period_adjustments || 0),
        aging_summary: totalAging,
      },
      customers,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[reports/GET /credit-receivables]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

export default router;