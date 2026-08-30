import { Request, Response, Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { logAuditEvent } from "../utils/auditLogger.js";

const router = Router();
router.use(authenticate);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad4(num: number): string {
  return String(num).padStart(4, "0");
}

function round2(num: number): number {
  return Math.round((Number(num) || 0) * 100) / 100;
}

// ─── GET /api/bir/z-reading/preview ───────────────────────────────────────────
// Real-time calculation of all uncommitted transactions since the last Z-Reading cutoff
router.get(
  "/z-reading/preview",
  requireRole("Admin", "Cashier"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // 1. Get the last Z-Reading record to determine cutoff start time & accumulators
      const [lastZRows] = await pool.execute<any[]>(
        `SELECT id, z_counter_no, reset_counter_no, old_grand_total, new_grand_total, closed_at
         FROM z_readings
         ORDER BY id DESC
         LIMIT 1`
      );

      const lastZ = lastZRows[0] || null;
      const startTime = lastZ ? new Date(lastZ.closed_at) : new Date("1970-01-01T00:00:00Z");
      const endTime = new Date();

      const oldGrandTotal = lastZ ? Number(lastZ.new_grand_total) : 0;
      let nextZCounterNo = lastZ ? Number(lastZ.z_counter_no) + 1 : 1;
      let nextResetCounterNo = lastZ ? Number(lastZ.reset_counter_no) : 0;

      if (nextZCounterNo > 9999) {
        nextZCounterNo = 1;
        nextResetCounterNo += 1;
      }

      // 2. Query all issued invoices in this cutoff window for continuous sequence & gross sales
      const [allInvoicesRows] = await pool.execute<any[]>(
        `SELECT
           COUNT(*) AS total_issued_invoices,
           MIN(invoice_number) AS beg_invoice_no,
           MAX(invoice_number) AS end_invoice_no,
           COALESCE(SUM(subtotal + COALESCE(vat_amount, 0)), 0) AS gross_sales
         FROM sales
         WHERE created_at > ?
           AND created_at <= ?
           AND payment_status = 'completed'`,
        [startTime, endTime]
      );
      const allInvoicesSummary = allInvoicesRows[0];

      // 2b. Query completed, non-voided sales in this cutoff window for valid revenue breakdown
      const [salesRows] = await pool.execute<any[]>(
        `SELECT
           COUNT(*) AS transaction_count,
           COALESCE(SUM(subtotal), 0) AS total_subtotal,
           COALESCE(SUM(vat_amount), 0) AS total_vat,
           COALESCE(SUM(vat_exempt_amount), 0) AS total_vat_exempt_base,
           COALESCE(SUM(total_amount), 0) AS total_sales_amount,
           COALESCE(SUM(discount), 0) AS total_discounts,
           COALESCE(SUM(CASE WHEN sc_pwd_type = 'SENIOR_CITIZEN' THEN discount ELSE 0 END), 0) AS sc_discount,
           COALESCE(SUM(CASE WHEN sc_pwd_type = 'PWD' THEN discount ELSE 0 END), 0) AS pwd_discount,
           COALESCE(SUM(CASE WHEN sc_pwd_type NOT IN ('SENIOR_CITIZEN', 'PWD') THEN discount ELSE 0 END), 0) AS regular_discount,
           COALESCE(SUM(CASE WHEN payment_type = 'CASH' THEN total_amount WHEN payment_type = 'CREDIT' THEN COALESCE(amount_paid_at_sale, 0) ELSE 0 END), 0) AS cash_sales,
           COALESCE(SUM(CASE WHEN payment_type = 'CREDIT' THEN (total_amount - COALESCE(amount_paid_at_sale, 0)) ELSE 0 END), 0) AS credit_sales
         FROM sales
         WHERE created_at > ?
           AND created_at <= ?
           AND payment_status = 'completed'
           AND void_status != 'voided'`,
        [startTime, endTime]
      );

      const salesSummary = salesRows[0];

      // 3. Tax breakdown per sale_item in cutoff window
      const [taxRows] = await pool.execute<any[]>(
        `SELECT
           si.tax_type,
           s.sc_pwd_type,
           COALESCE(SUM(si.taxable_amount), 0) AS sum_taxable,
           COALESCE(SUM(si.vat_amount), 0) AS sum_vat,
           COALESCE(SUM(si.subtotal), 0) AS sum_subtotal
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.created_at > ?
           AND s.created_at <= ?
           AND s.payment_status = 'completed'
           AND s.void_status != 'voided'
         GROUP BY si.tax_type, s.sc_pwd_type`,
        [startTime, endTime]
      );

      let vatableSales = 0;
      let vatExemptSales = 0;
      let zeroRatedSales = 0;
      let nonVatSales = 0;

      for (const row of taxRows) {
        const isScPwd = row.sc_pwd_type === "SENIOR_CITIZEN" || row.sc_pwd_type === "PWD";
        if (row.tax_type === "VATABLE") {
          if (isScPwd) {
            vatExemptSales += Number(row.sum_taxable);
          } else {
            vatableSales += Number(row.sum_taxable);
          }
        } else if (row.tax_type === "VAT_EXEMPT") {
          vatExemptSales += Number(row.sum_subtotal);
        } else if (row.tax_type === "ZERO_RATED") {
          zeroRatedSales += Number(row.sum_subtotal);
        } else {
          nonVatSales += Number(row.sum_subtotal);
        }
      }

      // 4. Query returns in this cutoff window
      const [returnRows] = await pool.execute<any[]>(
        `SELECT
           COUNT(*) AS return_count,
           MIN(return_number) AS beg_return_no,
           MAX(return_number) AS end_return_no,
           COALESCE(SUM(refund_amount), 0) AS total_returns
         FROM returns
         WHERE resolved_at > ?
           AND resolved_at <= ?
           AND status = 'completed'`,
        [startTime, endTime]
      );
      const returnSummary = returnRows[0];

      // 5. Query voided transactions resolved in this cutoff window
      const [voidRows] = await pool.execute<any[]>(
        `SELECT
           COUNT(*) AS void_count,
           MIN(s.invoice_number) AS beg_void_no,
           MAX(s.invoice_number) AS end_void_no,
           COALESCE(SUM(s.subtotal + COALESCE(s.vat_amount, 0)), 0) AS total_voids
         FROM sale_voids sv
         JOIN sales s ON s.id = sv.sale_id
         WHERE sv.resolved_at > ?
           AND sv.resolved_at <= ?
           AND sv.status = 'approved'`,
        [startTime, endTime]
      );
      const voidSummary = voidRows[0];

      const dailyGrossSales = round2(Number(allInvoicesSummary.gross_sales));
      const newGrandTotal = round2(oldGrandTotal + dailyGrossSales);
      const totalDiscounts = round2(Number(salesSummary.total_discounts));
      const totalReturns = round2(Number(returnSummary.total_returns));
      const totalVoids = round2(Number(voidSummary.total_voids));
      const netSales = round2(dailyGrossSales - totalDiscounts - totalReturns - totalVoids);

      res.status(200).json({
        preview: {
          z_counter_no: nextZCounterNo,
          z_counter_formatted: pad4(nextZCounterNo),
          reset_counter_no: nextResetCounterNo,
          opened_at: startTime.toISOString(),
          closed_at: endTime.toISOString(),
          reading_date: endTime.toISOString().slice(0, 10),
          beg_invoice_no: allInvoicesSummary.beg_invoice_no || null,
          end_invoice_no: allInvoicesSummary.end_invoice_no || null,
          beg_return_no: returnSummary.beg_return_no || null,
          end_return_no: returnSummary.end_return_no || null,
          beg_void_no: voidSummary.beg_void_no || null,
          end_void_no: voidSummary.end_void_no || null,
          old_grand_total: oldGrandTotal,
          daily_gross_sales: dailyGrossSales,
          new_grand_total: newGrandTotal,
          vatable_sales: round2(vatableSales),
          vat_amount: round2(Number(salesSummary.total_vat)),
          vat_exempt_sales: round2(vatExemptSales),
          zero_rated_sales: round2(zeroRatedSales),
          non_vat_sales: round2(nonVatSales),
          sc_discount: round2(Number(salesSummary.sc_discount)),
          pwd_discount: round2(Number(salesSummary.pwd_discount)),
          regular_discount: round2(Number(salesSummary.regular_discount)),
          total_discounts: totalDiscounts,
          total_returns: totalReturns,
          total_voids: totalVoids,
          net_sales: netSales,
          cash_sales: round2(Number(salesSummary.cash_sales)),
          credit_sales: round2(Number(salesSummary.credit_sales)),
          transaction_count: Number(salesSummary.transaction_count),
          void_count: Number(voidSummary.void_count),
          return_count: Number(returnSummary.return_count),
        },
      });
    } catch (err) {
      console.error("[bir/z-reading/preview]", err);
      res.status(500).json({ message: "Failed to generate Z-Reading preview." });
    }
  }
);

