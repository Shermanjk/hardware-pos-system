import { Request, Response, Router } from "express";
import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { logAuditEvent } from "../utils/auditLogger.js";
import { broadcastEntityUpdate } from "../ws.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate next customer code: CUST-0001 */
async function generateCustomerCode(conn: PoolConnection): Promise<string> {
  const [rows] = await conn.execute<any[]>(
    `SELECT COUNT(*) AS cnt FROM customers`
  );
  const next = Number(rows[0].cnt) + 1;
  return `CUST-${String(next).padStart(4, "0")}`;
}

/**
 * Recalculate and persist the denormalized current_balance from credit_ledger.
 * Always run this inside the same DB connection/transaction that modifies credit_ledger.
 */
export async function recalcCustomerBalance(
  conn: PoolConnection,
  customerId: number
): Promise<number> {
  const [rows] = await conn.execute<any[]>(
    `SELECT COALESCE(SUM(amount), 0) AS balance
     FROM credit_ledger
     WHERE customer_id = ?`,
    [customerId]
  );
  const balance = Number(rows[0].balance);
  await conn.execute(
    `UPDATE customers SET current_balance = ? WHERE id = ?`,
    [balance, customerId]
  );
  return balance;
}

/**
 * FIFO allocation: applies a payment amount against the oldest unpaid CREDIT_SALE
 * ledger entries for a customer.
 * Returns array of allocation records inserted.
 */
export async function applyFifoAllocation(
  conn: PoolConnection,
  paymentLedgerId: number,
  customerId: number,
  paymentAmount: number
): Promise<void> {
  // Fetch open credit sale entries oldest-first with their remaining balance
  const [saleEntries] = await conn.execute<any[]>(
    `SELECT cl.id,
            cl.amount AS original_amount,
            COALESCE(SUM(ca.amount_applied), 0) AS already_applied
     FROM credit_ledger cl
     LEFT JOIN credit_allocations ca ON ca.sale_ledger_id = cl.id
     WHERE cl.customer_id = ?
       AND cl.entry_type = 'CREDIT_SALE'
     GROUP BY cl.id, cl.amount
     HAVING (cl.amount - COALESCE(SUM(ca.amount_applied), 0)) > 0
     ORDER BY cl.created_at ASC`,
    [customerId]
  );

  let remaining = paymentAmount;
  for (const entry of saleEntries) {
    if (remaining <= 0) break;
    const unpaid = Number(entry.original_amount) - Number(entry.already_applied);
    const applied = Math.min(remaining, unpaid);
    await conn.execute(
      `INSERT INTO credit_allocations (payment_ledger_id, sale_ledger_id, amount_applied)
       VALUES (?, ?, ?)`,
      [paymentLedgerId, entry.id, applied]
    );
    remaining = Math.round((remaining - applied) * 100) / 100;
  }
}

// ─── Validation schemas ────────────────────────────────────────────────────────

const createCustomerSchema = z.object({
  full_name:       z.string().min(1),
  address:         z.string().optional(),
  contact_number:  z.string().optional(),
  tin:             z.string().optional(),
  business_style:  z.string().optional(),
});

const updateCustomerSchema = z.object({
  full_name:       z.string().min(1).optional(),
  address:         z.string().optional(),
  contact_number:  z.string().optional(),
  tin:             z.string().optional(),
  business_style:  z.string().optional(),
  status:          z.enum(["Active", "Inactive"]).optional(),
});

const creditSettingsSchema = z.object({
  is_credit_enabled: z.boolean(),
  credit_limit:      z.number().min(0),
});

const recordPaymentSchema = z.object({
  amount:  z.number().positive(),
  notes:   z.string().optional(),
});

const adjustmentSchema = z.object({
  amount:  z.number(),       // can be negative (write-off) or positive (add debt)
  notes:   z.string().min(1),
});

