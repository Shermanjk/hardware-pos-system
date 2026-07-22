import { Router, Request, Response } from "express";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { generateInvoiceNumber } from "../utils/invoiceNumber.js";
import { logAuditEvent } from "../utils/auditLogger.js";
import { z } from "zod";

const router = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────
const createSaleSchema = z.object({
  customer_name:    z.string().min(1),
  customer_address: z.string().optional(),
  customer_tin:     z.string().optional(),
  // Frontend totals accepted for schema validation but NOT used as stored values —
  // the backend recalculates all totals from DB product data.
  subtotal:         z.number().min(0),
  vat_amount:       z.number().min(0),
  total_amount:     z.number().min(0),
  cash_tendered:    z.number().positive(),
  change_amount:    z.number().min(0),
  items: z.array(z.object({
    product_id: z.number().int().positive(),
    quantity:   z.number().int().positive(),
    // unit_price / subtotal / tax_* from frontend are display hints only;
    // backend derives authoritative values from the products table.
    unit_price:     z.number().positive(),
    subtotal:       z.number().positive(),
    tax_type:       z.enum(["VATABLE", "VAT_EXEMPT", "ZERO_RATED", "NON_TAXABLE"]).optional(),
    tax_rate:       z.number().min(0).max(100).optional(),
    taxable_amount: z.number().min(0).optional(),
    vat_amount:     z.number().min(0).optional(),
  })).min(1),
});

const voidRequestSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
});

const voidDecisionSchema = z.object({
  rejection_reason: z.string().optional(),
});