// ─── POST /api/bir/z-reading ──────────────────────────────────────────────────
// Atomically generate and commit the non-resettable Z-Reading record
router.post(
  "/z-reading",
  requireRole("Admin", "Cashier"),
  async (req: Request, res: Response): Promise<void> => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Lock and fetch the most recent Z-Reading row
      const [lastZRows] = await conn.execute<any[]>(
        `SELECT id, z_counter_no, reset_counter_no, old_grand_total, new_grand_total, closed_at
         FROM z_readings
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`
      );

      const lastZ = lastZRows[0] || null;
      const startTime = lastZ ? new Date(lastZ.closed_at) : new Date("1970-01-01T00:00:00Z");
      const endTime = new Date();

      const oldGrandTotal = lastZ ? Number(lastZ.new_grand_total) : 0;
      let nextZCounterNo = lastZ ? Number(lastZ.z_counter_no) + 1 : 1;
      let nextResetCounterNo = lastZ ? Number(lastZ.reset_counter_no) : 0;

      if (nextZCounterNo > 9999) {
        nextZCounterNo = 1;
        nextResetCounterNo += 1;
      }

      // 2. Query all issued invoices in this cutoff window for continuous sequence & gross sales
      const [allInvoicesRows] = await conn.execute<any[]>(
        `SELECT
           COUNT(*) AS total_issued_invoices,
           MIN(invoice_number) AS beg_invoice_no,
           MAX(invoice_number) AS end_invoice_no,
           COALESCE(SUM(subtotal + COALESCE(vat_amount, 0)), 0) AS gross_sales
         FROM sales
         WHERE created_at > ?
           AND created_at <= ?
           AND payment_status = 'completed'`,
        [startTime, endTime]
      );
      const allInvoicesSummary = allInvoicesRows[0];

      // 2b. Query completed non-voided sales in this cutoff window for valid revenue breakdown
      const [salesRows] = await conn.execute<any[]>(
        `SELECT
           COUNT(*) AS transaction_count,
           COALESCE(SUM(subtotal), 0) AS total_subtotal,
           COALESCE(SUM(vat_amount), 0) AS total_vat,
           COALESCE(SUM(vat_exempt_amount), 0) AS total_vat_exempt_base,
           COALESCE(SUM(total_amount), 0) AS total_sales_amount,
           COALESCE(SUM(discount), 0) AS total_discounts,
           COALESCE(SUM(CASE WHEN sc_pwd_type = 'SENIOR_CITIZEN' THEN discount ELSE 0 END), 0) AS sc_discount,
           COALESCE(SUM(CASE WHEN sc_pwd_type = 'PWD' THEN discount ELSE 0 END), 0) AS pwd_discount,
           COALESCE(SUM(CASE WHEN sc_pwd_type NOT IN ('SENIOR_CITIZEN', 'PWD') THEN discount ELSE 0 END), 0) AS regular_discount,
           COALESCE(SUM(CASE WHEN payment_type = 'CASH' THEN total_amount WHEN payment_type = 'CREDIT' THEN COALESCE(amount_paid_at_sale, 0) ELSE 0 END), 0) AS cash_sales,
           COALESCE(SUM(CASE WHEN payment_type = 'CREDIT' THEN (total_amount - COALESCE(amount_paid_at_sale, 0)) ELSE 0 END), 0) AS credit_sales
         FROM sales
         WHERE created_at > ?
           AND created_at <= ?
           AND payment_status = 'completed'
           AND void_status != 'voided'`,
        [startTime, endTime]
      );

      const salesSummary = salesRows[0];

      // 3. Tax breakdown per sale_item in cutoff window
      const [taxRows] = await conn.execute<any[]>(
        `SELECT
           si.tax_type,
           s.sc_pwd_type,
           COALESCE(SUM(si.taxable_amount), 0) AS sum_taxable,
           COALESCE(SUM(si.vat_amount), 0) AS sum_vat,
           COALESCE(SUM(si.subtotal), 0) AS sum_subtotal
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.created_at > ?
           AND s.created_at <= ?
           AND s.payment_status = 'completed'
           AND s.void_status != 'voided'
         GROUP BY si.tax_type, s.sc_pwd_type`,
        [startTime, endTime]
      );

      let vatableSales = 0;
      let vatExemptSales = 0;
      let zeroRatedSales = 0;
      let nonVatSales = 0;

      for (const row of taxRows) {
        const isScPwd = row.sc_pwd_type === "SENIOR_CITIZEN" || row.sc_pwd_type === "PWD";
        if (row.tax_type === "VATABLE") {
          if (isScPwd) {
            vatExemptSales += Number(row.sum_taxable);
          } else {
            vatableSales += Number(row.sum_taxable);
          }
        } else if (row.tax_type === "VAT_EXEMPT") {
          vatExemptSales += Number(row.sum_subtotal);
        } else if (row.tax_type === "ZERO_RATED") {
          zeroRatedSales += Number(row.sum_subtotal);
        } else {
          nonVatSales += Number(row.sum_subtotal);
        }
      }

      // 4. Query returns in this cutoff window
      const [returnRows] = await conn.execute<any[]>(
        `SELECT
           COUNT(*) AS return_count,
           MIN(return_number) AS beg_return_no,
           MAX(return_number) AS end_return_no,
           COALESCE(SUM(refund_amount), 0) AS total_returns
         FROM returns
         WHERE resolved_at > ?
           AND resolved_at <= ?
           AND status = 'completed'`,
        [startTime, endTime]
      );
      const returnSummary = returnRows[0];

      // 5. Query voided transactions resolved in this cutoff window
      const [voidRows] = await conn.execute<any[]>(
        `SELECT
           COUNT(*) AS void_count,
           MIN(s.invoice_number) AS beg_void_no,
           MAX(s.invoice_number) AS end_void_no,
           COALESCE(SUM(s.subtotal + COALESCE(s.vat_amount, 0)), 0) AS total_voids
         FROM sale_voids sv
         JOIN sales s ON s.id = sv.sale_id
         WHERE sv.resolved_at > ?
           AND sv.resolved_at <= ?
           AND sv.status = 'approved'`,
        [startTime, endTime]
      );
      const voidSummary = voidRows[0];

      const dailyGrossSales = round2(Number(allInvoicesSummary.gross_sales));
      const newGrandTotal = round2(oldGrandTotal + dailyGrossSales);
      const totalDiscounts = round2(Number(salesSummary.total_discounts));
      const totalReturns = round2(Number(returnSummary.total_returns));
      const totalVoids = round2(Number(voidSummary.total_voids));
      const netSales = round2(dailyGrossSales - totalDiscounts - totalReturns - totalVoids);
      const readingDate = endTime.toISOString().slice(0, 10);

      // 6. Insert new immutable Z-Reading row
      const [insertResult] = await conn.execute<any>(
        `INSERT INTO z_readings (
           z_counter_no, reset_counter_no, reading_date, opened_at, closed_at, generated_by,
           beg_invoice_no, end_invoice_no, beg_void_no, end_void_no, beg_return_no, end_return_no,
           old_grand_total, daily_gross_sales, new_grand_total,
           vatable_sales, vat_amount, vat_exempt_sales, zero_rated_sales, non_vat_sales,
           sc_discount, pwd_discount, regular_discount, total_discounts,
           total_returns, total_voids, net_sales, cash_sales, credit_sales,
           transaction_count, void_count, return_count
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          nextZCounterNo,
          nextResetCounterNo,
          readingDate,
          startTime,
          endTime,
          req.user!.id,
          allInvoicesSummary.beg_invoice_no || null,
          allInvoicesSummary.end_invoice_no || null,
          voidSummary.beg_void_no || null,
          voidSummary.end_void_no || null,
          returnSummary.beg_return_no || null,
          returnSummary.end_return_no || null,
          oldGrandTotal,
          dailyGrossSales,
          newGrandTotal,
          round2(vatableSales),
          round2(Number(salesSummary.total_vat)),
          round2(vatExemptSales),
          round2(zeroRatedSales),
          round2(nonVatSales),
          round2(Number(salesSummary.sc_discount)),
          round2(Number(salesSummary.pwd_discount)),
          round2(Number(salesSummary.regular_discount)),
          totalDiscounts,
          totalReturns,
          totalVoids,
          netSales,
          round2(Number(salesSummary.cash_sales)),
          round2(Number(salesSummary.credit_sales)),
          Number(salesSummary.transaction_count),
          Number(voidSummary.void_count),
          Number(returnSummary.return_count),
        ]
      );

      const zReadingId = insertResult.insertId;

      await logAuditEvent({
        action: "Z_READING_GENERATED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "z_readings",
        entityId: zReadingId,
        newValues: {
          z_counter_no: nextZCounterNo,
          reset_counter_no: nextResetCounterNo,
          old_grand_total: oldGrandTotal,
          daily_gross_sales: dailyGrossSales,
          new_grand_total: newGrandTotal,
          reading_date: readingDate,
        },
      });

      await conn.commit();

      res.status(201).json({
        message: `Z-Reading #${pad4(nextZCounterNo)} generated successfully.`,
        id: zReadingId,
        z_counter_no: nextZCounterNo,
        z_counter_formatted: pad4(nextZCounterNo),
        reset_counter_no: nextResetCounterNo,
        old_grand_total: oldGrandTotal,
        daily_gross_sales: dailyGrossSales,
        new_grand_total: newGrandTotal,
      });
    } catch (err) {
      await conn.rollback();
      console.error("[bir/z-reading/create]", err);
      res.status(500).json({ message: "Failed to generate and commit Z-Reading." });
    } finally {
      conn.release();
    }
  }
);