// ─── GET /api/customers/search?q= ─────────────────────────────────────────────
// Typeahead for cashier checkout — available to Cashier and Admin
router.get(
  "/search",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const q = String(req.query.q ?? "").trim();
    if (!q) { res.json([]); return; }
    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT c.id, c.customer_code, c.full_name, c.address, c.contact_number,
                c.credit_limit, c.current_balance, c.is_credit_enabled, c.status,
                COALESCE(
                  (SELECT SUM(csc.remaining_balance)
                   FROM customer_store_credit csc
                   WHERE csc.customer_id = c.id AND csc.status = 'active'),
                  0
                ) AS store_credit_balance
         FROM customers c
         WHERE c.status = 'Active'
           AND (c.full_name LIKE ? OR c.customer_code LIKE ? OR c.contact_number LIKE ?)
         ORDER BY c.full_name ASC
         LIMIT 20`,
        [`%${q}%`, `%${q}%`, `%${q}%`]
      );
      res.json(rows.map((r: any) => ({
        ...r,
        credit_limit:          Number(r.credit_limit),
        current_balance:       Number(r.current_balance),
        store_credit_balance:  Number(r.store_credit_balance || 0),
        is_credit_enabled:     r.is_credit_enabled === 1 || r.is_credit_enabled === true,
      })));
    } catch (err) {
      console.error("[GET /api/customers/search]", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── GET /api/customers ────────────────────────────────────────────────────────
router.get(
  "/",
  authenticate,
  requireRole("Admin", "Cashier"),
  async (req: Request, res: Response): Promise<void> => {
    const { status, credit_enabled, with_store_credit } = req.query as Record<string, string>;
    const conditions: string[] = [];
    const params: any[] = [];
    if (status) { conditions.push("c.status = ?"); params.push(status); }
    if (credit_enabled === "true") { conditions.push("c.is_credit_enabled = 1"); }
    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT c.id, c.customer_code, c.full_name, c.address, c.contact_number,
                c.tin, c.business_style, c.credit_limit, c.current_balance,
                c.is_credit_enabled, c.status, c.created_at,
                u.full_name AS created_by_name,
                COALESCE(
                  (SELECT SUM(csc.remaining_balance)
                   FROM customer_store_credit csc
                   WHERE csc.customer_id = c.id AND csc.status = 'active'),
                  0
                ) AS store_credit_balance
         FROM customers c
         LEFT JOIN users u ON u.id = c.created_by
         ${where}
         ORDER BY c.full_name ASC`,
        params
      );
      let mapped = rows.map((r: any) => ({
        ...r,
        credit_limit:          Number(r.credit_limit),
        current_balance:       Number(r.current_balance),
        store_credit_balance:  Number(r.store_credit_balance || 0),
        is_credit_enabled:     r.is_credit_enabled === 1 || r.is_credit_enabled === true,
      }));

      if (with_store_credit === "true") {
        mapped = mapped.filter((c) => c.store_credit_balance > 0);
      }

      res.json(mapped);
    } catch (err) {
      console.error("[GET /api/customers]", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── GET /api/customers/:id ────────────────────────────────────────────────────
router.get(
  "/:id",
  authenticate,
  requireRole("Admin", "Cashier"),
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT c.id, c.customer_code, c.full_name, c.address, c.contact_number,
                c.tin, c.business_style, c.credit_limit, c.current_balance,
                c.is_credit_enabled, c.status, c.created_at, c.updated_at,
                u.full_name AS created_by_name,
                COALESCE(
                  (SELECT SUM(csc.remaining_balance)
                   FROM customer_store_credit csc
                   WHERE csc.customer_id = c.id AND csc.status = 'active'),
                  0
                ) AS store_credit_balance
         FROM customers c
         LEFT JOIN users u ON u.id = c.created_by
         WHERE c.id = ?`,
        [id]
      );
      if (rows.length === 0) { res.status(404).json({ message: "Customer not found." }); return; }
      const r = rows[0];
      res.json({
        ...r,
        credit_limit:          Number(r.credit_limit),
        current_balance:       Number(r.current_balance),
        store_credit_balance:  Number(r.store_credit_balance || 0),
        is_credit_enabled:     r.is_credit_enabled === 1 || r.is_credit_enabled === true,
      });
    } catch (err) {
      console.error("[GET /api/customers/:id]", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── GET /api/customers/:id/store-credits ──────────────────────────────────────
router.get(
  "/:id/store-credits",
  authenticate,
  requireRole("Admin", "Cashier"),
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT csc.id, csc.credit_amount, csc.remaining_balance, csc.status,
                csc.issued_date, csc.expiration_date,
                r.return_number, s.invoice_number
         FROM customer_store_credit csc
         LEFT JOIN returns r ON r.id = csc.return_id
         LEFT JOIN sales s ON s.id = r.sale_id
         WHERE csc.customer_id = ?
         ORDER BY csc.issued_date DESC`,
        [id]
      );
      res.json(rows.map((r: any) => ({
        ...r,
        credit_amount:     Number(r.credit_amount),
        remaining_balance: Number(r.remaining_balance),
      })));
    } catch (err) {
      console.error("[GET /api/customers/:id/store-credits]", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── GET /api/customers/:id/ledger ────────────────────────────────────────────
router.get(
  "/:id/ledger",
  authenticate,
  requireRole("Admin", "Cashier"),
  async (req: Request, res: Response): Promise<void> => {
    const customerId = Number(req.params.id);
    try {
      // Fetch ledger entries with remaining balance for CREDIT_SALE entries
      const [entries] = await pool.execute<any[]>(
        `SELECT cl.id, cl.entry_type, cl.amount, cl.reference, cl.notes,
                cl.created_at, cl.sale_id,
                u.full_name AS recorded_by_name,
                au.full_name AS authorized_by_name,
                s.invoice_number,
                CASE WHEN cl.entry_type = 'CREDIT_SALE'
                     THEN cl.amount - COALESCE(
                       (SELECT SUM(ca.amount_applied) FROM credit_allocations ca WHERE ca.sale_ledger_id = cl.id),
                       0)
                     ELSE NULL
                END AS amount_remaining
         FROM credit_ledger cl
         LEFT JOIN users u  ON u.id  = cl.recorded_by
         LEFT JOIN users au ON au.id = cl.authorized_by
         LEFT JOIN sales s  ON s.id  = cl.sale_id
         WHERE cl.customer_id = ?
         ORDER BY cl.created_at DESC`,
        [customerId]
      );
      res.json(entries.map((e: any) => ({
        ...e,
        amount:           Number(e.amount),
        amount_remaining: e.amount_remaining !== null ? Number(e.amount_remaining) : null,
      })));
    } catch (err) {
      console.error("[GET /api/customers/:id/ledger]", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── POST /api/customers ───────────────────────────────────────────────────────
// Cashiers can create basic customers; Admin can create + immediately set credit.
router.post(
  "/",
  authenticate,
  requireRole("Admin", "Cashier"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = createCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
      res.status(400).json({ message: errors[0]?.message ?? "Invalid request", errors });
      return;
    }
    const { full_name, address, contact_number, tin, business_style } = parsed.data;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const code = await generateCustomerCode(conn);
      const [result] = await conn.execute<any>(
        `INSERT INTO customers
           (customer_code, full_name, address, contact_number, tin, business_style, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [code, full_name, address ?? null, contact_number ?? null,
         tin ?? null, business_style ?? null, req.user!.id]
      );
      await conn.commit();
      await logAuditEvent({
        action: "CUSTOMER_CREATED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "customers",
        entityId: result.insertId,
        newValues: { customer_code: code, full_name },
      });

      // Real-time system sync
      broadcastEntityUpdate({ entity: "customers", action: "created", id: result.insertId });
      broadcastEntityUpdate({ entity: "dashboard" });

      res.status(201).json({ id: result.insertId, customer_code: code, full_name });
    } catch (err) {
      await conn.rollback();
      console.error("[POST /api/customers]", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    } finally {
      conn.release();
    }
  }
);

// ─── PUT /api/customers/:id ───────────────────────────────────────────────────
// Update basic customer info (Admin + Cashier for own-created)
router.put(
  "/:id",
  authenticate,
  requireRole("Admin", "Cashier"),
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const parsed = updateCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ message: "No fields to update." });
      return;
    }
    const setClauses = Object.keys(updates).map((k) => `\`${k}\` = ?`).join(", ");
    const values = [...Object.values(updates), id];
    try {
      await pool.execute(`UPDATE customers SET ${setClauses} WHERE id = ?`, values);

      // Real-time system sync
      broadcastEntityUpdate({ entity: "customers", action: "updated", id, customerId: id });

      res.json({ message: "Customer updated." });
    } catch (err) {
      console.error("[PUT /api/customers/:id]", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── PUT /api/customers/:id/credit-settings ───────────────────────────────────
// Admin-only: enable/disable credit and set the credit limit
router.put(
  "/:id/credit-settings",
  authenticate,
  requireRole("Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const parsed = creditSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    const { is_credit_enabled, credit_limit } = parsed.data;
    try {
      const [existing] = await pool.execute<any[]>(
        `SELECT id, credit_limit, is_credit_enabled FROM customers WHERE id = ?`, [id]
      );
      if (existing.length === 0) { res.status(404).json({ message: "Customer not found." }); return; }
      await pool.execute(
        `UPDATE customers SET is_credit_enabled = ?, credit_limit = ? WHERE id = ?`,
        [is_credit_enabled ? 1 : 0, credit_limit, id]
      );
      await logAuditEvent({
        action: "CUSTOMER_CREDIT_SETTINGS_UPDATED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "customers",
        entityId: id,
        previousValues: { is_credit_enabled: existing[0].is_credit_enabled, credit_limit: existing[0].credit_limit },
        newValues: { is_credit_enabled, credit_limit },
      });

      // Real-time system sync
      broadcastEntityUpdate({ entity: "customers", action: "updated", id, customerId: id });
      broadcastEntityUpdate({ entity: "dashboard" });

      res.json({ message: "Credit settings updated." });
    } catch (err) {
      console.error("[PUT /api/customers/:id/credit-settings]", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── POST /api/customers/:id/payments ─────────────────────────────────────────
// Record a credit payment (Cashier + Admin)
router.post(
  "/:id/payments",
  authenticate,
  requireRole("Admin", "Cashier"),
  async (req: Request, res: Response): Promise<void> => {
    const customerId = Number(req.params.id);
    const parsed = recordPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    const { amount, notes } = parsed.data;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Verify customer exists and has outstanding balance
      const [custRows] = await conn.execute<any[]>(
        `SELECT id, full_name, current_balance, is_credit_enabled FROM customers WHERE id = ? FOR UPDATE`,
        [customerId]
      );
      if (custRows.length === 0) {
        await conn.rollback();
        res.status(404).json({ message: "Customer not found." });
        return;
      }
      const customer = custRows[0];
      if (Number(customer.current_balance) <= 0) {
        await conn.rollback();
        res.status(422).json({ message: "Customer has no outstanding credit balance." });
        return;
      }
      if (amount > Number(customer.current_balance)) {
        await conn.rollback();
        res.status(422).json({ message: `Payment amount exceeds outstanding balance of ₱${Number(customer.current_balance).toFixed(2)}.` });
        return;
      }

      // Generate CRR (Credit Receipt Reference) number
      const [seqRows] = await conn.execute<any[]>(
        `SELECT id, current_number FROM invoice_sequences WHERE prefix = 'CRR' LIMIT 1 FOR UPDATE`
      );
      let crrNumber = "CRR-000001";
      if (seqRows.length > 0) {
        const nextNum = Number(seqRows[0].current_number) + 1;
        crrNumber = `CRR-${String(nextNum).padStart(6, "0")}`;
        await conn.execute(
          `UPDATE invoice_sequences SET current_number = ? WHERE id = ?`,
          [nextNum, seqRows[0].id]
        );
      }

      // Insert PAYMENT ledger entry
      const [ledgerResult] = await conn.execute<any>(
        `INSERT INTO credit_ledger
           (customer_id, entry_type, amount, reference, notes, recorded_by)
         VALUES (?, 'PAYMENT', ?, ?, ?, ?)`,
        [customerId, -amount, crrNumber, notes ?? null, req.user!.id]
      );
      const paymentLedgerId: number = ledgerResult.insertId;

      // FIFO allocation
      await applyFifoAllocation(conn, paymentLedgerId, customerId, amount);

      // Recalculate and persist balance
      const newBalance = await recalcCustomerBalance(conn, customerId);

      await conn.commit();

      await logAuditEvent({
        action: "CREDIT_PAYMENT_RECORDED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "credit_ledger",
        entityId: paymentLedgerId,
        newValues: { customer_id: customerId, customer_name: customer.full_name, amount, reference: crrNumber, new_balance: newBalance },
      });

      // Real-time system sync
      broadcastEntityUpdate({ entity: "customers", action: "paid", id: customerId, customerId });
      broadcastEntityUpdate({ entity: "credit_ledger", customerId });
      broadcastEntityUpdate({ entity: "dashboard" });

      res.status(201).json({
        ledger_id: paymentLedgerId,
        reference: crrNumber,
        amount_paid: amount,
        new_balance: newBalance,
        customer_name: customer.full_name,
      });
    } catch (err) {
      await conn.rollback();
      console.error("[POST /api/customers/:id/payments]", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    } finally {
      conn.release();
    }
  }
);

// ─── POST /api/customers/:id/adjustments ──────────────────────────────────────
// Admin-only: balance adjustment (write-off, correction, etc.)
router.post(
  "/:id/adjustments",
  authenticate,
  requireRole("Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const customerId = Number(req.params.id);
    const parsed = adjustmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    const { amount, notes } = parsed.data;
    if (amount === 0) { res.status(400).json({ message: "Adjustment amount cannot be zero." }); return; }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [custRows] = await conn.execute<any[]>(
        `SELECT id, full_name FROM customers WHERE id = ? FOR UPDATE`, [customerId]
      );
      if (custRows.length === 0) {
        await conn.rollback();
        res.status(404).json({ message: "Customer not found." });
        return;
      }

      const [ledgerResult] = await conn.execute<any>(
        `INSERT INTO credit_ledger
           (customer_id, entry_type, amount, reference, notes, recorded_by, authorized_by)
         VALUES (?, 'ADJUSTMENT', ?, ?, ?, ?, ?)`,
        [customerId, amount, `ADJ-${Date.now()}`, notes, req.user!.id, req.user!.id]
      );
      const newBalance = await recalcCustomerBalance(conn, customerId);
      await conn.commit();

      await logAuditEvent({
        action: "CREDIT_ADJUSTMENT",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "credit_ledger",
        entityId: ledgerResult.insertId,
        newValues: { customer_id: customerId, amount, notes, new_balance: newBalance },
      });

      // Real-time system sync
      broadcastEntityUpdate({ entity: "customers", action: "adjusted", id: customerId, customerId });
      broadcastEntityUpdate({ entity: "credit_ledger", customerId });
      broadcastEntityUpdate({ entity: "dashboard" });

      res.status(201).json({ ledger_id: ledgerResult.insertId, amount, new_balance: newBalance });
    } catch (err) {
      await conn.rollback();
      console.error("[POST /api/customers/:id/adjustments]", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    } finally {
      conn.release();
    }
  }
);

export default router;
