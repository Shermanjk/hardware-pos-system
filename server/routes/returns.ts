import bcrypt from "bcryptjs";
import { Request, Response, Router } from "express";
import { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { logAuditEvent } from "../utils/auditLogger.js";
import { generateReturnNumber } from "../utils/returnNumber.js";
import { ReturnItemPayload, validateReturnItems } from "../utils/validateReturn.js";
import { broadcastReturnRequest, sendReturnDecision } from "../ws.js";

const router = Router();

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const createReturnSchema = z.object({
  sale_id: z.number().int().positive(),
  return_reason: z.string().min(1),
  item_condition: z.enum(["good", "damaged", "defective"]),
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

const approveSchema = z.object({
  resolution: z.enum(["refund", "exchange", "store_credit", "rejected"]),
  exchange_barcode: z.string().optional(),
  exchange_quantity: z.number().int().positive().optional(),
  additional_payment: z.number().positive().optional(),
  refund_difference: z.number().positive().optional(),
  rejection_reason: z.string().optional(),
});

// Execution is deliberately payload-free.  The approved resolution and the
// verified item condition are read only at this stage and come from `returns`.
const resolveSchema = z.object({}).strict();

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
       r.exchange_product_id,
       r.exchange_quantity,
       r.additional_payment,
       r.refund_difference,
       exchange_product.barcode AS exchange_barcode,
       r.created_at,
       r.resolved_at
     FROM returns r
     JOIN sales  s  ON s.id  = r.sale_id
      JOIN users  u1 ON u1.id = r.processed_by
      LEFT JOIN users u2 ON u2.id = r.approved_by
      LEFT JOIN products exchange_product ON exchange_product.id = r.exchange_product_id
     WHERE r.id = ?
     LIMIT 1`,
    [id]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return { ...r, refund_amount: r.refund_amount != null ? Number(r.refund_amount) : null };
}

// ─── Helper: fetch return items ───────────────────────────────────────────────
async function fetchReturnItems(conn: PoolConnection, returnId: number): Promise<any[]> {
  const [rows] = await conn.execute<any[]>(
    `SELECT
       ri.id,
       ri.return_id,
       ri.sale_item_id,
       ri.product_id,
       p.product_name   AS product_name,
       ri.quantity_returned,
       ri.unit_price
     FROM return_items ri
     JOIN products p ON p.id = ri.product_id
     WHERE ri.return_id = ?`,
    [returnId]
  );
  return rows.map((r: any) => ({ ...r, unit_price: Number(r.unit_price) }));
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

    const { sale_id, return_reason, item_condition, items } = parsed.data;

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
           (return_number, sale_id, processed_by, return_reason, item_condition, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [return_number, sale_id, req.user!.id, return_reason, item_condition]
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

      await logAuditEvent({
        action: "RETURN_REQUESTED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "returns",
        entityId: return_id,
        newValues: { return_number, sale_id, return_reason },
      });

      // BUG-12 FIX: Use pool (not conn) after commit to avoid using a committed connection
      const [saleRows] = await pool.execute<any[]>(
        `SELECT s.invoice_number, s.customer_name, u.full_name AS cashier_name
         FROM sales s
         JOIN users u ON u.id = s.cashier_id
         WHERE s.id = ? LIMIT 1`,
        [sale_id]
      );
      const saleRow = saleRows[0];
      broadcastReturnRequest({
        type: "return_request",
        id: return_id,
        return_number,
        cashier_name: saleRow?.cashier_name ?? "Cashier",
        customer_name: saleRow?.customer_name ?? "",
        invoice_number: saleRow?.invoice_number ?? "",
        created_at: new Date().toISOString(),
      });

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

// ─── GET /search-approved — Cashier: search approved returns by customer name ─
router.get(
  "/search-approved",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const { customer_name } = req.query as Record<string, string | undefined>;
    if (!customer_name?.trim()) {
      res.status(400).json({ message: "customer_name is required." });
      return;
    }
    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT
           r.id,
           r.return_number,
           s.invoice_number,
           s.customer_name,
           r.return_reason,
           r.status,
           r.resolution,
           r.created_at
         FROM returns r
         JOIN sales s ON s.id = r.sale_id
         WHERE r.status = 'waiting_for_cashier'
           AND s.customer_name LIKE ?
         ORDER BY r.created_at DESC`,
        [`%${customer_name.trim()}%`]
      );
      res.status(200).json(rows);
    } catch (err) {
      console.error("[GET /api/returns/search-approved] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── GET /my-history — Cashier: load their return history (approved/rejected) ─────────────
router.get(
  "/my-history",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const { search } = req.query as Record<string, string | undefined>;
    try {
      let query = `
        SELECT
           r.id,
           r.return_number,
           s.invoice_number,
           s.customer_name,
           r.status,
           r.resolution,
           r.item_condition,
           r.return_reason,
           r.refund_amount,
           r.created_at,
           r.resolved_at,
           u.full_name AS admin_name
         FROM returns r
         JOIN sales s ON s.id = r.sale_id
         LEFT JOIN users u ON u.id = r.approved_by
         WHERE r.processed_by = ?
           AND r.status IN ('completed', 'rejected')
      `;
      const params: any[] = [req.user!.id];

      if (search) {
        query += ` AND (s.invoice_number LIKE ? OR s.customer_name LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
      }

      query += ` ORDER BY r.created_at DESC`;

      const [rows] = await pool.execute<any[]>(query, params);
      res.status(200).json(rows);
    } catch (err) {
      console.error("[GET /api/returns/my-history] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── GET /my-pending — Cashier: load their pending returns ─────────────
router.get(
  "/my-pending",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT
           r.id,
           r.return_number,
           s.invoice_number,
           s.customer_name,
           r.status,
           r.resolution,
           r.created_at
         FROM returns r
         JOIN sales s ON s.id = r.sale_id
         WHERE r.processed_by = ?
           AND r.status IN ('pending', 'waiting_for_cashier', 'approved')
         ORDER BY r.created_at DESC`,
        [req.user!.id]
      );
      res.status(200).json(rows);
    } catch (err) {
      console.error("[GET /api/returns/my-pending] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── Task 5.5 — GET / (Admin only) ───────────────────────────────────────────
router.get(
  "/",
  authenticate,
  requireRole("Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const {
      status,
      resolution,
      date_from,
      date_to,
      return_number,
      invoice_number,
      cashier_id,
    } = req.query as Record<string, string | undefined>;

    try {
      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (status) {
        conditions.push("r.status = ?");
        params.push(status);
      }
      if (resolution && ["refund", "replacement"].includes(resolution)) {
        conditions.push("r.resolution = ?");
        params.push(resolution);
      }
      if (return_number) {
        conditions.push("r.return_number LIKE ?");
        params.push(`%${return_number}%`);
      }
      if (invoice_number) {
        conditions.push("s.invoice_number LIKE ?");
        params.push(`%${invoice_number}%`);
      }
      if (date_from) {
        conditions.push("DATE(r.created_at) >= ?");
        params.push(date_from);
      }
      if (date_to) {
        conditions.push("DATE(r.created_at) <= ?");
        params.push(date_to);
      }
      if (cashier_id && /^\d+$/.test(cashier_id)) {
        conditions.push("r.processed_by = ?");
        params.push(parseInt(cashier_id, 10));
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

// ─── PATCH /:id/approve (Admin only) - Select resolution ──────────────────────
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

    const parsed = approveSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      res.status(400).json({ message: errors[0]?.message ?? "Invalid request", errors });
      return;
    }

    const { resolution, exchange_barcode, exchange_quantity, additional_payment, refund_difference, rejection_reason } = parsed.data;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Fetch current return with row lock
      const [rows] = await conn.execute<any[]>(
        `SELECT id, status, sale_id, item_condition FROM returns WHERE id = ? LIMIT 1 FOR UPDATE`,
        [id]
      );
      const returnRow = rows[0];
      if (!returnRow) {
        await conn.rollback();
        res.status(404).json({ message: "Return not found." });
        return;
      }
      if (returnRow.status !== "pending") {
        await conn.rollback();
        res.status(422).json({ message: "Only pending returns can be approved." });
        return;
      }

      // Convert barcode to product_id for exchange
      let exchange_product_id: number | null = null;
      if (resolution === "exchange") {
        if (!exchange_barcode || !exchange_quantity) {
          await conn.rollback();
          res.status(400).json({ message: "Exchange requires barcode and quantity." });
          return;
        }
        // Look up product_id from barcode
        const [productRows] = await conn.execute<any[]>(
          `SELECT id, quantity FROM products WHERE barcode = ? FOR UPDATE`,
          [exchange_barcode]
        );
        const product = productRows[0];
        if (!product) {
          await conn.rollback();
          res.status(404).json({ message: "Product with this barcode not found." });
          return;
        }
        exchange_product_id = product.id;
        // Check stock availability
        if (Number(product.quantity) < exchange_quantity) {
          await conn.rollback();
          res.status(409).json({ message: "Insufficient stock for exchange product." });
          return;
        }
      }

      // Validate rejection reason
      if (resolution === "rejected" && !rejection_reason) {
        await conn.rollback();
        res.status(400).json({ message: "Rejection requires a reason." });
        return;
      }

      // Update return with resolution
      if (resolution === "rejected") {
        await conn.execute(
          `UPDATE returns SET status = 'rejected', approved_by = ?, resolved_at = NOW(), return_reason = ?, resolution = 'rejected' WHERE id = ?`,
          [req.user!.id, rejection_reason!, id]
        );
      } else {
        await conn.execute(
          `UPDATE returns SET status = 'waiting_for_cashier', approved_by = ?, resolved_at = NOW(), resolution = ?, exchange_product_id = ?, exchange_quantity = ?, additional_payment = ?, refund_difference = ? WHERE id = ?`,
          [req.user!.id, resolution, exchange_product_id ?? null, exchange_quantity ?? null, additional_payment ?? null, refund_difference ?? null, id]
        );
      }

      await conn.commit();

      const updated = await fetchReturnSummary(conn, id);

      await logAuditEvent({
        action: resolution === "rejected" ? "RETURN_REJECTED" : "RETURN_APPROVED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "returns",
        entityId: id,
        newValues: { return_number: updated.return_number, invoice_number: updated.invoice_number, resolution },
      });

      // Notify the cashier who submitted this return
      sendReturnDecision({
        type: "return_decision",
        id: updated.id,
        return_number: updated.return_number,
        invoice_number: updated.invoice_number,
        customer_name: updated.customer_name,
        decision: resolution === "rejected" ? "rejected" : "approved",
        admin_name: updated.admin_name ?? "Admin",
        cashier_user_id: updated.processed_by,
      });

      res.status(200).json(updated);
    } catch (err) {
      await conn.rollback();
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
      await conn.beginTransaction();

      const [rows] = await conn.execute<any[]>(
        `SELECT id, status FROM returns WHERE id = ? LIMIT 1 FOR UPDATE`,
        [id]
      );
      const returnRow = rows[0];
      if (!returnRow) {
        await conn.rollback();
        res.status(404).json({ message: "Return not found." });
        return;
      }
      if (returnRow.status !== "pending") {
        await conn.rollback();
        res.status(422).json({ message: "Only pending returns can be rejected." });
        return;
      }

      await conn.execute(
        `UPDATE returns SET status = 'rejected', approved_by = ?, resolved_at = NOW(), return_reason = ? WHERE id = ?`,
        [req.user!.id, parsed.data.return_reason, id]
      );

      await conn.commit();

      const updated = await fetchReturnSummary(conn, id);

      await logAuditEvent({
        action: "RETURN_REJECTED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "returns",
        entityId: id,
        reason: parsed.data.return_reason,
        newValues: { return_number: updated.return_number, invoice_number: updated.invoice_number },
      });

      // Notify the cashier who submitted this return
      sendReturnDecision({
        type: "return_decision",
        id: updated.id,
        return_number: updated.return_number,
        invoice_number: updated.invoice_number,
        customer_name: updated.customer_name,
        decision: "rejected",
        admin_name: updated.admin_name ?? "Admin",
        cashier_user_id: updated.processed_by,
      });

      res.status(200).json(updated);
    } catch (err) {
      await conn.rollback();
      console.error("[PATCH /api/returns/:id/reject] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);

// ─── PATCH /:id/resolve (Cashier, Admin) - Execute approved resolution ─────────────
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

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Fetch return with row-level lock to prevent concurrent resolution
      const [returnRows] = await conn.execute<any[]>(
        `SELECT r.id, r.return_number, r.status, r.resolution, r.item_condition, r.sale_id,
                r.exchange_product_id, r.exchange_quantity, r.additional_payment, r.refund_difference
         FROM returns r
         WHERE r.id = ? LIMIT 1 FOR UPDATE`,
        [id]
      );
      const returnRow = returnRows[0];
      if (!returnRow) {
        await conn.rollback();
        res.status(404).json({ message: "Return not found." });
        return;
      }
      if (returnRow.status !== "waiting_for_cashier") {
        await conn.rollback();
        res.status(422).json({ message: "Return must be approved before resolution." });
        return;
      }
      if (!returnRow.resolution) {
        await conn.rollback();
        res.status(422).json({ message: "Return must have an approved resolution." });
        return;
      }

      // Fetch return items inside the transaction
      const [itemRows] = await conn.execute<any[]>(
        `SELECT ri.product_id, ri.quantity_returned, ri.unit_price, p.product_name AS product_name
         FROM return_items ri
         JOIN products p ON p.id = ri.product_id
         WHERE ri.return_id = ?`,
        [id]
      );

      // Use the item_condition from the return record (set during initial submission)
      const finalItemCondition = returnRow.item_condition || "good";

      let refund_amount = 0;

      if (returnRow.resolution === "refund") {
        // Refund path
        for (const item of itemRows) {
          refund_amount += Number(item.unit_price) * Number(item.quantity_returned);

          if (finalItemCondition === "good") {
            await conn.execute(
              `UPDATE products SET quantity = quantity + ? WHERE id = ?`,
              [item.quantity_returned, item.product_id]
            );
          } else {
            // damaged or defective
            await conn.execute(
              `UPDATE products SET damaged_stock = damaged_stock + ? WHERE id = ?`,
              [item.quantity_returned, item.product_id]
            );
          }

          await conn.execute(
            `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, reference, user_id)
             VALUES (?, 'Return', 'return_refund', ?, ?, ?)`,
            [item.product_id, item.quantity_returned, returnRow.return_number, req.user!.id]
          );
        }

        await conn.execute(
          `UPDATE returns
           SET refund_amount = ?, resolved_at = NOW(), status = 'completed'
           WHERE id = ?`,
          [refund_amount.toFixed(2), id]
        );
      } else if (returnRow.resolution === "exchange") {
        // Exchange path
        const exchangeProductId = returnRow.exchange_product_id;
        const exchangeQuantity = returnRow.exchange_quantity;

        if (!exchangeProductId || !exchangeQuantity) {
          await conn.rollback();
          res.status(400).json({ message: "Exchange requires product_id and quantity." });
          return;
        }

        // Handle returned items
        for (const item of itemRows) {
          if (finalItemCondition === "good") {
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
            `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, reference, user_id)
             VALUES (?, 'Return', 'return_exchange_in', ?, ?, ?)`,
            [item.product_id, item.quantity_returned, returnRow.return_number, req.user!.id]
          );
        }

        // Deduct exchange product from stock
        await conn.execute(
          `UPDATE products SET quantity = quantity - ? WHERE id = ?`,
          [exchangeQuantity, exchangeProductId]
        );

        await conn.execute(
          `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, reference, user_id)
           VALUES (?, 'Return', 'return_exchange_out', ?, ?, ?)`,
          [exchangeProductId, -exchangeQuantity, returnRow.return_number, req.user!.id]
        );

        await conn.execute(
          `UPDATE returns SET resolved_at = NOW(), status = 'completed' WHERE id = ?`,
          [id]
        );
      } else if (returnRow.resolution === "store_credit") {
        // Store Credit path
        for (const item of itemRows) {
          refund_amount += Number(item.unit_price) * Number(item.quantity_returned);

          if (finalItemCondition === "good") {
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
            `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, reference, user_id)
             VALUES (?, 'Return', 'return_store_credit', ?, ?, ?)`,
            [item.product_id, item.quantity_returned, returnRow.return_number, req.user!.id]
          );
        }

        // Fetch customer info from sale
        const [saleRows] = await conn.execute<any[]>(
          `SELECT customer_name FROM sales WHERE id = ?`,
          [returnRow.sale_id]
        );
        const customerName = saleRows[0]?.customer_name || "Unknown";

        // Create store credit record
        await conn.execute(
          `INSERT INTO customer_store_credit
             (customer_id, customer_name, credit_amount, remaining_balance, return_id)
           VALUES (?, ?, ?, ?, ?)`,
          [null, customerName, refund_amount.toFixed(2), refund_amount.toFixed(2), id]
        );

        await conn.execute(
          `UPDATE returns
           SET refund_amount = ?, resolved_at = NOW(), status = 'completed'
           WHERE id = ?`,
          [refund_amount.toFixed(2), id]
        );
      }

      await conn.commit();

      // Audit logging outside transaction
      const actionName = returnRow.resolution === "refund" ? "REFUND_PROCESSED" :
                        returnRow.resolution === "exchange" ? "EXCHANGE_COMPLETED" :
                        returnRow.resolution === "store_credit" ? "STORE_CREDIT_ISSUED" : "RETURN_RESOLVED";

      await logAuditEvent({
        action: actionName,
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "returns",
        entityId: id,
        newValues: { return_number: returnRow.return_number, resolution: returnRow.resolution, refund_amount: refund_amount.toFixed(2) },
      });

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

// ─── POST /:id/local-override — Manager Override on Cashier Terminal ──────────
// Verifies admin credentials on the spot, then approves the return request
// with the selected resolution — identical logic to PATCH /:id/approve.
const localOverrideReturnSchema = z.object({
  username:        z.string().min(1, "Username is required"),
  password:        z.string().min(1, "Password is required"),
  resolution:      z.enum(["refund", "exchange", "store_credit", "rejected"]),
  exchange_barcode: z.string().optional(),
  exchange_quantity: z.number().int().positive().optional(),
  additional_payment: z.number().positive().optional(),
  refund_difference:  z.number().positive().optional(),
  rejection_reason:   z.string().optional(),
});

router.post(
  "/:id/local-override",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Invalid return ID." });
      return;
    }

    const parsed = localOverrideReturnSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request." });
      return;
    }

    const { username, password, resolution, exchange_barcode, exchange_quantity, additional_payment, refund_difference, rejection_reason } = parsed.data;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // ── 1. Verify manager credentials ────────────────────────────────────
      const [userRows] = await conn.execute<any[]>(
        `SELECT id, username, full_name, password_hash, role, status FROM users WHERE username = ? LIMIT 1`,
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
        res.status(403).json({ message: "Only an Admin can authorize return requests." });
        return;
      }

      // ── 2. Load and lock the return request ───────────────────────────────
      const [rows] = await conn.execute<any[]>(
        `SELECT id, status, sale_id, item_condition FROM returns WHERE id = ? LIMIT 1 FOR UPDATE`,
        [id]
      );
      const returnRow = rows[0];
      if (!returnRow) {
        await conn.rollback();
        res.status(404).json({ message: "Return not found." });
        return;
      }
      if (returnRow.status !== "pending") {
        await conn.rollback();
        res.status(422).json({
          message: returnRow.status === "waiting_for_cashier" || returnRow.status === "approved"
            ? "This return request was already approved."
            : "Only pending returns can be approved.",
        });
        return;
      }

      // ── 3. Validate exchange details if needed ────────────────────────────
      let exchange_product_id: number | null = null;
      if (resolution === "exchange") {
        if (!exchange_barcode || !exchange_quantity) {
          await conn.rollback();
          res.status(400).json({ message: "Exchange requires barcode and quantity." });
          return;
        }
        const [productRows] = await conn.execute<any[]>(
          `SELECT id, quantity FROM products WHERE barcode = ? FOR UPDATE`,
          [exchange_barcode]
        );
        const product = productRows[0];
        if (!product) {
          await conn.rollback();
          res.status(404).json({ message: "Product with this barcode not found." });
          return;
        }
        exchange_product_id = product.id;
        if (Number(product.quantity) < exchange_quantity) {
          await conn.rollback();
          res.status(409).json({ message: "Insufficient stock for exchange product." });
          return;
        }
      }

      if (resolution === "rejected" && !rejection_reason) {
        await conn.rollback();
        res.status(400).json({ message: "Rejection requires a reason." });
        return;
      }

      // ── 4. Apply the resolution — identical to PATCH /:id/approve ─────────
      if (resolution === "rejected") {
        await conn.execute(
          `UPDATE returns SET status = 'rejected', approved_by = ?, resolved_at = NOW(), return_reason = ?, resolution = 'rejected' WHERE id = ?`,
          [manager.id, rejection_reason!, id]
        );
      } else {
        await conn.execute(
          `UPDATE returns SET status = 'waiting_for_cashier', approved_by = ?, resolved_at = NOW(), resolution = ?, exchange_product_id = ?, exchange_quantity = ?, additional_payment = ?, refund_difference = ? WHERE id = ?`,
          [manager.id, resolution, exchange_product_id ?? null, exchange_quantity ?? null, additional_payment ?? null, refund_difference ?? null, id]
        );
      }

      await conn.commit();

      const updated = await fetchReturnSummary(conn, id);

      // ── 5. Audit log ───────────────────────────────────────────────────────
      await logAuditEvent({
        action: resolution === "rejected" ? "RETURN_REJECTED_LOCAL_OVERRIDE" : "RETURN_APPROVED_LOCAL_OVERRIDE",
        performedById: manager.id,
        performedByUsername: manager.username,
        entityType: "returns",
        entityId: id,
        newValues: {
          return_number: updated.return_number,
          invoice_number: updated.invoice_number,
          resolution,
          override_method: "local_manager_override",
          cashier_id: req.user!.id,
          cashier_username: req.user!.username,
        },
      });

      // ── 6. Notify cashier / admin terminals via WebSocket ─────────────────
      sendReturnDecision({
        type: "return_decision",
        id: updated.id,
        return_number: updated.return_number,
        invoice_number: updated.invoice_number,
        customer_name: updated.customer_name,
        decision: resolution === "rejected" ? "rejected" : "approved",
        admin_name: updated.admin_name ?? manager.full_name ?? manager.username,
        cashier_user_id: updated.processed_by,
      });

      res.status(200).json({
        ...updated,
        admin_name: manager.full_name ?? manager.username,
        admin_id: manager.id,
      });
    } catch (err) {
      await conn.rollback();
      console.error("[POST /api/returns/:id/local-override] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);

export default router;