// ─── GET /api/bir/z-readings ──────────────────────────────────────────────────
// List historical Z-Readings with optional date filtering
router.get(
  "/z-readings",
  requireRole("Admin", "Cashier"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { date_from, date_to, limit = "100" } = req.query as Record<string, string>;
      const params: any[] = [];
      let whereClause = "WHERE 1=1";

      if (date_from) {
        whereClause += " AND zr.reading_date >= ?";
        params.push(date_from);
      }
      if (date_to) {
        whereClause += " AND zr.reading_date <= ?";
        params.push(date_to);
      }

      const limitNum = Math.min(Math.max(1, parseInt(String(limit), 10) || 100), 500);

      const [rows] = await pool.query<any[]>(
        `SELECT zr.*, u.full_name AS generated_by_name, u.username AS generated_by_username
         FROM z_readings zr
         LEFT JOIN users u ON u.id = zr.generated_by
         ${whereClause}
         ORDER BY zr.id DESC
         LIMIT ${limitNum}`,
        params
      );

      res.status(200).json({
        data: rows.map((r) => ({
          ...r,
          z_counter_formatted: pad4(r.z_counter_no),
        })),
      });
    } catch (err) {
      console.error("[bir/z-readings/list]", err);
      res.status(500).json({ message: "Failed to retrieve Z-Readings." });
    }
  }
);

