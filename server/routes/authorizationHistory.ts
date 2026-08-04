/**
 * Authorization History API
 *
 * GET /api/authorization-history
 *   Returns a unified, paginated list of every admin-authorization event across
 *   all approval workflows: Discounts, Voids, Returns, Stock Count Adjustments
 *   (Standard + Market-Based), and Commodity Purchases.
 *
 *   This endpoint is intentionally read-only — no mutations happen here.
 *   It is kept completely separate from Sales History, Return History,
 *   Void History, and Stock History; those modules continue to show completed
 *   business transactions only.
 *
 * GET /api/authorization-history/:id
 *   Returns the full detail for one authorization record.
 *
 * GET /api/authorization-history/report/summary
 *   Returns PASS/FAIL counts grouped by type and decision for reporting.
 */

import { Request, Response, Router } from "express";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();
router.use(authenticate, requireRole("Admin"));

// ─── Types ─────────────────────────────────────────────────────────────────────

type AuthType =
  | "DISCOUNT"
  | "VOID"
  | "RETURN"
  | "STOCK_COUNT_STANDARD"
  | "STOCK_COUNT_MARKET"
  | "COMMODITY_PURCHASE";

// ─── Helper: build list query ──────────────────────────────────────────────────

function buildListQuery(filters: {
  type?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  requested_by?: string;
  admin_id?: string;
}): { sql: string; params: any[] } {
  const {
    type,
    status,
    date_from,
    date_to,
    search,
    requested_by,
    admin_id,
  } = filters;

  // Each UNION branch returns:
  //  auth_type, source_id, reference, auth_type_label,
  //  requester_name, requester_id,
  //  admin_name, admin_id,
  //  customer_name, reason, rejection_reason,
  //  requested_action, final_decision, status_normalized,
  //  created_at, resolved_at,
  //  extra_ref (invoice/return/product info)

  const selectDiscounts = `
    SELECT
      'DISCOUNT'                                       AS auth_type,
      dr.id                                            AS source_id,
      CONCAT('DISC-', LPAD(dr.id, 6, '0'))            AS reference,
      'Discount Approval'                              AS auth_type_label,
      COALESCE(u_req.full_name, u_req.username, '—')  AS requester_name,
      dr.cashier_id                                    AS requester_id,
      COALESCE(u_adm.full_name, u_adm.username, '—')  AS admin_name,
      dr.approved_by                                   AS admin_id,
      COALESCE(s.customer_name, '—')                  AS customer_name,
      dr.reason                                        AS reason,
      dr.rejection_reason                              AS rejection_reason,
      CONCAT(d.discount_name, ' (', dr.requested_percentage, '%) — ₱', FORMAT(dr.discount_amount, 2)) AS requested_action,
      CASE dr.status
        WHEN 'approved'   THEN 'APPROVED'
        WHEN 'rejected'   THEN 'REJECTED'
        WHEN 'cancelled'  THEN 'CANCELLED'
        ELSE 'PENDING'
      END                                              AS final_decision,
      UPPER(dr.status)                                 AS status_normalized,
      dr.created_at,
      dr.approved_at                                   AS resolved_at,
      COALESCE(s.invoice_number, '—')                 AS extra_ref
    FROM discount_requests dr
    JOIN discounts d   ON d.id  = dr.discount_id
    JOIN users u_req   ON u_req.id = dr.cashier_id
    LEFT JOIN users u_adm ON u_adm.id = dr.approved_by
    LEFT JOIN sales s  ON s.id  = dr.sale_id
  `;

  const selectVoids = `
    SELECT
      'VOID'                                           AS auth_type,
      sv.id                                            AS source_id,
      s.invoice_number                                 AS reference,
      'Void Approval'                                  AS auth_type_label,
      COALESCE(u_req.full_name, u_req.username, '—')  AS requester_name,
      sv.requested_by                                  AS requester_id,
      COALESCE(u_adm.full_name, u_adm.username, '—')  AS admin_name,
      sv.approved_by                                   AS admin_id,
      COALESCE(s.customer_name, '—')                  AS customer_name,
      sv.reason                                        AS reason,
      sv.rejection_reason                              AS rejection_reason,
      CONCAT('Void sale ', s.invoice_number, ' — ₱', FORMAT(s.total_amount, 2)) AS requested_action,
      CASE sv.status
        WHEN 'approved' THEN 'APPROVED'
        WHEN 'rejected' THEN 'REJECTED'
        ELSE 'PENDING'
      END                                              AS final_decision,
      UPPER(sv.status)                                 AS status_normalized,
      sv.created_at,
      sv.resolved_at,
      s.invoice_number                                 AS extra_ref
    FROM sale_voids sv
    JOIN sales s        ON s.id  = sv.sale_id
    JOIN users u_req    ON u_req.id = sv.requested_by
    LEFT JOIN users u_adm ON u_adm.id = sv.approved_by
  `;

  const selectReturns = `
    SELECT
      'RETURN'                                         AS auth_type,
      r.id                                             AS source_id,
      r.return_number                                  AS reference,
      'Return Approval'                                AS auth_type_label,
      COALESCE(u_req.full_name, u_req.username, '—')  AS requester_name,
      r.processed_by                                   AS requester_id,
      COALESCE(u_adm.full_name, u_adm.username, '—')  AS admin_name,
      r.approved_by                                    AS admin_id,
      COALESCE(s.customer_name, '—')                  AS customer_name,
      r.return_reason                                  AS reason,
      NULL                                             AS rejection_reason,
      CONCAT('Return on ', s.invoice_number,
             CASE WHEN r.resolution IS NOT NULL
               THEN CONCAT(' — Resolution: ', r.resolution) ELSE '' END
      )                                                AS requested_action,
      CASE r.status
        WHEN 'waiting_for_cashier' THEN 'APPROVED'
        WHEN 'completed'           THEN 'APPROVED'
        WHEN 'approved'            THEN 'APPROVED'
        WHEN 'rejected'            THEN 'REJECTED'
        ELSE 'PENDING'
      END                                              AS final_decision,
      CASE r.status
        WHEN 'waiting_for_cashier' THEN 'APPROVED'
        WHEN 'completed'           THEN 'COMPLETED'
        ELSE UPPER(r.status)
      END                                              AS status_normalized,
      r.created_at,
      r.resolved_at,
      s.invoice_number                                 AS extra_ref
    FROM returns r
    JOIN sales s         ON s.id  = r.sale_id
    JOIN users u_req     ON u_req.id = r.processed_by
    LEFT JOIN users u_adm ON u_adm.id = r.approved_by
  `;

  const selectStockStandard = `
    SELECT
      'STOCK_COUNT_STANDARD'                           AS auth_type,
      scar.id                                          AS source_id,
      scar.reference                                   AS reference,
      'Stock Adjustment (Standard)'                    AS auth_type_label,
      COALESCE(u_req.full_name, u_req.username, '—')  AS requester_name,
      scar.prepared_by                                 AS requester_id,
      COALESCE(u_adm.full_name, u_adm.username, '—')  AS admin_name,
      scar.approved_by                                 AS admin_id,
      '—'                                              AS customer_name,
      scar.reason                                      AS reason,
      scar.rejection_reason                            AS rejection_reason,
      CONCAT('Adjust ', p.product_name,
             ': ', scar.system_quantity, ' → ', scar.physical_quantity,
             ' (Δ', IF(scar.difference >= 0, '+', ''), scar.difference, ')'
      )                                                AS requested_action,
      CASE scar.status
        WHEN 'APPROVED' THEN 'APPROVED'
        WHEN 'REJECTED' THEN 'REJECTED'
        ELSE 'PENDING'
      END                                              AS final_decision,
      scar.status                                      AS status_normalized,
      scar.prepared_at                                 AS created_at,
      scar.approved_at                                 AS resolved_at,
      p.product_name                                   AS extra_ref
    FROM stock_count_adjustment_requests scar
    JOIN products p       ON p.id  = scar.product_id
    JOIN users u_req      ON u_req.id = scar.prepared_by
    LEFT JOIN users u_adm ON u_adm.id = scar.approved_by
  `;

  const selectStockMarket = `
    SELECT
      'STOCK_COUNT_MARKET'                             AS auth_type,
      mbar.id                                          AS source_id,
      mbar.reference                                   AS reference,
      'Stock Adjustment (Market-Based)'                AS auth_type_label,
      COALESCE(u_req.full_name, u_req.username, '—')  AS requester_name,
      mbar.prepared_by                                 AS requester_id,
      COALESCE(u_adm.full_name, u_adm.username, '—')  AS admin_name,
      mbar.approved_by                                 AS admin_id,
      '—'                                              AS customer_name,
      mbar.reason                                      AS reason,
      mbar.rejection_reason                            AS rejection_reason,
      CONCAT('Adjust ', p.product_name,
             ': ', ROUND(mbar.system_quantity, 3), ' → ', ROUND(mbar.physical_quantity, 3),
             ' (Δ', IF(mbar.difference >= 0, '+', ''), ROUND(mbar.difference, 3), ')'
      )                                                AS requested_action,
      CASE mbar.status
        WHEN 'APPROVED' THEN 'APPROVED'
        WHEN 'REJECTED' THEN 'REJECTED'
        ELSE 'PENDING'
      END                                              AS final_decision,
      mbar.status                                      AS status_normalized,
      mbar.prepared_at                                 AS created_at,
      mbar.approved_at                                 AS resolved_at,
      p.product_name                                   AS extra_ref
    FROM market_based_adjustment_requests mbar
    JOIN products p       ON p.id  = mbar.product_id
    JOIN users u_req      ON u_req.id = mbar.prepared_by
    LEFT JOIN users u_adm ON u_adm.id = mbar.approved_by
  `;

  const selectCommodity = `
    SELECT
      'COMMODITY_PURCHASE'                             AS auth_type,
      cp.id                                            AS source_id,
      CONCAT('CP-', LPAD(cp.id, 6, '0'))              AS reference,
      'Commodity Purchase Approval'                    AS auth_type_label,
      COALESCE(u_req.full_name, u_req.username, '—')  AS requester_name,
      cp.prepared_by                                   AS requester_id,
      COALESCE(u_adm.full_name, u_adm.username, '—')  AS admin_name,
      cp.approved_by                                   AS admin_id,
      COALESCE(cp.seller_name, '—')                   AS customer_name,
      COALESCE(cp.remarks, 'Commodity purchase')      AS reason,
      cp.rejection_reason                              AS rejection_reason,
      CONCAT('Purchase ', p.product_name,
             ' × ', cp.quantity, ' ', cp.unit_name,
             ' @ ₱', FORMAT(cp.reference_price, 4),
             ' = ₱', FORMAT(cp.final_amount, 2)
      )                                                AS requested_action,
      CASE cp.status
        WHEN 'APPROVED'   THEN 'APPROVED'
        WHEN 'REJECTED'   THEN 'REJECTED'
        WHEN 'CANCELLED'  THEN 'CANCELLED'
        ELSE 'PENDING'
      END                                              AS final_decision,
      cp.status                                        AS status_normalized,
      cp.created_at,
      cp.approved_at                                   AS resolved_at,
      p.product_name                                   AS extra_ref
    FROM commodity_purchases cp
    JOIN products p       ON p.id  = cp.product_id
    LEFT JOIN users u_req ON u_req.id = cp.prepared_by
    LEFT JOIN users u_adm ON u_adm.id = cp.approved_by
  `;

  // Determine which branches to include
  const branches: string[] = [];
  const typeUpper = type ? String(type).toUpperCase() : "ALL";
  if (typeUpper === "ALL" || typeUpper === "DISCOUNT")          branches.push(selectDiscounts);
  if (typeUpper === "ALL" || typeUpper === "VOID")              branches.push(selectVoids);
  if (typeUpper === "ALL" || typeUpper === "RETURN")            branches.push(selectReturns);
  if (typeUpper === "ALL" || typeUpper === "STOCK_COUNT_STANDARD") branches.push(selectStockStandard);
  if (typeUpper === "ALL" || typeUpper === "STOCK_COUNT_MARKET")   branches.push(selectStockMarket);
  if (typeUpper === "ALL" || typeUpper === "COMMODITY_PURCHASE")   branches.push(selectCommodity);

  if (branches.length === 0) branches.push(selectDiscounts); // fallback

  // Build outer WHERE conditions
  const outerConditions: string[] = [];
  const params: any[] = [];

  if (status && status !== "all") {
    outerConditions.push("final_decision = ?");
    params.push(String(status).toUpperCase());
  }
  if (date_from) {
    outerConditions.push("DATE(created_at) >= ?");
    params.push(date_from);
  }
  if (date_to) {
    outerConditions.push("DATE(created_at) <= ?");
    params.push(date_to);
  }
  if (search) {
    outerConditions.push(
      "(reference LIKE ? OR requester_name LIKE ? OR admin_name LIKE ? OR customer_name LIKE ? OR extra_ref LIKE ? OR requested_action LIKE ?)"
    );
    const like = `%${search}%`;
    params.push(like, like, like, like, like, like);
  }
  if (requested_by) {
    outerConditions.push("requester_id = ?");
    params.push(parseInt(requested_by, 10));
  }
  if (admin_id) {
    outerConditions.push("admin_id = ?");
    params.push(parseInt(admin_id, 10));
  }

  const outerWhere = outerConditions.length > 0
    ? `WHERE ${outerConditions.join(" AND ")}`
    : "";

  const unionSql = branches.join("\nUNION ALL\n");

  const sql = `
    SELECT * FROM (
      ${unionSql}
    ) AS auth_union
    ${outerWhere}
    ORDER BY created_at DESC
  `;

  return { sql, params };
}

