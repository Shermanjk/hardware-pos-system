import { Router, Request, Response } from "express";
import { z } from "zod";
import { PoolConnection } from "mysql2/promise";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { generateReturnNumber } from "../utils/returnNumber.js";
import { validateReturnItems, ReturnItemPayload } from "../utils/validateReturn.js";

const router = Router();

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const createReturnSchema = z.object({
  sale_id: z.number().int().positive(),
  return_reason: z.string().min(1),
  items: z
    .array(
      z.object({
        sale_item_id: z.number().int().positive(),
        product_id: z.number().int().positive(),
        quantity_returned: z.number().int().positive(),
        unit_price: z.number().positive(),
      })
    )
    .min(1),
});

const rejectSchema = z.object({ return_reason: z.string().min(1) });

const resolveSchema = z.object({
  resolution: z.enum(["refund", "replacement"]),
  item_condition: z.enum(["good", "damaged"]),
});

// ─── Helper: fetch full return summary row ────────────────────────────────────
async function fetchReturnSummary(conn: PoolConnection, id: number): Promise<any | null> {
  const [rows] = await conn.execute<any[]>(
    `SELECT
       r.id,
       r.return_number,
       r.sale_id,
       s.invoice_number,
       s.customer_name,
       r.processed_by,
       u1.full_name  AS cashier_name,
       r.approved_by,
       u2.full_name  AS admin_name,
       r.status,
       r.resolution,
       r.item_condition,
       r.return_reason,
       r.refund_amount,
       r.created_at,
       r.resolved_at
     FROM returns r
     JOIN sales  s  ON s.id  = r.sale_id
     JOIN users  u1 ON u1.id = r.processed_by
     LEFT JOIN users u2 ON u2.id = r.approved_by
     WHERE r.id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

// ─── Helper: fetch return items ───────────────────────────────────────────────
async function fetchReturnItems(conn: PoolConnection, returnId: number): Promise<any[]> {
  const [rows] = await conn.execute<any[]>(
    `SELECT
       ri.id,
       ri.return_id,
       ri.sale_item_id,
       ri.product_id,
       p.name          AS product_name,
       ri.quantity_returned,
       ri.unit_price
     FROM return_items ri
     JOIN products p ON p.id = ri.product_id
     WHERE ri.return_id = ?`,
    [returnId]
  );
  return rows;
}

// ─── Task 5.4 — POST / (Cashier, Admin) ──────────────────────────────────────
router.post(
  "/",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = createReturnSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      res.status(400).json({ message: errors[0]?.message ?? "Invalid request", errors });
      return;
    }

    const { sale_id, return_reason, items } = parsed.data;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Validate return items against business rules
      const validation = await validateReturnItems(
        conn,
        sale_id,
        items as ReturnItemPayload[],
        new Date()
      );
      if (!validation.valid) {
        await conn.rollback();
        res.status(validation.status).json({ message: validation.message });
        return;
      }

      // Generate return number
      const return_number = await generateReturnNumber(conn);

      // Insert into returns
      const [returnResult] = await conn.execute<any>(
        `INSERT INTO returns
           (return_number, sale_id, processed_by, return_reason, status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [return_number, sale_id, req.user!.id, return_reason]
      );
      const return_id: number = returnResult.insertId;

      // Insert return_items
      for (const item of items) {
        await conn.execute(
          `INSERT INTO return_items
             (return_id, sale_item_id, product_id, quantity_returned, unit_price)
           VALUES (?, ?, ?, ?, ?)`,
          [
            return_id,
            item.sale_item_id,
            item.product_id,
            item.quantity_returned,
            item.unit_price,
          ]
        );
      }

      await conn.commit();
      res.status(201).json({ return_number, id: return_id });
    } catch (err) {
      await conn.rollback();
      console.error("[POST /api/returns] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);

// ─── Task 5.5 — GET / (Admin only) ───────────────────────────────────────────
router.get(
  "/",
  authenticate,
  requireRole("Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const { status, date_from, date_to } = req.query as Record<string, string | undefined>;

    try {
      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (status) {
        conditions.push("r.status = ?");
        params.push(status);
      }
      if (date_from) {
        conditions.push("DATE(r.created_at) >= ?");
        params.push(date_from);
      }
      if (date_to) {
        conditions.push("DATE(r.created_at) <= ?");
        params.push(date_to);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await pool.execute<any[]>(
        `SELECT
           r.id,
           r.return_number,
           s.invoice_number,
           s.customer_name,
           u1.full_name  AS cashier_name,
           u2.full_name  AS admin_name,
           r.status,
           r.resolution,
           r.item_condition,
           r.refund_amount,
           r.created_at,
           r.resolved_at
         FROM returns r
         JOIN sales  s  ON s.id  = r.sale_id
         JOIN users  u1 ON u1.id = r.processed_by
         LEFT JOIN users u2 ON u2.id = r.approved_by
         ${where}
         ORDER BY r.created_at DESC`,
        params
      );

      res.status(200).json(rows);
    } catch (err) {
      console.error("[GET /api/returns] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    }
  }
);

// ─── Task 5.6 — GET /:id (Cashier, Admin) ────────────────────────────────────
router.get(
  "/:id",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Invalid return ID." });
      return;
    }

    const conn = await pool.getConnection();
    try {
      const returnRow = await fetchReturnSummary(conn, id);
      if (!returnRow) {
        res.status(404).json({ message: "Return not found." });
        return;
      }

      const items = await fetchReturnItems(conn, id);
      res.status(200).json({ ...returnRow, items });
    } catch (err) {
      console.error("[GET /api/returns/:id] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);

// ─── Task 5.7 — PATCH /:id/approve (Admin only) ──────────────────────────────
router.patch(
  "/:id/approve",
  authenticate,
  requireRole("Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Invalid return ID." });
      return;
    }

    const conn = await pool.getConnection();
    try {
      // Fetch current return
      const [rows] = await conn.execute<any[]>(
        `SELECT id, status FROM returns WHERE id = ? LIMIT 1`,
        [id]
      );
      const returnRow = rows[0];
      if (!returnRow) {
        res.status(404).json({ message: "Return not found." });
        return;
      }
      if (returnRow.status !== "pending") {
        res.status(422).json({ message: "Only pending returns can be approved." });
        return;
      }

      await conn.execute(
        `UPDATE returns SET status = 'approved', approved_by = ?, resolved_at = NOW() WHERE id = ?`,
        [req.user!.id, id]
      );

      const updated = await fetchReturnSummary(conn, id);
      res.status(200).json(updated);
    } catch (err) {
      console.error("[PATCH /api/returns/:id/approve] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);

// ─── Task 5.8 — PATCH /:id/reject (Admin only) ───────────────────────────────
router.patch(
  "/:id/reject",
  authenticate,
  requireRole("Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Invalid return ID." });
      return;
    }

    const parsed = rejectSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      res.status(400).json({ message: errors[0]?.message ?? "Invalid request", errors });
      return;
    }

    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute<any[]>(
        `SELECT id, status FROM returns WHERE id = ? LIMIT 1`,
        [id]
      );
      const returnRow = rows[0];
      if (!returnRow) {
        res.status(404).json({ message: "Return not found." });
        return;
      }
      if (returnRow.status !== "pending") {
        res.status(422).json({ message: "Only pending returns can be rejected." });
        return;
      }

      await conn.execute(
        `UPDATE returns SET status = 'rejected', approved_by = ?, resolved_at = NOW(), return_reason = ? WHERE id = ?`,
        [req.user!.id, parsed.data.return_reason, id]
      );

      const updated = await fetchReturnSummary(conn, id);
      res.status(200).json(updated);
    } catch (err) {
      console.error("[PATCH /api/returns/:id/reject] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);

// ─── Task 5.9 — PATCH /:id/resolve (Cashier, Admin) ──────────────────────────
router.patch(
  "/:id/resolve",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Invalid return ID." });
      return;
    }

    const parsed = resolveSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      res.status(400).json({ message: errors[0]?.message ?? "Invalid request", errors });
      return;
    }

    const { resolution, item_condition } = parsed.data;

    // Fetch return with its items (no connection yet — pool query)
    const [returnRows] = await pool.execute<any[]>(
      `SELECT r.id, r.return_number, r.status, r.resolution
       FROM returns r
       WHERE r.id = ? LIMIT 1`,
      [id]
    );
    const returnRow = returnRows[0];
    if (!returnRow) {
      res.status(404).json({ message: "Return not found." });
      return;
    }
    if (returnRow.status !== "approved") {
      res.status(422).json({ message: "Return must be approved before resolution." });
      return;
    }
    if (returnRow.resolution !== null) {
      res.status(422).json({ message: "This return has already been resolved." });
      return;
    }

    // Fetch return items
    const [itemRows] = await pool.execute<any[]>(
      `SELECT ri.product_id, ri.quantity_returned, ri.unit_price, p.name AS product_name
       FROM return_items ri
       JOIN products p ON p.id = ri.product_id
       WHERE ri.return_id = ?`,
      [id]
    );

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (resolution === "refund") {
        // ── Refund path ──────────────────────────────────────────────────────
        let refund_amount = 0;

        for (const item of itemRows) {
          refund_amount += Number(item.unit_price) * Number(item.quantity_returned);

          if (item_condition === "good") {
            await conn.execute(
              `UPDATE products SET quantity = quantity + ? WHERE id = ?`,
              [item.quantity_returned, item.product_id]
            );
          } else {
            // damaged
            await conn.execute(
              `UPDATE products SET damaged_stock = damaged_stock + ? WHERE id = ?`,
              [item.quantity_returned, item.product_id]
            );
          }

          await conn.execute(
            `INSERT INTO inventory_logs (product_id, action, quantity_change, reference, user_id)
             VALUES (?, 'return_refund', ?, ?, ?)`,
            [item.product_id, item.quantity_returned, returnRow.return_number, req.user!.id]
          );
        }

        await conn.execute(
          `UPDATE returns
           SET resolution = 'refund', item_condition = ?, refund_amount = ?, resolved_at = NOW()
           WHERE id = ?`,
          [item_condition, refund_amount.toFixed(2), id]
        );

        await conn.execute(
          `INSERT INTO activity_logs (user_id, action, reference)
           VALUES (?, 'return_refund', ?)`,
          [req.user!.id, returnRow.return_number]
        );
      } else {
        // ── Replacement path ─────────────────────────────────────────────────
        // Check stock availability first
        for (const item of itemRows) {
          const [stockRows] = await conn.execute<any[]>(
            `SELECT quantity FROM products WHERE id = ? FOR UPDATE`,
            [item.product_id]
          );
          const stock = stockRows[0];
          if (!stock || stock.quantity === 0) {
            await conn.rollback();
            res
              .status(409)
              .json({
                message: `Replacement cannot be processed — no available stock for: ${item.product_name}.`,
              });
            return;
          }
        }

        for (const item of itemRows) {
          // Return the item back to stock (good → sellable, damaged → damaged_stock)
          if (item_condition === "good") {
            await conn.execute(
              `UPDATE products SET quantity = quantity + ? WHERE id = ?`,
              [item.quantity_returned, item.product_id]
            );
          } else {
            await conn.execute(
              `UPDATE products SET damaged_stock = damaged_stock + ? WHERE id = ?`,
              [item.quantity_returned, item.product_id]
            );
          }

          await conn.execute(
            `INSERT INTO inventory_logs (product_id, action, quantity_change, reference, user_id)
             VALUES (?, 'return_replacement_in', ?, ?, ?)`,
            [item.product_id, item.quantity_returned, returnRow.return_number, req.user!.id]
          );

          // Replacement goes out — deduct sellable stock
          await conn.execute(
            `UPDATE products SET quantity = quantity - ? WHERE id = ?`,
            [item.quantity_returned, item.product_id]
          );

          await conn.execute(
            `INSERT INTO inventory_logs (product_id, action, quantity_change, reference, user_id)
             VALUES (?, 'return_replacement_out', ?, ?, ?)`,
            [item.product_id, -item.quantity_returned, returnRow.return_number, req.user!.id]
          );
        }

        await conn.execute(
          `UPDATE returns
           SET resolution = 'replacement', item_condition = ?, resolved_at = NOW()
           WHERE id = ?`,
          [item_condition, id]
        );

        await conn.execute(
          `INSERT INTO activity_logs (user_id, action, reference)
           VALUES (?, 'return_replacement', ?)`,
          [req.user!.id, returnRow.return_number]
        );
      }

      await conn.commit();

      // Return full resolved return
      const finalReturn = await fetchReturnSummary(conn, id);
      const finalItems = await fetchReturnItems(conn, id);
      res.status(200).json({ ...finalReturn, items: finalItems });
    } catch (err) {
      await conn.rollback();
      console.error("[PATCH /api/returns/:id/resolve] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);

export default router;