// ─── GET /api/bir/z-reading/:id ───────────────────────────────────────────────
// Get full details of a specific Z-Reading (for printing/viewing)
router.get(
  "/z-reading/:id",
  requireRole("Admin", "Cashier"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = Number(req.params.id);
      const [rows] = await pool.execute<any[]>(
        `SELECT zr.*, u.full_name AS generated_by_name, u.username AS generated_by_username
         FROM z_readings zr
         LEFT JOIN users u ON u.id = zr.generated_by
         WHERE zr.id = ?
         LIMIT 1`,
        [id]
      );

      if (rows.length === 0) {
        res.status(404).json({ message: "Z-Reading not found." });
        return;
      }

      const zReading = rows[0];
      res.status(200).json({
        ...zReading,
        z_counter_formatted: pad4(zReading.z_counter_no),
      });
    } catch (err) {
      console.error("[bir/z-reading/:id]", err);
      res.status(500).json({ message: "Failed to retrieve Z-Reading details." });
    }
  }
);

// ─── GET /api/bir/x-reading/:sessionId ────────────────────────────────────────
// Compute X-Reading shift report without altering Z-counter or accumulators
router.get(
  "/x-reading/:sessionId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = Number(req.params.sessionId);
      const [sessionRows] = await pool.execute<any[]>(
        `SELECT cs.*, u.full_name AS cashier_name, u.username AS cashier_username
         FROM cash_sessions cs
         JOIN users u ON u.id = cs.cashier_id
         WHERE cs.id = ?
         LIMIT 1`,
        [sessionId]
      );

      if (sessionRows.length === 0) {
        res.status(404).json({ message: "Shift session not found." });
        return;
      }

      const session = sessionRows[0];
      // Only Cashier of the session or Admin can view
      if (req.user!.role !== "Admin" && session.cashier_id !== req.user!.id) {
        res.status(403).json({ message: "Forbidden" });
        return;
      }

      const openedAt = new Date(session.opened_at);
      const closedAt = session.closed_at ? new Date(session.closed_at) : new Date();

      // Query all issued invoices in this session for sequence continuity
      const [allShiftInvoicesRows] = await pool.execute<any[]>(
        `SELECT
           MIN(invoice_number) AS beg_invoice_no,
           MAX(invoice_number) AS end_invoice_no
         FROM sales
         WHERE cashier_id = ?
           AND created_at >= ?
           AND created_at <= ?
           AND payment_status = 'completed'`,
        [session.cashier_id, openedAt, closedAt]
      );
      const allShiftInvoices = allShiftInvoicesRows[0];

      // Query completed, non-voided sales for this session
      const [salesRows] = await pool.execute<any[]>(
        `SELECT
           COUNT(*) AS transaction_count,
           COALESCE(SUM(subtotal + COALESCE(vat_amount, 0)), 0) AS shift_gross,
           COALESCE(SUM(vat_amount), 0) AS total_vat,
           COALESCE(SUM(discount), 0) AS total_discounts,
           COALESCE(SUM(total_amount), 0) AS total_sales_amount,
           COALESCE(SUM(CASE WHEN payment_type = 'CASH' THEN total_amount WHEN payment_type = 'CREDIT' THEN COALESCE(amount_paid_at_sale, 0) ELSE 0 END), 0) AS cash_sales,
           COALESCE(SUM(CASE WHEN payment_type = 'CREDIT' THEN (total_amount - COALESCE(amount_paid_at_sale, 0)) ELSE 0 END), 0) AS credit_sales
         FROM sales
         WHERE cashier_id = ?
           AND created_at >= ?
           AND created_at <= ?
           AND payment_status = 'completed'
           AND void_status != 'voided'`,
        [session.cashier_id, openedAt, closedAt]
      );

      // Standalone credit (utang) collections
      const [creditPmtRows] = await pool.execute<any[]>(
        `SELECT COALESCE(SUM(ABS(amount)), 0) AS total_credit_collections
         FROM credit_ledger
         WHERE recorded_by = ?
           AND entry_type = 'PAYMENT'
           AND sale_id IS NULL
           AND created_at >= ?
           AND created_at <= ?`,
        [session.cashier_id, openedAt, closedAt]
      );

      // Refunds resolved by this cashier
      const [refundRows] = await pool.execute<any[]>(
        `SELECT COALESCE(SUM(refund_amount), 0) AS total_refunds
         FROM returns
         WHERE resolved_by = ?
           AND resolved_at >= ?
           AND resolved_at <= ?
           AND status = 'completed'`,
        [session.cashier_id, openedAt, closedAt]
      );

      const salesSummary = salesRows[0];
      const creditCollections = Number(creditPmtRows[0]?.total_credit_collections ?? 0);
      const cashRefunds = Number(refundRows[0]?.total_refunds ?? 0);
      const openingCash = Number(session.opening_cash ?? 0);
      const cashSales = Number(salesSummary.cash_sales ?? 0);
      const totalCashInflow = cashSales + creditCollections;
      const expectedCash = openingCash + totalCashInflow - cashRefunds;
      const actualCash = session.actual_cash !== null ? Number(session.actual_cash) : null;
      const variance = actualCash !== null ? actualCash - expectedCash : null;

      res.status(200).json({
        x_reading: {
          session_id: session.id,
          shift_label: session.shift_label,
          cashier_name: session.cashier_name,
          cashier_username: session.cashier_username,
          opened_at: session.opened_at,
          closed_at: session.closed_at || null,
          session_status: session.session_status,
          beg_invoice_no: allShiftInvoices.beg_invoice_no || null,
          end_invoice_no: allShiftInvoices.end_invoice_no || null,
          transaction_count: Number(salesSummary.transaction_count),
          shift_gross: round2(Number(salesSummary.shift_gross)),
          shift_discounts: round2(Number(salesSummary.total_discounts)),
          shift_refunds: round2(cashRefunds),
          shift_net: round2(Number(salesSummary.total_sales_amount) - cashRefunds),
          opening_cash: round2(openingCash),
          cash_sales: round2(cashSales),
          credit_collections: round2(creditCollections),
          cash_refunds: round2(cashRefunds),
          expected_cash: round2(expectedCash),
          actual_cash: actualCash !== null ? round2(actualCash) : null,
          variance: variance !== null ? round2(variance) : null,
          status: session.status || (variance !== null ? (Math.abs(variance) < 0.01 ? "Balanced" : variance < 0 ? "Short" : "Over") : "Open"),
        },
      });
    } catch (err) {
      console.error("[bir/x-reading/:sessionId]", err);
      res.status(500).json({ message: "Failed to generate X-Reading." });
    }
  }
);