// ─── GET /api/authorization-history ───────────────────────────────────────────
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const {
    type, status, date_from, date_to, search,
    requested_by, admin_id,
    limit: limitRaw = "50", offset: offsetRaw = "0",
  } = req.query as Record<string, string | undefined>;

  const limit  = Math.min(200, Math.max(1,  parseInt(limitRaw  || "50", 10)));
  const offset = Math.max(0,               parseInt(offsetRaw || "0",  10));

  try {
    const { sql, params } = buildListQuery({
      type, status, date_from, date_to, search, requested_by, admin_id,
    });

    // Total count (without LIMIT)
    const countSql = `SELECT COUNT(*) AS total FROM (${sql}) AS _count`;
    const [countRows] = await pool.execute<any[]>(countSql, params);
    const total = Number(countRows[0]?.total ?? 0);

    // Paged results
    const pagedSql = `${sql} LIMIT ${limit} OFFSET ${offset}`;
    const [rows] = await pool.execute<any[]>(pagedSql, params);

    res.status(200).json({ total, rows });
  } catch (err) {
    console.error("[authorizationHistory/GET /]", err);
    res.status(500).json({ message: "Failed to load authorization history." });
  }
});

// ─── GET /api/authorization-history/report/summary ────────────────────────────
router.get("/report/summary", async (req: Request, res: Response): Promise<void> => {
  const { date_from, date_to } = req.query as Record<string, string | undefined>;

  try {
    const { sql, params } = buildListQuery({ date_from, date_to });

    const reportSql = `
      SELECT
        auth_type,
        auth_type_label,
        final_decision,
        COUNT(*) AS count
      FROM (${sql}) AS auth_union
      GROUP BY auth_type, auth_type_label, final_decision
      ORDER BY auth_type, final_decision
    `;

    const [rows] = await pool.execute<any[]>(reportSql, params);

    // Group by type into pass/fail summary
    const summary: Record<string, {
      label: string;
      APPROVED: number;
      REJECTED: number;
      PENDING: number;
      CANCELLED: number;
      COMPLETED: number;
      total: number;
      pass_rate: string;
    }> = {};

    for (const row of rows) {
      const key = row.auth_type as string;
      if (!summary[key]) {
        summary[key] = {
          label:     row.auth_type_label,
          APPROVED:  0,
          REJECTED:  0,
          PENDING:   0,
          CANCELLED: 0,
          COMPLETED: 0,
          total:     0,
          pass_rate: "0%",
        };
      }
      const dec = (row.final_decision as string) || "PENDING";
      (summary[key] as any)[dec] = (summary[key] as any)[dec] + Number(row.count);
      summary[key].total += Number(row.count);
    }

    // Compute pass rate (APPROVED / total decided)
    for (const key of Object.keys(summary)) {
      const s = summary[key];
      const decided = s.APPROVED + s.REJECTED;
      s.pass_rate = decided > 0
        ? `${Math.round((s.APPROVED / decided) * 100)}%`
        : "N/A";
    }

    // Totals row
    const grand = {
      label:     "TOTAL",
      APPROVED:  0,
      REJECTED:  0,
      PENDING:   0,
      CANCELLED: 0,
      COMPLETED: 0,
      total:     0,
      pass_rate: "0%",
    };
    for (const s of Object.values(summary)) {
      grand.APPROVED  += s.APPROVED;
      grand.REJECTED  += s.REJECTED;
      grand.PENDING   += s.PENDING;
      grand.CANCELLED += s.CANCELLED;
      grand.COMPLETED += s.COMPLETED;
      grand.total     += s.total;
    }
    const decidedGrand = grand.APPROVED + grand.REJECTED;
    grand.pass_rate = decidedGrand > 0
      ? `${Math.round((grand.APPROVED / decidedGrand) * 100)}%`
      : "N/A";

    res.status(200).json({
      by_type: summary,
      grand_total: grand,
      generated_at: new Date().toISOString(),
      date_from: date_from || null,
      date_to:   date_to   || null,
    });
  } catch (err) {
    console.error("[authorizationHistory/GET /report/summary]", err);
    res.status(500).json({ message: "Failed to generate report." });
  }
});

