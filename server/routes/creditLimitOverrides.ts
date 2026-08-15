import bcrypt from "bcryptjs";
import { Request, Response, Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { logAuditEvent } from "../utils/auditLogger.js";
import {
  broadcastCreditLimitOverrideRequest,
  sendCreditLimitOverrideDecision,
  broadcastEntityUpdate,
} from "../ws.js";

const router = Router();

// ─── Validation schemas ────────────────────────────────────────────────────────

const createOverrideSchema = z.object({
  customer_id:      z.number().int().positive(),
  requested_amount: z.number().positive(),
  reason:           z.string().optional(),
});

const decisionSchema = z.object({
  rejection_reason: z.string().optional(),
  admin_password:   z.string().min(1, "Admin password is required"),
});

// ─── POST / — Cashier requests a credit limit override ─────────────────────────
router.post(
  "/",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = createOverrideSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    const { customer_id, requested_amount, reason } = parsed.data;

    try {
      const [custRows] = await pool.execute<any[]>(
        `SELECT id, full_name, credit_limit, current_balance, is_credit_enabled
         FROM customers WHERE id = ?`,
        [customer_id]
      );
      if (custRows.length === 0) {
        res.status(404).json({ message: "Customer not found." });
        return;
      }
      const customer = custRows[0];
      if (!customer.is_credit_enabled) {
        res.status(422).json({ message: "Credit is not enabled for this customer." });
        return;
      }

      // Check if there's already a pending override for this customer
      const [existing] = await pool.execute<any[]>(
        `SELECT id FROM credit_limit_overrides
         WHERE customer_id = ? AND status = 'pending'`,
        [customer_id]
      );
      if (existing.length > 0) {
        res.status(409).json({ message: "A pending override request already exists for this customer.", override_id: existing[0].id });
        return;
      }

      const [result] = await pool.execute<any>(
        `INSERT INTO credit_limit_overrides
           (customer_id, requested_by, requested_amount, current_limit, current_balance, reason)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [customer_id, req.user!.id, requested_amount,
         customer.credit_limit, customer.current_balance, reason ?? null]
      );
      const overrideId: number = result.insertId;

      // Broadcast to all connected Admin terminals
      broadcastCreditLimitOverrideRequest({
        type: "credit_limit_override_request",
        override_id: overrideId,
        customer_id,
        customer_name: customer.full_name,
        requested_amount,
        current_limit: Number(customer.credit_limit),
        current_balance: Number(customer.current_balance),
        cashier_name: req.user!.full_name ?? req.user!.username,
        cashier_user_id: req.user!.id,
        reason: reason ?? null,
        created_at: new Date().toISOString(),
      });

      // Real-time system sync
      broadcastEntityUpdate({ entity: "requests", action: "created" });

      res.status(201).json({ override_id: overrideId, message: "Override request submitted. Waiting for admin approval." });
    } catch (err) {
      console.error("[POST /api/credit-limit-overrides]", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── GET /pending — Admin sees all pending override requests ──────────────────
router.get(
  "/pending",
  authenticate,
  requireRole("Admin"),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT clo.id, clo.customer_id, clo.requested_amount,
                clo.current_limit, clo.current_balance, clo.reason,
                clo.status, clo.created_at,
                c.full_name AS customer_name, c.customer_code,
                u.full_name AS cashier_name, u.id AS cashier_user_id
         FROM credit_limit_overrides clo
         JOIN customers c ON c.id = clo.customer_id
         JOIN users u     ON u.id = clo.requested_by
         WHERE clo.status = 'pending'
         ORDER BY clo.created_at ASC`
      );
      res.json(rows.map((r: any) => ({
        ...r,
        requested_amount: Number(r.requested_amount),
        current_limit:    Number(r.current_limit),
        current_balance:  Number(r.current_balance),
      })));
    } catch (err) {
      console.error("[GET /api/credit-limit-overrides/pending]", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── POST /:id/approve — Admin approves override ──────────────────────────────
router.post(
  "/:id/approve",
  authenticate,
  requireRole("Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const overrideId = Number(req.params.id);
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    // Verify admin password
    const [adminRows] = await pool.execute<any[]>(
      `SELECT password_hash FROM users WHERE id = ?`, [req.user!.id]
    );
    if (adminRows.length === 0) { res.status(403).json({ message: "User not found." }); return; }
    const pwValid = await bcrypt.compare(parsed.data.admin_password, adminRows[0].password_hash);
    if (!pwValid) { res.status(403).json({ message: "Incorrect admin password." }); return; }

    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT clo.*, c.full_name AS customer_name, u.id AS cashier_user_id, u.full_name AS cashier_name
         FROM credit_limit_overrides clo
         JOIN customers c ON c.id = clo.customer_id
         JOIN users u     ON u.id = clo.requested_by
         WHERE clo.id = ?`,
        [overrideId]
      );
      if (rows.length === 0) { res.status(404).json({ message: "Override request not found." }); return; }
      const override = rows[0];
      if (override.status !== "pending") {
        res.status(409).json({ message: `Override request is already ${override.status}.` });
        return;
      }

      await pool.execute(
        `UPDATE credit_limit_overrides
         SET status = 'approved', authorized_by = ?, resolved_at = NOW()
         WHERE id = ?`,
        [req.user!.id, overrideId]
      );

      sendCreditLimitOverrideDecision({
        type: "credit_limit_override_decision",
        override_id: overrideId,
        customer_id: override.customer_id,
        customer_name: override.customer_name,
        decision: "approved",
        admin_name: req.user!.full_name ?? req.user!.username,
        rejection_reason: null,
        cashier_user_id: override.cashier_user_id,
      });

      await logAuditEvent({
        action: "CREDIT_LIMIT_OVERRIDE_APPROVED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "credit_limit_overrides",
        entityId: overrideId,
        newValues: { customer_id: override.customer_id, requested_amount: override.requested_amount },
      });

      // Real-time system sync
      broadcastEntityUpdate({ entity: "requests", action: "approved" });

      res.json({ message: "Override approved.", override_id: overrideId });
    } catch (err) {
      console.error("[POST /api/credit-limit-overrides/:id/approve]", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── POST /:id/reject — Admin rejects override ────────────────────────────────
router.post(
  "/:id/reject",
  authenticate,
  requireRole("Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const overrideId = Number(req.params.id);
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    // Verify admin password
    const [adminRows] = await pool.execute<any[]>(
      `SELECT password_hash FROM users WHERE id = ?`, [req.user!.id]
    );
    if (adminRows.length === 0) { res.status(403).json({ message: "User not found." }); return; }
    const pwValid = await bcrypt.compare(parsed.data.admin_password, adminRows[0].password_hash);
    if (!pwValid) { res.status(403).json({ message: "Incorrect admin password." }); return; }

    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT clo.*, c.full_name AS customer_name, u.id AS cashier_user_id
         FROM credit_limit_overrides clo
         JOIN customers c ON c.id = clo.customer_id
         JOIN users u     ON u.id = clo.requested_by
         WHERE clo.id = ?`,
        [overrideId]
      );
      if (rows.length === 0) { res.status(404).json({ message: "Override request not found." }); return; }
      const override = rows[0];
      if (override.status !== "pending") {
        res.status(409).json({ message: `Override request is already ${override.status}.` });
        return;
      }

      await pool.execute(
        `UPDATE credit_limit_overrides
         SET status = 'rejected', authorized_by = ?, rejection_reason = ?, resolved_at = NOW()
         WHERE id = ?`,
        [req.user!.id, parsed.data.rejection_reason ?? null, overrideId]
      );

      sendCreditLimitOverrideDecision({
        type: "credit_limit_override_decision",
        override_id: overrideId,
        customer_id: override.customer_id,
        customer_name: override.customer_name,
        decision: "rejected",
        admin_name: req.user!.full_name ?? req.user!.username,
        rejection_reason: parsed.data.rejection_reason ?? null,
        cashier_user_id: override.cashier_user_id,
      });

      await logAuditEvent({
        action: "CREDIT_LIMIT_OVERRIDE_REJECTED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "credit_limit_overrides",
        entityId: overrideId,
        newValues: { rejection_reason: parsed.data.rejection_reason },
      });

      // Real-time system sync
      broadcastEntityUpdate({ entity: "requests", action: "rejected" });

      res.json({ message: "Override rejected.", override_id: overrideId });
    } catch (err) {
      console.error("[POST /api/credit-limit-overrides/:id/reject]", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

export default router;