// ─── GET /api/bir/esales/export ───────────────────────────────────────────────
// Generates official BIR eSales Monthly Sales Report in CSV format (NO Header Row)
// Format: TIN,BRANCH,MM,YYYY,MIN,LastInvoice,GrossSales
// Filename: POS_SALES_{TIN}{BRANCH}_{MMYYYY}_F001.csv
router.get(
  "/esales/export",
  requireRole("Admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { month, year } = req.query as { month?: string; year?: string };
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      const targetYear = Number(year) || currentYear;
      const targetMonth = Number(month) || currentMonth;

      const monthStr = String(targetMonth).padStart(2, "0");
      const mmyyyy = `${monthStr}${targetYear}`;

      // 1. Fetch system store settings for MIN, TIN, Branch Code
      const [settingsRows] = await pool.execute<any[]>(
        `SELECT store_name, registered_taxpayer_name, tin, branch_code, ptu_or_accn_no, pos_min, pos_serial FROM system_settings WHERE id = 1 LIMIT 1`
      );
      const settings = settingsRows[0] || {};
      const min = (settings.pos_min || "0000000000000000").trim();
      const cleanTin = (settings.tin || "000000000").replace(/[^0-9]/g, "");
      const tin = cleanTin.slice(0, 9).padEnd(9, "0");
      const branchCode = (settings.branch_code || "00000").replace(/[^0-9]/g, "").padStart(5, "0").slice(0, 5);

      // 2. Query z_readings table for SUM(daily_gross_sales) and final end_invoice_no for that month
      const [zRows] = await pool.execute<any[]>(
        `SELECT id, reading_date, end_invoice_no, daily_gross_sales
         FROM z_readings
         WHERE YEAR(reading_date) = ? AND MONTH(reading_date) = ?
         ORDER BY id ASC`,
        [targetYear, targetMonth]
      );

      // 3. Determine Ending Invoice Number and Monthly Gross Sales
      const lastZ = zRows.length > 0 ? zRows[zRows.length - 1] : null;
      const endingInvoiceNo = lastZ?.end_invoice_no || "N/A";
      const monthlyGrossSales = zRows.reduce((sum, r) => sum + Number(r.daily_gross_sales || 0), 0);

      // 4. Output a single CSV string row: TIN,BRANCH,MM,YYYY,MIN,LastInvoice,GrossSales
      // Format sales strictly as Number().toFixed(2) (NO COMMAS in the number)
      const csvRow = `${tin},${branchCode},${monthStr},${targetYear},${min},${endingInvoiceNo},${monthlyGrossSales.toFixed(2)}\r\n`;

      // Filename format: POS_SALES_{TIN}{BRANCH}_{MMYYYY}_F001.csv
      const filename = `POS_SALES_${tin}${branchCode}_${mmyyyy}_F001.csv`;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.status(200).send(csvRow);
    } catch (err) {
      console.error("[bir/esales/export]", err);
      res.status(500).json({ message: "Failed to generate BIR eSales CSV file." });
    }
  }
);

export default router;