// ─── GET /api/authorization-history/:type/:id ─────────────────────────────────
router.get("/:type/:id", async (req: Request, res: Response): Promise<void> => {
  const { type, id } = req.params;
  const sourceId = parseInt(id, 10);
  if (isNaN(sourceId)) {
    res.status(400).json({ message: "Invalid ID." });
    return;
  }

  try {
    const typeUpper = type.toUpperCase() as AuthType;
    let row: any = null;

    if (typeUpper === "DISCOUNT") {
      const [rows] = await pool.execute<any[]>(
        `SELECT dr.*,
           d.discount_name, d.discount_type, d.value AS discount_value,
           COALESCE(u_req.full_name, u_req.username) AS requester_name,
           COALESCE(u_adm.full_name, u_adm.username) AS admin_name,
           COALESCE(s.invoice_number, '—')           AS invoice_number,
           COALESCE(s.customer_name, '—')            AS customer_name
         FROM discount_requests dr
         JOIN discounts d      ON d.id   = dr.discount_id
         JOIN users u_req      ON u_req.id = dr.cashier_id
         LEFT JOIN users u_adm ON u_adm.id = dr.approved_by
         LEFT JOIN sales s     ON s.id   = dr.sale_id
         WHERE dr.id = ? LIMIT 1`,
        [sourceId]
      );
      row = rows[0] ?? null;
    } else if (typeUpper === "VOID") {
      const [rows] = await pool.execute<any[]>(
        `SELECT sv.*,
           s.invoice_number, s.customer_name, s.total_amount,
           COALESCE(u_req.full_name, u_req.username) AS requester_name,
           COALESCE(u_adm.full_name, u_adm.username) AS admin_name
         FROM sale_voids sv
         JOIN sales s          ON s.id  = sv.sale_id
         JOIN users u_req      ON u_req.id = sv.requested_by
         LEFT JOIN users u_adm ON u_adm.id = sv.approved_by
         WHERE sv.id = ? LIMIT 1`,
        [sourceId]
      );
      row = rows[0] ?? null;
    } else if (typeUpper === "RETURN") {
      const [rows] = await pool.execute<any[]>(
        `SELECT r.*,
           s.invoice_number, s.customer_name,
           COALESCE(u_req.full_name, u_req.username) AS requester_name,
           COALESCE(u_adm.full_name, u_adm.username) AS admin_name
         FROM returns r
         JOIN sales s          ON s.id  = r.sale_id
         JOIN users u_req      ON u_req.id = r.processed_by
         LEFT JOIN users u_adm ON u_adm.id = r.approved_by
         WHERE r.id = ? LIMIT 1`,
        [sourceId]
      );
      if (rows[0]) {
        const [items] = await pool.execute<any[]>(
          `SELECT ri.*, p.product_name FROM return_items ri
           JOIN products p ON p.id = ri.product_id
           WHERE ri.return_id = ?`,
          [sourceId]
        );
        row = { ...rows[0], items };
      }
    } else if (typeUpper === "STOCK_COUNT_STANDARD") {
      const [rows] = await pool.execute<any[]>(
        `SELECT scar.*,
           p.product_name, p.barcode,
           COALESCE(u_req.full_name, u_req.username) AS requester_name,
           COALESCE(u_adm.full_name, u_adm.username) AS admin_name
         FROM stock_count_adjustment_requests scar
         JOIN products p       ON p.id  = scar.product_id
         JOIN users u_req      ON u_req.id = scar.prepared_by
         LEFT JOIN users u_adm ON u_adm.id = scar.approved_by
         WHERE scar.id = ? LIMIT 1`,
        [sourceId]
      );
      row = rows[0] ?? null;
    } else if (typeUpper === "STOCK_COUNT_MARKET") {
      const [rows] = await pool.execute<any[]>(
        `SELECT mbar.*,
           p.product_name, p.barcode,
           COALESCE(u_req.full_name, u_req.username) AS requester_name,
           COALESCE(u_adm.full_name, u_adm.username) AS admin_name
         FROM market_based_adjustment_requests mbar
         JOIN products p       ON p.id  = mbar.product_id
         JOIN users u_req      ON u_req.id = mbar.prepared_by
         LEFT JOIN users u_adm ON u_adm.id = mbar.approved_by
         WHERE mbar.id = ? LIMIT 1`,
        [sourceId]
      );
      row = rows[0] ?? null;
    } else if (typeUpper === "COMMODITY_PURCHASE") {
      const [rows] = await pool.execute<any[]>(
        `SELECT cp.*,
           p.product_name, p.barcode,
           COALESCE(u_req.full_name, u_req.username) AS requester_name,
           COALESCE(u_adm.full_name, u_adm.username) AS admin_name
         FROM commodity_purchases cp
         JOIN products p       ON p.id  = cp.product_id
         LEFT JOIN users u_req ON u_req.id = cp.prepared_by
         LEFT JOIN users u_adm ON u_adm.id = cp.approved_by
         WHERE cp.id = ? LIMIT 1`,
        [sourceId]
      );
      row = rows[0] ?? null;
    } else {
      res.status(400).json({ message: "Unknown authorization type." });
      return;
    }

    if (!row) {
      res.status(404).json({ message: "Authorization record not found." });
      return;
    }

    res.status(200).json({ type: typeUpper, ...row });
  } catch (err) {
    console.error("[authorizationHistory/GET /:type/:id]", err);
    res.status(500).json({ message: "Failed to load authorization detail." });
  }
});

export default router;