// ─── POST / — Save a completed sale ──────────────────────────────────────────
router.post(
  "/",
  authenticate,
  requireRole("Cashier"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = createSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => ({
        field:   i.path.join("."),
        message: i.message,
      }));
      res.status(400).json({ message: errors[0]?.message ?? "Invalid request", errors });
      return;
    }

    const {
      customer_name, customer_address, customer_tin,
      subtotal, vat_amount, total_amount,
      cash_tendered, change_amount, items,
    } = parsed.data;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // ── 1. Fetch DB product data + check stock (row-level lock) ───────────────
      const productData: Record<number, {
        name: string; tax_type: string; selling_price: number;
      }> = {};
      for (const item of items) {
        const [rows] = await conn.execute<any[]>(
          `SELECT quantity, product_name AS name, tax_type, selling_price
           FROM products WHERE id = ? FOR UPDATE`,
          [item.product_id]
        );
        const product = rows[0];
        if (!product || product.quantity < item.quantity) {
          await conn.rollback();
          const name = product?.name ?? `ID ${item.product_id}`;
          res.status(409).json({ message: `Insufficient stock for product: ${name}.` });
          return;
        }
        productData[item.product_id] = {
          name:          product.name,
          tax_type:      product.tax_type ?? "VATABLE",
          selling_price: Number(product.selling_price),
        };
      }

      // ── 2. Calculate per-item tax values from DB data (frontend values ignored) ─
      type CalcItem = {
        product_id: number; quantity: number;
        unit_price: number; line_subtotal: number;
        tax_type: string; tax_rate: number;
        taxable_amount: number; vat_amount: number;
      };
      const calcItems: CalcItem[] = items.map((item) => {
        const p           = productData[item.product_id];
        const unit_price  = p.selling_price;
        const line_subtotal = Math.round(unit_price * item.quantity * 100) / 100;
        const taxType     = p.tax_type;
        const isVatable   = taxType === "VATABLE";
        const taxRate     = isVatable ? 12 : 0;
        const taxableAmt  = isVatable
          ? Math.round((line_subtotal / 1.12) * 100) / 100
          : line_subtotal;
        const vatAmt      = isVatable
          ? Math.round((line_subtotal - taxableAmt) * 100) / 100
          : 0;
        return {
          product_id: item.product_id, quantity: item.quantity,
          unit_price, line_subtotal,
          tax_type: taxType, tax_rate: taxRate,
          taxable_amount: taxableAmt, vat_amount: vatAmt,
        };
      });

      // ── 3. Derive sale header totals from calculated items ────────────────────
      const calc_total_amount = Math.round(
        calcItems.reduce((s, i) => s + i.line_subtotal, 0) * 100
      ) / 100;
      const calc_vat_amount = Math.round(
        calcItems.reduce((s, i) => s + i.vat_amount, 0) * 100
      ) / 100;
      const calc_subtotal = Math.round((calc_total_amount - calc_vat_amount) * 100) / 100;
      const calc_change   = Math.round((cash_tendered - calc_total_amount) * 100) / 100;

      // ── 4. Generate invoice number (concurrency-safe) ─────────────────────────
      const invoice_number = await generateInvoiceNumber(conn);

      // ── 5. Insert the sale row using backend-calculated totals ────────────────
      const [saleResult] = await conn.execute<any>(
        `INSERT INTO sales
           (invoice_number, customer_name, customer_address, customer_tin,
            cashier_id, subtotal, vat_amount, total_amount, cash_tendered, change_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoice_number,
          customer_name,
          customer_address ?? null,
          customer_tin ?? null,
          req.user!.id,
          calc_subtotal,
          calc_vat_amount,
          calc_total_amount,
          cash_tendered,
          calc_change >= 0 ? calc_change : 0,
        ]
      );
      const sale_id: number = saleResult.insertId;

      // ── 6. Insert sale items using backend-calculated values ──────────────────
      for (const ci of calcItems) {
        await conn.execute(
          `INSERT INTO sale_items
             (sale_id, product_id, quantity, unit_price, subtotal,
              tax_type, tax_rate, taxable_amount, vat_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [sale_id, ci.product_id, ci.quantity, ci.unit_price, ci.line_subtotal,
           ci.tax_type, ci.tax_rate, ci.taxable_amount, ci.vat_amount]
        );

        // Decrement stock
        await conn.execute(
          `UPDATE products SET quantity = quantity - ? WHERE id = ?`,
          [ci.quantity, ci.product_id]
        );

        // Inventory log
        await conn.execute(
          `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, reference, user_id)
           VALUES (?, 'Sale', 'sale', ?, ?, ?)`,
          [ci.product_id, -ci.quantity, invoice_number, req.user!.id]
        );
      }

      await conn.commit();

      // ── 7. Audit log (non-fatal, outside transaction) ─────────────────────────
      await logAuditEvent({
        action: "SALE_COMPLETED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "sales",
        entityId: sale_id,
        newValues: { invoice_number, total_amount: calc_total_amount, customer_name },
      });

      res.status(201).json({
        invoice_number,
        id: sale_id,
        subtotal:      calc_subtotal,
        vat_amount:    calc_vat_amount,
        total_amount:  calc_total_amount,
        change_amount: calc_change >= 0 ? calc_change : 0,
        // Per-item tax snapshot — used by the receipt for authoritative VAT breakdown
        items: calcItems.map((ci) => ({
          product_id:     ci.product_id,
          tax_type:       ci.tax_type,
          taxable_amount: ci.taxable_amount,
          vat_amount:     ci.vat_amount,
          line_subtotal:  ci.line_subtotal,
        })),
      });
    } catch (err) {
      await conn.rollback();
      console.error("[POST /api/sales] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);

// ─── POST /:id/void-request — Cashier requests void ──────────────────────────
router.post(
  "/:id/void-request",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const saleId = Number(req.params.id);
    if (!Number.isInteger(saleId) || saleId <= 0) {
      res.status(400).json({ message: "Invalid sale ID." });
      return;
    }

    const parsed = voidRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.execute<any[]>(
        `SELECT id, invoice_number, void_status FROM sales WHERE id = ? FOR UPDATE`,
        [saleId]
      );
      const sale = rows[0];
      if (!sale) {
        await conn.rollback();
        res.status(404).json({ message: "Sale not found." });
        return;
      }
      if (sale.void_status !== "active") {
        await conn.rollback();
        res.status(422).json({ message: "This sale already has a void request or has been voided." });
        return;
      }

      await conn.execute(
        `UPDATE sales SET void_status = 'void_requested' WHERE id = ?`,
        [saleId]
      );

      const [voidResult] = await conn.execute<any>(
        `INSERT INTO sale_voids (sale_id, requested_by, reason, status) VALUES (?, ?, ?, 'pending')`,
        [saleId, req.user!.id, parsed.data.reason]
      );

      await conn.commit();

      await logAuditEvent({
        action: "SALE_VOID_REQUESTED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "sales",
        entityId: saleId,
        reason: parsed.data.reason,
        newValues: { invoice_number: sale.invoice_number, void_request_id: voidResult.insertId },
      });

      res.status(201).json({ message: "Void request submitted.", void_id: voidResult.insertId });
    } catch (err) {
      await conn.rollback();
      console.error("[POST /api/sales/:id/void-request] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);

// ─── PATCH /:id/void-approve — Admin approves void ───────────────────────────
router.patch(
  "/:id/void-approve",
  authenticate,
  requireRole("Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const voidId = Number(req.params.id);
    if (!Number.isInteger(voidId) || voidId <= 0) {
      res.status(400).json({ message: "Invalid void request ID." });
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.execute<any[]>(
        `SELECT sv.id, sv.sale_id, sv.status, s.invoice_number
         FROM sale_voids sv JOIN sales s ON s.id = sv.sale_id
         WHERE sv.id = ? FOR UPDATE`,
        [voidId]
      );
      const voidRow = rows[0];
      if (!voidRow) {
        await conn.rollback();
        res.status(404).json({ message: "Void request not found." });
        return;
      }
      if (voidRow.status !== "pending") {
        await conn.rollback();
        res.status(422).json({ message: "Only pending void requests can be approved." });
        return;
      }

      await conn.execute(
        `UPDATE sale_voids SET status = 'approved', approved_by = ?, resolved_at = NOW() WHERE id = ?`,
        [req.user!.id, voidId]
      );
      await conn.execute(
        `UPDATE sales SET void_status = 'voided' WHERE id = ?`,
        [voidRow.sale_id]
      );

      await conn.commit();

      await logAuditEvent({
        action: "SALE_VOIDED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "sales",
        entityId: voidRow.sale_id,
        newValues: { invoice_number: voidRow.invoice_number, void_request_id: voidId },
      });

      res.status(200).json({ message: "Sale voided successfully." });
    } catch (err) {
      await conn.rollback();
      console.error("[PATCH /api/sales/:id/void-approve] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);

// ─── PATCH /:id/void-reject — Admin rejects void ─────────────────────────────
router.patch(
  "/:id/void-reject",
  authenticate,
  requireRole("Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const voidId = Number(req.params.id);
    if (!Number.isInteger(voidId) || voidId <= 0) {
      res.status(400).json({ message: "Invalid void request ID." });
      return;
    }

    const parsed = voidDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid request." });
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.execute<any[]>(
        `SELECT sv.id, sv.sale_id, sv.status, s.invoice_number
         FROM sale_voids sv JOIN sales s ON s.id = sv.sale_id
         WHERE sv.id = ? FOR UPDATE`,
        [voidId]
      );
      const voidRow = rows[0];
      if (!voidRow) {
        await conn.rollback();
        res.status(404).json({ message: "Void request not found." });
        return;
      }
      if (voidRow.status !== "pending") {
        await conn.rollback();
        res.status(422).json({ message: "Only pending void requests can be rejected." });
        return;
      }

      await conn.execute(
        `UPDATE sale_voids SET status = 'rejected', approved_by = ?, resolved_at = NOW(), rejection_reason = ? WHERE id = ?`,
        [req.user!.id, parsed.data.rejection_reason ?? null, voidId]
      );
      await conn.execute(
        `UPDATE sales SET void_status = 'active' WHERE id = ?`,
        [voidRow.sale_id]
      );

      await conn.commit();

      await logAuditEvent({
        action: "SALE_CANCELLATION_REJECTED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "sales",
        entityId: voidRow.sale_id,
        reason: parsed.data.rejection_reason,
        newValues: { invoice_number: voidRow.invoice_number, void_request_id: voidId },
      });

      res.status(200).json({ message: "Void request rejected." });
    } catch (err) {
      await conn.rollback();
      console.error("[PATCH /api/sales/:id/void-reject] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);

// ─── GET /void-requests — Admin: list pending void requests ──────────────────
router.get(
  "/void-requests",
  authenticate,
  requireRole("Admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT sv.id, sv.sale_id, s.invoice_number, s.customer_name,
                s.total_amount, sv.reason, sv.status,
                u1.full_name AS requested_by_name,
                u2.full_name AS approved_by_name,
                sv.created_at, sv.resolved_at
         FROM sale_voids sv
         JOIN sales s  ON s.id  = sv.sale_id
         JOIN users u1 ON u1.id = sv.requested_by
         LEFT JOIN users u2 ON u2.id = sv.approved_by
         ORDER BY sv.created_at DESC`
      );
      res.status(200).json(rows);
    } catch (err) {
      console.error("[GET /api/sales/void-requests] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    }
  }
);

// ─── GET /:invoiceNumber — Look up one sale with items ────────────────────────
router.get(
  "/:invoiceNumber",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const { invoiceNumber } = req.params;

    try {
      const [saleRows] = await pool.execute<any[]>(
        `SELECT s.id, s.invoice_number, s.customer_name, s.customer_address,
                s.customer_tin, s.cashier_id, u.full_name AS cashier_name,
                s.subtotal, s.vat_amount, s.total_amount, s.cash_tendered,
                s.change_amount, s.void_status, s.created_at
         FROM sales s
         JOIN users u ON u.id = s.cashier_id
         WHERE s.invoice_number = ?
         LIMIT 1`,
        [invoiceNumber]
      );

      const sale = saleRows[0];
      if (!sale) {
        res.status(404).json({ message: "Invoice not found." });
        return;
      }

      const [itemRows] = await pool.execute<any[]>(
        `SELECT
           si.id, si.sale_id, si.product_id,
           p.product_name, p.barcode, p.is_returnable,
           si.quantity, si.unit_price, si.subtotal,
           si.tax_type, si.tax_rate, si.taxable_amount, si.vat_amount AS item_vat_amount,
           (
             SELECT COALESCE(SUM(ri.quantity_returned), 0)
             FROM return_items ri
             JOIN returns r ON ri.return_id = r.id
             WHERE ri.sale_item_id = si.id
               AND r.status IN ('pending', 'approved')
           ) AS quantity_returned
         FROM sale_items si
         JOIN products p ON p.id = si.product_id
         WHERE si.sale_id = ?`,
        [sale.id]
      );

      res.status(200).json({
        ...sale,
        subtotal:      Number(sale.subtotal),
        vat_amount:    Number(sale.vat_amount),
        total_amount:  Number(sale.total_amount),
        cash_tendered: Number(sale.cash_tendered),
        change_amount: Number(sale.change_amount),
        items: itemRows.map((r: any) => ({
          ...r,
          unit_price:      Number(r.unit_price),
          subtotal:        Number(r.subtotal),
          tax_rate:        Number(r.tax_rate),
          taxable_amount:  Number(r.taxable_amount),
          item_vat_amount: Number(r.item_vat_amount),
          quantity_returned: Number(r.quantity_returned),
        })),
      });
    } catch (err) {
      console.error("[GET /api/sales/:invoiceNumber] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    }
  }
);

// ─── GET / — List / search sales ─────────────────────────────────────────────
router.get(
  "/",
  authenticate,
  requireRole("Admin", "Cashier"),
  async (req: Request, res: Response): Promise<void> => {
    const { invoice_number, customer_name, date_from, date_to } = req.query as Record<string, string | undefined>;

    try {
      const conditions: string[] = [];
      const params: string[] = [];

      if (invoice_number) {
        conditions.push("s.invoice_number LIKE ?");
        params.push(`%${invoice_number}%`);
      }
      if (customer_name) {
        conditions.push("s.customer_name LIKE ?");
        params.push(`%${customer_name}%`);
      }
      if (date_from) {
        conditions.push("DATE(s.created_at) >= ?");
        params.push(date_from);
      }
      if (date_to) {
        conditions.push("DATE(s.created_at) <= ?");
        params.push(date_to);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await pool.execute<any[]>(
        `SELECT s.id, s.invoice_number, s.customer_name, s.customer_address,
                s.customer_tin, s.cashier_id, u.full_name AS cashier_name,
                s.subtotal, s.vat_amount, s.total_amount, s.cash_tendered,
                s.change_amount, s.void_status, s.created_at
         FROM sales s
         JOIN users u ON u.id = s.cashier_id
         ${where}
         ORDER BY s.created_at DESC`,
        params
      );

      res.status(200).json(rows);
    } catch (err) {
      console.error("[GET /api/sales] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    }
  }
);

export default router;
