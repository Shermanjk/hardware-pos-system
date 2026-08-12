import bcrypt from "bcryptjs";
import { Request, Response, Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { logAuditEvent } from "../utils/auditLogger.js";
import { broadcastDiscountRequest, sendDiscountDecision } from "../ws.js";

const router = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────
const createDiscountRequestSchema = z.object({
  discount_id: z.number().int().positive(),
  requested_percentage: z.number().positive(),
  discount_amount: z.number().positive(),
  reason: z.string().min(1, "Reason is required"),
});

const rejectDiscountRequestSchema = z.object({
  rejection_reason: z.string().optional(),
});

// ─── POST / — Submit discount request (Cashier, Admin) ─────────────────────────
router.post(
  "/",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = createDiscountRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      res.status(400).json({ message: errors[0]?.message ?? "Invalid request", errors });
      return;
    }

    const {
      discount_id,
      requested_percentage,
      discount_amount,
      reason,
    } = parsed.data;

    try {
      // Verify discount exists and is active
      const [discountRows] = await pool.execute<any[]>(
        `SELECT id, discount_name, discount_type, value, requires_admin_approval, status
         FROM discounts WHERE id = ?`,
        [discount_id]
      );
      if (discountRows.length === 0) {
        res.status(404).json({ message: "Discount not found." });
        return;
      }
      const discount = discountRows[0];
      if (discount.status !== "Active") {
        res.status(422).json({ message: "Discount is not active." });
        return;
      }

      // Check if discount requires approval
      if (!discount.requires_admin_approval) {
        res.status(422).json({
          message: "This discount does not require admin approval. It can be applied directly.",
        });
        return;
      }

      // Check if there's already a pending request for this discount from this cashier
      // (optional - prevents duplicate requests)
      const [existingRequest] = await pool.execute<any[]>(
        `SELECT id FROM discount_requests
         WHERE discount_id = ? AND cashier_id = ? AND status = 'pending'
         LIMIT 1`,
        [discount_id, req.user!.id]
      );
      if (existingRequest.length > 0) {
        res.status(422).json({
          message: "You already have a pending request for this discount.",
          existing_id: existingRequest[0].id,
        });
        return;
      }

      const [result] = await pool.execute<any>(
        `INSERT INTO discount_requests
           (discount_id, cashier_id, requested_percentage, discount_amount, reason, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [discount_id, req.user!.id, requested_percentage, discount_amount, reason]
      );

      await logAuditEvent({
        action: "DISCOUNT_REQUESTED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "discount_requests",
        entityId: result.insertId,
        newValues: {
          discount_id,
          discount_name: discount.discount_name,
          requested_percentage,
          discount_amount,
          reason,
        },
      });

      res.status(201).json({
        id: result.insertId,
        discount_id,
        discount_name: discount.discount_name,
        requested_percentage,
        discount_amount,
        reason,
        status: "pending",
      });

      // Notify all admins in real-time
      broadcastDiscountRequest({
        type: "discount_request",
        request_id: result.insertId,
        discount_id,
        discount_name: discount.discount_name,
        requested_percentage,
        discount_amount,
        reason,
        cashier_name: req.user!.full_name ?? req.user!.username,
        cashier_user_id: req.user!.id,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[POST /api/discount-approvals] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── GET / — List pending requests (Admin only) ────────────────────────────────
router.get(
  "/",
  authenticate,
  requireRole("Admin"),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT dr.id, dr.discount_id, dr.cashier_id, dr.requested_percentage,
                dr.discount_amount, dr.reason, dr.status, dr.approved_by, dr.approved_at,
                dr.rejection_reason, dr.created_at,
                d.discount_name, d.discount_type, d.value,
                u.username AS cashier_username, u.full_name AS cashier_name
         FROM discount_requests dr
         JOIN discounts d ON d.id = dr.discount_id
         JOIN users u ON u.id = dr.cashier_id
         WHERE dr.status = 'pending'
         ORDER BY dr.created_at DESC`
      );

      const requests = rows.map((r: any) => ({
        id: r.id,
        discount_id: r.discount_id,
        discount_name: r.discount_name,
        discount_type: r.discount_type,
        discount_value: Number(r.value),
        cashier_id: r.cashier_id,
        cashier_username: r.cashier_username,
        cashier_name: r.cashier_name,
        requested_percentage: Number(r.requested_percentage),
        discount_amount: Number(r.discount_amount),
        reason: r.reason,
        status: r.status,
        created_at: r.created_at,
      }));

      res.status(200).json(requests);
    } catch (err) {
      console.error("[GET /api/discount-approvals] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── PATCH /:id/approve — Approve request (Admin only) ─────────────────────────
router.patch(
  "/:id/approve",
  authenticate,
  requireRole("Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      res.status(400).json({ message: "Invalid request ID." });
      return;
    }

    try {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [rows] = await conn.execute<any[]>(
          `SELECT dr.id, dr.discount_id, dr.cashier_id, dr.requested_percentage,
                  dr.discount_amount, dr.reason, dr.status, d.discount_name
           FROM discount_requests dr
           JOIN discounts d ON d.id = dr.discount_id
           WHERE dr.id = ? FOR UPDATE`,
          [requestId]
        );
        const request = rows[0];
        if (!request) {
          await conn.rollback();
          res.status(404).json({ message: "Discount request not found." });
          return;
        }
        if (request.status !== "pending") {
          await conn.rollback();
          res.status(422).json({ message: "Only pending requests can be approved." });
          return;
        }

        await conn.execute(
          `UPDATE discount_requests
           SET status = 'approved', approved_by = ?, approved_at = NOW()
           WHERE id = ?`,
          [req.user!.id, requestId]
        );

        await conn.commit();

        await logAuditEvent({
          action: "DISCOUNT_APPROVED",
          performedById: req.user!.id,
          performedByUsername: req.user!.username,
          entityType: "discount_requests",
          entityId: requestId,
          newValues: {
            discount_id: request.discount_id,
            discount_name: request.discount_name,
            requested_percentage: Number(request.requested_percentage),
            discount_amount: Number(request.discount_amount),
            reason: request.reason,
          },
        });

        // Notify the cashier who submitted the request
        sendDiscountDecision({
          type: "discount_decision",
          request_id: requestId,
          discount_id: request.discount_id,
          discount_name: request.discount_name,
          requested_percentage: Number(request.requested_percentage),
          discount_amount: Number(request.discount_amount),
          decision: "approved",
          admin_name: req.user!.full_name ?? req.user!.username,
          rejection_reason: null,
          cashier_user_id: request.cashier_id,
        });

        res.status(200).json({ message: "Discount request approved successfully." });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } catch (err) {
      console.error("[PATCH /api/discount-approvals/:id/approve] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── PATCH /:id/reject — Reject request (Admin only) ─────────────────────────
router.patch(
  "/:id/reject",
  authenticate,
  requireRole("Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      res.status(400).json({ message: "Invalid request ID." });
      return;
    }

    const parsed = rejectDiscountRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid request." });
      return;
    }

    try {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [rows] = await conn.execute<any[]>(
          `SELECT dr.id, dr.discount_id, dr.cashier_id, dr.requested_percentage,
                  dr.discount_amount, dr.reason, dr.status, d.discount_name
           FROM discount_requests dr
           JOIN discounts d ON d.id = dr.discount_id
           WHERE dr.id = ? FOR UPDATE`,
          [requestId]
        );
        const request = rows[0];
        if (!request) {
          await conn.rollback();
          res.status(404).json({ message: "Discount request not found." });
          return;
        }
        if (request.status !== "pending") {
          await conn.rollback();
          res.status(422).json({ message: "Only pending requests can be rejected." });
          return;
        }

        await conn.execute(
          `UPDATE discount_requests
           SET status = 'rejected', approved_by = ?, approved_at = NOW(), rejection_reason = ?
           WHERE id = ?`,
          [req.user!.id, parsed.data.rejection_reason ?? null, requestId]
        );

        await conn.commit();

        await logAuditEvent({
          action: "DISCOUNT_REJECTED",
          performedById: req.user!.id,
          performedByUsername: req.user!.username,
          entityType: "discount_requests",
          entityId: requestId,
          reason: parsed.data.rejection_reason,
          newValues: {
            discount_id: request.discount_id,
            discount_name: request.discount_name,
            requested_percentage: Number(request.requested_percentage),
            discount_amount: Number(request.discount_amount),
            reason: request.reason,
          },
        });

        // Notify the cashier who submitted the request
        sendDiscountDecision({
          type: "discount_decision",
          request_id: requestId,
          discount_id: request.discount_id,
          discount_name: request.discount_name,
          requested_percentage: Number(request.requested_percentage),
          discount_amount: Number(request.discount_amount),
          decision: "rejected",
          admin_name: req.user!.full_name ?? req.user!.username,
          rejection_reason: parsed.data.rejection_reason ?? null,
          cashier_user_id: request.cashier_id,
        });

        res.status(200).json({ message: "Discount request rejected successfully." });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } catch (err) {
      console.error("[PATCH /api/discount-approvals/:id/reject] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── POST /:id/local-override — Manager Override on Cashier Terminal ───────────
// The cashier terminal sends the admin's credentials directly. The server
// verifies them, checks the role is Admin, then approves the request exactly
// the same way the remote PATCH /:id/approve endpoint does — same DB update,
// same audit log, same WebSocket notification to any listening admin terminals.
const localOverrideSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

router.post(
  "/:id/local-override",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      res.status(400).json({ message: "Invalid request ID." });
      return;
    }

    const parsed = localOverrideSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request." });
      return;
    }

    const { username, password } = parsed.data;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // ── 1. Verify manager credentials ────────────────────────────────────
      const [userRows] = await conn.execute<any[]>(
        `SELECT id, username, full_name, password_hash, role, status
         FROM users WHERE username = ? LIMIT 1`,
        [username]
      );
      const manager = userRows[0];

      if (!manager || manager.status !== "Active") {
        await conn.rollback();
        res.status(401).json({ message: "Invalid credentials." });
        return;
      }

      const passwordMatch = await bcrypt.compare(password, manager.password_hash);
      if (!passwordMatch) {
        await conn.rollback();
        res.status(401).json({ message: "Invalid credentials." });
        return;
      }

      if (manager.role !== "Admin") {
        await conn.rollback();
        res.status(403).json({ message: "Only an Admin can authorize discounts." });
        return;
      }

      // Prevent a cashier from approving their own request using their own login
      // (edge case: if somehow an Admin is also acting as cashier)
      if (manager.id === req.user!.id) {
        await conn.rollback();
        res.status(403).json({ message: "You cannot authorize your own discount request." });
        return;
      }

      // ── 2. Load and lock the discount request ─────────────────────────────
      const [rows] = await conn.execute<any[]>(
        `SELECT dr.id, dr.discount_id, dr.cashier_id, dr.requested_percentage,
                dr.discount_amount, dr.reason, dr.status, d.discount_name
         FROM discount_requests dr
         JOIN discounts d ON d.id = dr.discount_id
         WHERE dr.id = ? FOR UPDATE`,
        [requestId]
      );
      const request = rows[0];

      if (!request) {
        await conn.rollback();
        res.status(404).json({ message: "Discount request not found." });
        return;
      }
      if (request.status !== "pending") {
        await conn.rollback();
        res.status(422).json({
          message: request.status === "approved"
            ? "This request was already approved."
            : "This request can no longer be approved.",
        });
        return;
      }

      // ── 3. Approve — identical DB update to remote approve endpoint ────────
      await conn.execute(
        `UPDATE discount_requests
         SET status = 'approved', approved_by = ?, approved_at = NOW()
         WHERE id = ?`,
        [manager.id, requestId]
      );

      await conn.commit();

      // ── 4. Audit log — records the manager who physically typed their creds ─
      await logAuditEvent({
        action: "DISCOUNT_APPROVED_LOCAL_OVERRIDE",
        performedById: manager.id,
        performedByUsername: manager.username,
        entityType: "discount_requests",
        entityId: requestId,
        newValues: {
          discount_id: request.discount_id,
          discount_name: request.discount_name,
          requested_percentage: Number(request.requested_percentage),
          discount_amount: Number(request.discount_amount),
          reason: request.reason,
          override_method: "local_manager_override",
          cashier_id: req.user!.id,
          cashier_username: req.user!.username,
        },
      });

      // ── 5. WebSocket — notify any admin terminals that may be listening ────
      sendDiscountDecision({
        type: "discount_decision",
        request_id: requestId,
        discount_id: request.discount_id,
        discount_name: request.discount_name,
        requested_percentage: Number(request.requested_percentage),
        discount_amount: Number(request.discount_amount),
        decision: "approved",
        admin_name: manager.full_name ?? manager.username,
        rejection_reason: null,
        cashier_user_id: request.cashier_id,
      });

      res.status(200).json({
        message: "Discount approved via manager override.",
        admin_name: manager.full_name ?? manager.username,
        admin_id: manager.id,
      });
    } catch (err) {
      await conn.rollback();
      console.error("[POST /api/discount-approvals/:id/local-override] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    } finally {
      conn.release();
    }
  }
);

// ─── DELETE /:id — Cancel request (Cashier, Admin) ─────────────────────────────
router.delete(
  "/:id",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      res.status(400).json({ message: "Invalid request ID." });
      return;
    }

    try {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [rows] = await conn.execute<any[]>(
          `SELECT dr.id, dr.cashier_id, dr.status, dr.discount_id, d.discount_name
           FROM discount_requests dr
           JOIN discounts d ON d.id = dr.discount_id
           WHERE dr.id = ? FOR UPDATE`,
          [requestId]
        );
        const request = rows[0];
        if (!request) {
          await conn.rollback();
          res.status(404).json({ message: "Discount request not found." });
          return;
        }
        if (request.status !== "pending") {
          await conn.rollback();
          res.status(422).json({ message: "Only pending requests can be cancelled." });
          return;
        }

        // Cashiers can only cancel their own requests
        if (req.user!.role === "Cashier" && request.cashier_id !== req.user!.id) {
          await conn.rollback();
          res.status(403).json({ message: "You can only cancel your own requests." });
          return;
        }

        await conn.execute(
          `UPDATE discount_requests SET status = 'cancelled' WHERE id = ?`,
          [requestId]
        );

        await conn.commit();

        await logAuditEvent({
          action: "DISCOUNT_REQUEST_CANCELLED",
          performedById: req.user!.id,
          performedByUsername: req.user!.username,
          entityType: "discount_requests",
          entityId: requestId,
          newValues: {
            discount_id: request.discount_id,
            discount_name: request.discount_name,
          },
        });

        res.status(200).json({ message: "Discount request cancelled successfully." });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } catch (err) {
      console.error("[DELETE /api/discount-approvals/:id] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

export default router;
