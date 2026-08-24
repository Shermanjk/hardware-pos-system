import { Request, Response, Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { logAuditEvent } from "../utils/auditLogger.js";

const router = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────
const createDiscountSchema = z.object({
  discount_name: z.string().min(1, "Discount name is required"),
  discount_type: z.enum(["Percentage", "Fixed"]),
  value: z.number().positive("Value must be positive"),
  requires_admin_approval: z.boolean().optional(),
  is_sc_pwd: z.boolean().optional(),
  status: z.enum(["Active", "Inactive"]).optional(),
});

const updateDiscountSchema = z.object({
  discount_name: z.string().min(1).optional(),
  discount_type: z.enum(["Percentage", "Fixed"]).optional(),
  value: z.number().positive().optional(),
  requires_admin_approval: z.boolean().optional(),
  is_sc_pwd: z.boolean().optional(),
  status: z.enum(["Active", "Inactive"]).optional(),
});

// ─── GET / — List all discounts (Admin only) ───────────────────────────────────
router.get(
  "/",
  authenticate,
  requireRole("Admin"),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT d.id, d.discount_name, d.discount_type, d.value, d.status, 
                d.requires_admin_approval, d.is_sc_pwd, d.created_by, d.created_at, d.updated_at,
                u.username AS created_by_username
         FROM discounts d
         LEFT JOIN users u ON u.id = d.created_by
         ORDER BY d.created_at DESC`
      );

      const discounts = rows.map((r: any) => ({
        id: r.id,
        discount_name: r.discount_name,
        discount_type: r.discount_type,
        value: Number(r.value),
        status: r.status,
        requires_admin_approval: r.requires_admin_approval === 1 || r.requires_admin_approval === true,
        is_sc_pwd: r.is_sc_pwd === 1 || r.is_sc_pwd === true,
        created_by: r.created_by,
        created_by_username: r.created_by_username,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));

      res.status(200).json(discounts);
    } catch (err) {
      console.error("[GET /api/discounts] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── GET /active — List active discounts for cashier (Cashier, Admin) ───────────
router.get(
  "/active",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT id, discount_name, discount_type, value, requires_admin_approval, is_sc_pwd
         FROM discounts
         WHERE status = 'Active'
         ORDER BY discount_name ASC`
      );

      const discounts = rows.map((r: any) => ({
        id: r.id,
        discount_name: r.discount_name,
        discount_type: r.discount_type,
        value: Number(r.value),
        requires_admin_approval: r.requires_admin_approval === 1 || r.requires_admin_approval === true,
        is_sc_pwd: r.is_sc_pwd === 1 || r.is_sc_pwd === true,
      }));

      res.status(200).json(discounts);
    } catch (err) {
      console.error("[GET /api/discounts/active] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── POST / — Create new discount (Admin only) ──────────────────────────────────
router.post(
  "/",
  authenticate,
  requireRole("Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = createDiscountSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      res.status(400).json({ message: errors[0]?.message ?? "Invalid request", errors });
      return;
    }

    const {
      discount_name,
      discount_type,
      value,
      requires_admin_approval = false,
      is_sc_pwd = false,
      status = "Active",
    } = parsed.data;

    try {
      const [result] = await pool.execute<any>(
        `INSERT INTO discounts (discount_name, discount_type, value, requires_admin_approval, is_sc_pwd, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [discount_name, discount_type, value, requires_admin_approval ? 1 : 0, is_sc_pwd ? 1 : 0, status, req.user!.id]
      );

      await logAuditEvent({
        action: "DISCOUNT_CREATED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "discounts",
        entityId: result.insertId,
        newValues: {
          discount_name,
          discount_type,
          value,
          requires_admin_approval,
          is_sc_pwd,
          status,
        },
      });

      res.status(201).json({
        id: result.insertId,
        discount_name,
        discount_type,
        value,
        requires_admin_approval,
        is_sc_pwd,
        status,
      });
    } catch (err) {
      console.error("[POST /api/discounts] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── PATCH /:id — Edit discount (Admin only) ───────────────────────────────────
router.patch(
  "/:id",
  authenticate,
  requireRole("Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const discountId = Number(req.params.id);
    if (!Number.isInteger(discountId) || discountId <= 0) {
      res.status(400).json({ message: "Invalid discount ID." });
      return;
    }

    const parsed = updateDiscountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid request." });
      return;
    }

    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ message: "No fields to update." });
      return;
    }

    try {
      // Get current discount for audit log
      const [current] = await pool.execute<any[]>(
        `SELECT * FROM discounts WHERE id = ?`,
        [discountId]
      );
      if (current.length === 0) {
        res.status(404).json({ message: "Discount not found." });
        return;
      }

      const currentDiscount = current[0];

      // Build update query dynamically
      const setClauses: string[] = [];
      const values: any[] = [];

      if (updates.discount_name !== undefined) {
        setClauses.push("discount_name = ?");
        values.push(updates.discount_name);
      }
      if (updates.discount_type !== undefined) {
        setClauses.push("discount_type = ?");
        values.push(updates.discount_type);
      }
      if (updates.value !== undefined) {
        setClauses.push("value = ?");
        values.push(updates.value);
      }
      if (updates.requires_admin_approval !== undefined) {
        setClauses.push("requires_admin_approval = ?");
        values.push(updates.requires_admin_approval ? 1 : 0);
      }
      if (updates.is_sc_pwd !== undefined) {
        setClauses.push("is_sc_pwd = ?");
        values.push(updates.is_sc_pwd ? 1 : 0);
      }
      if (updates.status !== undefined) {
        setClauses.push("status = ?");
        values.push(updates.status);
      }

      values.push(discountId);

      await pool.execute(
        `UPDATE discounts SET ${setClauses.join(", ")} WHERE id = ?`,
        values
      );

      await logAuditEvent({
        action: "DISCOUNT_UPDATED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "discounts",
        entityId: discountId,
        previousValues: {
          discount_name: currentDiscount.discount_name,
          discount_type: currentDiscount.discount_type,
          value: Number(currentDiscount.value),
          requires_admin_approval: currentDiscount.requires_admin_approval === 1,
          is_sc_pwd: currentDiscount.is_sc_pwd === 1 || currentDiscount.is_sc_pwd === true,
          status: currentDiscount.status,
        },
        newValues: updates,
      });

      res.status(200).json({ message: "Discount updated successfully." });
    } catch (err) {
      console.error("[PATCH /api/discounts/:id] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── DELETE /:id — Delete discount (Admin only) ────────────────────────────────
router.delete(
  "/:id",
  authenticate,
  requireRole("Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const discountId = Number(req.params.id);
    if (!Number.isInteger(discountId) || discountId <= 0) {
      res.status(400).json({ message: "Invalid discount ID." });
      return;
    }

    try {
      // Check if discount exists
      const [current] = await pool.execute<any[]>(
        `SELECT * FROM discounts WHERE id = ?`,
        [discountId]
      );
      if (current.length === 0) {
        res.status(404).json({ message: "Discount not found." });
        return;
      }

      const discount = current[0];

      // Check if discount is used in any sales
      const [salesCheck] = await pool.execute<any[]>(
        `SELECT COUNT(*) AS count FROM sales WHERE discount_id = ?`,
        [discountId]
      );
      if (salesCheck[0].count > 0) {
        res.status(422).json({
          message: "Cannot delete discount. It has been used in sales transactions. You may change its status to Inactive instead.",
        });
        return;
      }

      // Check if discount has pending approval requests
      const [pendingCheck] = await pool.execute<any[]>(
        `SELECT COUNT(*) AS count FROM discount_requests WHERE discount_id = ? AND status = 'pending'`,
        [discountId]
      );
      if (pendingCheck[0].count > 0) {
        res.status(422).json({
          message: "Cannot delete discount while approval requests are pending. Please review or reject the pending requests first.",
        });
        return;
      }

      // Delete unattached or cancelled discount requests
      await pool.execute(`DELETE FROM discount_requests WHERE discount_id = ?`, [discountId]);

      // Delete the discount
      await pool.execute(`DELETE FROM discounts WHERE id = ?`, [discountId]);

      await logAuditEvent({
        action: "DISCOUNT_DELETED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "discounts",
        entityId: discountId,
        previousValues: {
          discount_name: discount.discount_name,
          discount_type: discount.discount_type,
          value: Number(discount.value),
          requires_admin_approval: discount.requires_admin_approval === 1,
          is_sc_pwd: discount.is_sc_pwd === 1 || discount.is_sc_pwd === true,
          status: discount.status,
        },
      });

      res.status(200).json({ message: "Discount deleted successfully." });
    } catch (err) {
      console.error("[DELETE /api/discounts/:id] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

export default router;
