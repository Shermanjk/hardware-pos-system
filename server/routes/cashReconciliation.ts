/**
 * Cash Reconciliation API
 *
 * POST   /api/cash-reconciliation/open-session         — Cashier: open a new shift session
 * GET    /api/cash-reconciliation/my-session           — Cashier: get own current open session
 * POST   /api/cash-reconciliation/close-session        — Cashier: submit end-of-shift cash count
 * GET    /api/cash-reconciliation                      — Admin:   list all sessions (filterable)
 * GET    /api/cash-reconciliation/:id                  — Admin/Cashier: get session detail
 * PATCH  /api/cash-reconciliation/:id/review           — Admin:   add review notes
 */

import { Request, Response, Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { logAuditEvent } from "../utils/auditLogger.js";

const router = Router();
router.use(authenticate);

// ─── Validation schemas ───────────────────────────────────────────────────────

const openSessionSchema = z.object({
  opening_cash: z.number().min(0, "Opening cash cannot be negative"),
  shift_label:  z.string().min(1).max(50).optional().default("Day Shift"),
});

const closeSessionSchema = z.object({
  actual_cash: z.number().min(0, "Actual cash cannot be negative"),
});

const reviewSchema = z.object({
  review_notes: z.string().max(2000).optional().default(""),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireAdmin(req: Request, res: Response): boolean {
  if (req.user?.role !== "Admin") {
    res.status(403).json({ message: "Forbidden — Admin only." });
    return false;
  }
  return true;
}

function requireCashier(req: Request, res: Response): boolean {
  if (req.user?.role !== "Cashier") {
    res.status(403).json({ message: "Forbidden — Cashier only." });
    return false;
  }
  return true;
}

// ─── POST /open-session ───────────────────────────────────────────────────────
// Cashier opens a new shift. Only one open session is allowed per cashier at a time.
router.post(
  "/open-session",
  requireRole("Cashier"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = openSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
      return;
    }

    const { opening_cash, shift_label } = parsed.data;
    const cashierId = req.user!.id;

    try {
      // Check for an already-open session
      const [existing] = await pool.execute<any[]>(
        `SELECT id FROM cash_sessions WHERE cashier_id = ? AND session_status = 'open' LIMIT 1`,
        [cashierId]
      );
      if (existing.length > 0) {
        res.status(409).json({ message: "You already have an open shift session. Please close it before starting a new one.", session_id: existing[0].id });
        return;
      }

      const today = new Date().toISOString().split("T")[0];
      const [result] = await pool.execute<any>(
        `INSERT INTO cash_sessions (cashier_id, shift_date, shift_label, opening_cash, session_status, opened_at)
         VALUES (?, ?, ?, ?, 'open', NOW())`,
        [cashierId, today, shift_label, opening_cash]
      );

      const sessionId = result.insertId;

      await logAuditEvent({
        action: "SHIFT_OPENED",
        performedById: cashierId,
        performedByUsername: req.user!.username,
        entityType: "cash_sessions",
        entityId: sessionId,
        newValues: { opening_cash, shift_label, shift_date: today },
      });

      res.status(201).json({ id: sessionId, message: "Shift session opened successfully." });
    } catch (err) {
      console.error("[cash-reconciliation/open-session]", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    }
  }
);

// ─── GET /my-session ─────────────────────────────────────────────────────────
// Cashier: returns the currently open session (if any).
router.get(
  "/my-session",
  requireRole("Cashier"),
  async (req: Request, res: Response): Promise<void> => {
    const cashierId = req.user!.id;
    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT id, shift_date, shift_label, opened_at, opening_cash, session_status
         FROM cash_sessions
         WHERE cashier_id = ? AND session_status = 'open'
         ORDER BY opened_at DESC
         LIMIT 1`,
        [cashierId]
      );
      if (rows.length === 0) {
        res.status(200).json({ session: null });
        return;
      }
      res.status(200).json({ session: rows[0] });
    } catch (err) {
      console.error("[cash-reconciliation/my-session]", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    }
  }
);

// ─── POST /close-session ──────────────────────────────────────────────────────
// Cashier submits the end-of-shift counted cash.
// The server calculates: expected_cash, variance, and status.
router.post(
  "/close-session",
  requireRole("Cashier"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = closeSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
      return;
    }

    const { actual_cash } = parsed.data;
    const cashierId = req.user!.id;

    try {
      // Fetch the open session
      const [sessions] = await pool.execute<any[]>(
        `SELECT id, opening_cash, opened_at, shift_date
         FROM cash_sessions
         WHERE cashier_id = ? AND session_status = 'open'
         ORDER BY opened_at DESC
         LIMIT 1`,
        [cashierId]
      );

      if (sessions.length === 0) {
        res.status(404).json({ message: "No open shift session found. Please start a shift first." });
        return;
      }

      const session     = sessions[0];
      const sessionId   = session.id;
      const openedAt    = new Date(session.opened_at);
      const openingCash = Number(session.opening_cash);

      // ── Calculate cash movements during this session ──────────────────────

      // 1. Total cash from direct sales during this session:
      //    - For pure CASH sales: total_amount entered the drawer.
      //    - For CREDIT sales: only amount_paid_at_sale (down payment) entered the drawer.
      const [salesRows] = await pool.execute<any[]>(
        `SELECT COALESCE(SUM(
           CASE
             WHEN payment_type = 'CREDIT' THEN COALESCE(amount_paid_at_sale, 0)
             ELSE total_amount
           END
         ), 0) AS total_cash_from_sales
         FROM sales
         WHERE cashier_id = ?
           AND payment_status = 'completed'
           AND transaction_status = 'Completed'
           AND void_status = 'active'
           AND created_at >= ?`,
        [cashierId, openedAt]
      );
      const cashFromSales = Number(salesRows[0]?.total_cash_from_sales ?? 0);

      // 2. Standalone credit (utang) payments collected at register during this session
      //    In credit_ledger, payments are recorded with entry_type = 'PAYMENT' and negative amount.
      //    Sale-time down payments have sale_id IS NOT NULL and are already counted in cashFromSales above.
      //    Standalone "Pay Utang" collections have sale_id IS NULL and are collected in cash.
      const [creditPmtRows] = await pool.execute<any[]>(
        `SELECT COALESCE(SUM(ABS(amount)), 0) AS total_credit_collections
         FROM credit_ledger
         WHERE recorded_by = ?
           AND entry_type = 'PAYMENT'
           AND sale_id IS NULL
           AND created_at >= ?`,
        [cashierId, openedAt]
      );
      const creditCollections = Number(creditPmtRows[0]?.total_credit_collections ?? 0);

      // Total gross cash inflow into the drawer
      const cashSales = cashFromSales + creditCollections;

      // 3. Cash refunds paid out (approved refunds) during this session
      //    Refunds are money paid OUT of the drawer back to the customer.
      const [refundRows] = await pool.execute<any[]>(
        `SELECT COALESCE(SUM(r.refund_amount), 0) AS total_refunds
         FROM returns r
         WHERE r.processed_by = ?
           AND r.status IN ('approved', 'completed')
           AND r.resolution = 'refund'
           AND r.created_at >= ?`,
        [cashierId, openedAt]
      );
      const cashRefunds = Number(refundRows[0]?.total_refunds ?? 0);

      // 4. Cash paid-out (reserved for future petty cash feature) — default 0
      const cashPaidOut = 0;

      // 5. Expected cash = opening float + cash sales (incl. down payments & utang collections) - refunds - paid-outs
      const expectedCash = openingCash + cashSales - cashRefunds - cashPaidOut;

      // 5. Variance = actual - expected  (positive = Over, negative = Short)
      const variance = actual_cash - expectedCash;

      // 6. Status classification (±1 centavo tolerance for rounding)
      let status: "Balanced" | "Short" | "Over";
      if (Math.abs(variance) < 0.01) {
        status = "Balanced";
      } else if (variance < 0) {
        status = "Short";
      } else {
        status = "Over";
      }

      // ── Persist the closed session ─────────────────────────────────────────
      await pool.execute(
        `UPDATE cash_sessions
         SET session_status = 'closed',
             closed_at      = NOW(),
             actual_cash    = ?,
             cash_sales     = ?,
             cash_refunds   = ?,
             cash_paid_out  = ?,
             expected_cash  = ?,
             variance       = ?,
             status         = ?
         WHERE id = ?`,
        [actual_cash, cashSales, cashRefunds, cashPaidOut, expectedCash, variance, status, sessionId]
      );

      await logAuditEvent({
        action: "SHIFT_CLOSED",
        performedById: cashierId,
        performedByUsername: req.user!.username,
        entityType: "cash_sessions",
        entityId: sessionId,
        newValues: {
          actual_cash,
          cash_sales:    cashSales,
          cash_refunds:  cashRefunds,
          cash_paid_out: cashPaidOut,
          expected_cash: expectedCash,
          variance,
          status,
        },
      });

      res.status(200).json({
        id:            sessionId,
        opening_cash:  openingCash,
        cash_sales:    cashSales,
        cash_refunds:  cashRefunds,
        cash_paid_out: cashPaidOut,
        expected_cash: expectedCash,
        actual_cash,
        variance,
        status,
        message:       "Shift closed and reconciliation saved.",
      });
    } catch (err) {
      console.error("[cash-reconciliation/close-session]", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    }
  }
);

// ─── GET /cashiers/list — Admin: list all cashiers (for filter dropdown) ──────
// MUST be registered before /:id so Express doesn't swallow "cashiers" as an id param.
router.get(
  "/cashiers/list",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT id, full_name, employee_id FROM users WHERE role = 'Cashier' AND status = 'Active' ORDER BY full_name ASC`
      );
      res.status(200).json(rows);
    } catch (err) {
      console.error("[cash-reconciliation/cashiers]", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    }
  }
);

// ─── GET / — Admin: list sessions ────────────────────────────────────────────
router.get(
  "/",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;

    const {
      cashier_id,
      date_from,
      date_to,
      shift_label,
      status,
      page = "1",
      limit = "20",
    } = req.query as Record<string, string>;

    try {
      const conditions: string[] = ["cs.session_status = 'closed'"];
      const params: unknown[]    = [];

      if (cashier_id) {
        conditions.push("cs.cashier_id = ?");
        params.push(Number(cashier_id));
      }
      if (date_from) {
        conditions.push("cs.shift_date >= ?");
        params.push(date_from);
      }
      if (date_to) {
        conditions.push("cs.shift_date <= ?");
        params.push(date_to);
      }
      if (shift_label) {
        conditions.push("cs.shift_label = ?");
        params.push(shift_label);
      }
      if (status && ["Balanced", "Short", "Over"].includes(status)) {
        conditions.push("cs.status = ?");
        params.push(status);
      }

      const where  = "WHERE " + conditions.join(" AND ");
      const limitInt  = Math.max(1, parseInt(limit, 10));
      const offsetInt = (Math.max(1, parseInt(page, 10)) - 1) * limitInt;

      // Use pool.query (non-prepared) so LIMIT/OFFSET integers are interpolated
      // directly — mysql2 pool.execute rejects LIMIT ? when the only params are
      // numeric literals (ER_WRONG_ARGUMENTS).
      const countSql = `SELECT COUNT(*) AS total FROM cash_sessions cs ${where}`;
      const [countRows] = await pool.query<any[]>(countSql, params);
      const total = Number(countRows[0]?.total ?? 0);

      const listSql = `
        SELECT
          cs.id,
          cs.shift_date,
          cs.shift_label,
          cs.opened_at,
          cs.closed_at,
          cs.opening_cash,
          cs.cash_sales,
          cs.cash_refunds,
          cs.cash_paid_out,
          cs.expected_cash,
          cs.actual_cash,
          cs.variance,
          cs.status,
          cs.review_notes,
          cs.reviewed_at,
          u.full_name  AS cashier_name,
          u.employee_id AS cashier_employee_id,
          rv.full_name AS reviewer_name
        FROM cash_sessions cs
        JOIN users u   ON u.id = cs.cashier_id
        LEFT JOIN users rv ON rv.id = cs.reviewed_by
        ${where}
        ORDER BY cs.closed_at DESC
        LIMIT ${limitInt} OFFSET ${offsetInt}`;
      const [rows] = await pool.query<any[]>(listSql, params);

      res.status(200).json({ data: rows, total, page: Number(page), limit: Number(limit) });
    } catch (err) {
      console.error("[cash-reconciliation/list] ERROR:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    }
  }
);

// ─── GET /:id — Session detail (admin or owning cashier) ─────────────────────
router.get(
  "/:id",
  async (req: Request, res: Response): Promise<void> => {
    const sessionId = Number(req.params.id);
    if (!sessionId || isNaN(sessionId)) {
      res.status(400).json({ message: "Invalid session ID." });
      return;
    }

    const user = req.user!;

    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT
           cs.*,
           u.full_name  AS cashier_name,
           u.employee_id AS cashier_employee_id,
           rv.full_name AS reviewer_name
         FROM cash_sessions cs
         JOIN users u   ON u.id = cs.cashier_id
         LEFT JOIN users rv ON rv.id = cs.reviewed_by
         WHERE cs.id = ?`,
        [sessionId]
      );

      if (rows.length === 0) {
        res.status(404).json({ message: "Session not found." });
        return;
      }

      const session = rows[0];

      // Cashier may only view their own sessions
      if (user.role === "Cashier" && session.cashier_id !== user.id) {
        res.status(403).json({ message: "Forbidden." });
        return;
      }

      // Fetch related sales for this session (for auditing)
      const [salesRows] = await pool.execute<any[]>(
        `SELECT id, invoice_number, total_amount, payment_type, amount_paid_at_sale, created_at, transaction_status, void_status, customer_name
         FROM sales
         WHERE cashier_id = ?
           AND payment_status = 'completed'
           AND created_at >= ?
           AND created_at <= COALESCE(?, NOW())
         ORDER BY created_at ASC`,
        [
          session.cashier_id,
          session.opened_at,
          session.closed_at ?? null,
        ]
      );

      // Fetch standalone credit (utang) payments collected during this session
      const [creditPmtRows] = await pool.execute<any[]>(
        `SELECT cl.id, cl.reference, ABS(cl.amount) AS amount, cl.created_at, cl.notes, c.full_name AS customer_name
         FROM credit_ledger cl
         JOIN customers c ON c.id = cl.customer_id
         WHERE cl.recorded_by = ?
           AND cl.entry_type = 'PAYMENT'
           AND cl.sale_id IS NULL
           AND cl.created_at >= ?
           AND cl.created_at <= COALESCE(?, NOW())
         ORDER BY cl.created_at ASC`,
        [
          session.cashier_id,
          session.opened_at,
          session.closed_at ?? null,
        ]
      );

      // Fetch related refunds for this session
      const [refundRows] = await pool.execute<any[]>(
        `SELECT r.id, r.return_number, r.refund_amount, r.created_at, r.resolution, s.invoice_number, r.status
         FROM returns r
         JOIN sales s ON s.id = r.sale_id
         WHERE r.processed_by = ?
           AND r.status IN ('approved', 'completed')
           AND r.resolution = 'refund'
           AND r.created_at >= ?
           AND r.created_at <= COALESCE(?, NOW())
         ORDER BY r.created_at ASC`,
        [
          session.cashier_id,
          session.opened_at,
          session.closed_at ?? null,
        ]
      );

      res.status(200).json({
        ...session,
        sales: salesRows,
        credit_collections: creditPmtRows,
        refunds: refundRows,
      });
    } catch (err) {
      console.error("[cash-reconciliation/detail]", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    }
  }
);

// ─── PATCH /:id/review — Admin adds review notes ─────────────────────────────
router.patch(
  "/:id/review",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;

    const sessionId = Number(req.params.id);
    if (!sessionId || isNaN(sessionId)) {
      res.status(400).json({ message: "Invalid session ID." });
      return;
    }

    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
      return;
    }

    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT id FROM cash_sessions WHERE id = ? AND session_status = 'closed'`,
        [sessionId]
      );
      if (rows.length === 0) {
        res.status(404).json({ message: "Session not found or not yet closed." });
        return;
      }

      await pool.execute(
        `UPDATE cash_sessions
         SET review_notes = ?, reviewed_by = ?, reviewed_at = NOW()
         WHERE id = ?`,
        [parsed.data.review_notes || null, req.user!.id, sessionId]
      );

      await logAuditEvent({
        action: "SHIFT_REVIEWED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "cash_sessions",
        entityId: sessionId,
        newValues: { review_notes: parsed.data.review_notes },
      });

      res.status(200).json({ message: "Review saved." });
    } catch (err) {
      console.error("[cash-reconciliation/review]", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    }
  }
);

export default router;
