import { Router, Request, Response } from "express";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { generateInvoiceNumber } from "../utils/invoiceNumber.js";
import { logAuditEvent } from "../utils/auditLogger.js";
import { sendVoidDecision, broadcastVoidRequest } from "../ws.js";
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
  // client_transaction_id provides idempotency — if the same key is sent twice,
  // the second request returns the existing sale instead of creating a duplicate.
  // This prevents duplicate sales after network retry, browser refresh, or power outage.
  client_transaction_id: z.string().min(1).optional(),
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
// CRITICAL ORDER OF OPERATIONS (power-outage safe):
//   1. Validate input
//   2. Check idempotency (client_transaction_id) — return existing sale if duplicate
//   3. Begin DB transaction
//   4. Lock product rows (SELECT ... FOR UPDATE)
//   5. Check stock availability
//   6. Calculate all values from DB (never trust frontend)
//   7. Generate invoice number (concurrency-safe, row-locked)
//   8. Insert sale row (payment_status = 'pending')
//   9. Insert sale_items
//  10. Deduct inventory
//  11. Log inventory changes
//  12. COMMIT transaction (all-or-nothing)
//  13. Update payment_status to 'completed' (separate transaction)
//  14. Return success to client
//  15. Client prints receipt
//  16. Client calls PATCH /:id/mark-receipt-printed to mark receipt_printed = 1
//
// The receipt printer is NOT the source of truth. The database is.
// If power fails after COMMIT but before receipt prints, the sale is still valid.
// The cashier can reprint the receipt after restart.
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
      cash_tendered, items,
    } = parsed.data;

    // ── IDEMPOTENCY CHECK ─────────────────────────────────────────────────────
    // If client_transaction_id is provided, check if a sale with this key already exists.
    // This prevents duplicate sales from retried requests after network failure,
    // browser refresh, or power outage recovery.
    const clientTxnId = parsed.data.client_transaction_id;
    if (clientTxnId) {
      try {
        const [existing] = await pool.execute<any[]>(
          `SELECT id, invoice_number, subtotal, vat_amount, total_amount, change_amount,
                  payment_status, receipt_printed
           FROM sales WHERE client_transaction_id = ? LIMIT 1`,
          [clientTxnId]
        );
        if (existing.length > 0) {
          const sale = existing[0];
          // Return the existing sale — this is a safe retry, not a duplicate
          console.log(`[IDEMPOTENCY] Duplicate client_transaction_id: ${clientTxnId}, returning existing sale ${sale.invoice_number}`);
          
          // Fetch the items for this sale
          const [itemRows] = await pool.execute<any[]>(
            `SELECT product_id, tax_type, taxable_amount, vat_amount, subtotal AS line_subtotal
             FROM sale_items WHERE sale_id = ?`,
            [sale.id]
          );

          res.status(200).json({
            id: sale.id,
            invoice_number: sale.invoice_number,
            subtotal: Number(sale.subtotal),
            vat_amount: Number(sale.vat_amount),
            total_amount: Number(sale.total_amount),
            change_amount: Number(sale.change_amount),
            payment_status: sale.payment_status,
            receipt_printed: sale.receipt_printed === 1 || sale.receipt_printed === true,
            items: itemRows.map((r: any) => ({
              product_id: r.product_id,
              tax_type: r.tax_type,
              taxable_amount: Number(r.taxable_amount),
              vat_amount: Number(r.vat_amount),
              line_subtotal: Number(r.line_subtotal),
            })),
            // Flag to indicate this is a duplicate/idempotent response
            _idempotent: true,
          });
          return;
        }
      } catch (err) {
        // If the column doesn't exist yet (pre-migration), just continue
        console.warn("[IDEMPOTENCY] Check failed (column may not exist yet):", err);
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // ── 0. Read tax_rate from store_settings ───────────────────────────────────
      const [settingsRows] = await conn.execute<any[]>(
        `SELECT tax_rate, vat_registered FROM store_settings WHERE id = 1 LIMIT 1`
      );
      const dbTaxRate   = Number(settingsRows[0]?.tax_rate ?? 12);
      const dbVatActive = settingsRows[0]?.vat_registered === true || settingsRows[0]?.vat_registered === 1;

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
        const isVatable   = taxType === "VATABLE" && dbVatActive;
        const taxRate     = isVatable ? dbTaxRate : 0;
        const taxDivisor  = 1 + (taxRate / 100);
        const taxableAmt  = isVatable
          ? Math.round((line_subtotal / taxDivisor) * 100) / 100
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
      // payment_status starts as 'pending' — it will be updated to 'completed'
      // after the transaction commits successfully.
      const [saleResult] = await conn.execute<any>(
        `INSERT INTO sales
           (invoice_number, customer_name, customer_address, customer_tin,
            cashier_id, subtotal, vat_amount, total_amount, cash_tendered, change_amount,
            payment_status, client_transaction_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
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
          clientTxnId ?? null,
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

      // ── 7. COMMIT — all-or-nothing ───────────────────────────────────────────
      // If power fails here, the entire transaction is rolled back.
      // No sale, no inventory deduction, no invoice number consumed.
      await conn.commit();

      // ── 8. Update payment_status to 'completed' (post-commit) ─────────────────
      // This is done in a separate, simple UPDATE so that if the sale row exists
      // with payment_status='pending', we know the transaction committed but
      // something failed after (e.g., response not sent, receipt not printed).
      try {
        await pool.execute(
          `UPDATE sales SET payment_status = 'completed' WHERE id = ? AND payment_status = 'pending'`,
          [sale_id]
        );
      } catch (updateErr) {
        // Non-fatal: the sale is still valid, just the status flag failed.
        // The recovery endpoint can fix this later.
        console.warn(`[SALES] Failed to update payment_status for sale ${sale_id}:`, updateErr);
      }

      // ── 9. Audit log (non-fatal, outside transaction) ─────────────────────────
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
        payment_status: "completed",
        receipt_printed: false,
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

// ─── PATCH /:id/mark-receipt-printed — Mark receipt as printed ───────────────
// Called by the client AFTER the receipt has been successfully printed.
// This is a separate call so that a printer failure does not affect the sale.
router.patch(
  "/:id/mark-receipt-printed",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const saleId = Number(req.params.id);
    if (!Number.isInteger(saleId) || saleId <= 0) {
      res.status(400).json({ message: "Invalid sale ID." });
      return;
    }

    try {
      const [result] = await pool.execute<any>(
        `UPDATE sales SET receipt_printed = 1 WHERE id = ? AND receipt_printed = 0`,
        [saleId]
      );

      if (result.affectedRows === 0) {
        // Either the sale doesn't exist or it was already marked as printed
        const [check] = await pool.execute<any[]>(
          `SELECT id, receipt_printed FROM sales WHERE id = ? LIMIT 1`,
          [saleId]
        );
        if (check.length === 0) {
          res.status(404).json({ message: "Sale not found." });
          return;
        }
        // Already printed — this is fine, idempotent
        res.status(200).json({ message: "Receipt already marked as printed.", receipt_printed: true });
        return;
      }

      res.status(200).json({ message: "Receipt marked as printed.", receipt_printed: true });
    } catch (err) {
      console.error("[PATCH /api/sales/:id/mark-receipt-printed] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── GET /recovery/pending — Find sales with pending payment_status ──────────
// Used after system restart to find sales that may need recovery.
router.get(
  "/recovery/pending",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      // Find sales where payment_status is still 'pending' (transaction committed
      // but the post-commit update failed)
      const [pendingSales] = await pool.execute<any[]>(
        `SELECT s.id, s.invoice_number, s.customer_name, s.total_amount,
                s.cash_tendered, s.change_amount, s.payment_status, s.receipt_printed,
                s.created_at, u.full_name AS cashier_name
         FROM sales s
         JOIN users u ON u.id = s.cashier_id
         WHERE s.payment_status = 'pending'
         ORDER BY s.created_at DESC
         LIMIT 50`
      );

      // Also find sales where payment is completed but receipt not printed
      const [unprintedSales] = await pool.execute<any[]>(
        `SELECT s.id, s.invoice_number, s.customer_name, s.total_amount,
                s.cash_tendered, s.change_amount, s.payment_status, s.receipt_printed,
                s.created_at, u.full_name AS cashier_name
         FROM sales s
         JOIN users u ON u.id = s.cashier_id
         WHERE s.payment_status = 'completed' AND s.receipt_printed = 0
         ORDER BY s.created_at DESC
         LIMIT 50`
      );

      res.status(200).json({
        pending_payment: pendingSales.map((r: any) => ({
          ...r,
          total_amount: Number(r.total_amount),
          cash_tendered: Number(r.cash_tendered),
          change_amount: Number(r.change_amount),
        })),
        completed_unprinted: unprintedSales.map((r: any) => ({
          ...r,
          total_amount: Number(r.total_amount),
          cash_tendered: Number(r.cash_tendered),
          change_amount: Number(r.change_amount),
        })),
      });
    } catch (err) {
      console.error("[GET /api/sales/recovery/pending] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── PATCH /recovery/:id/fix-payment-status — Fix a stuck sale ───────────────
// After verifying that a sale with payment_status='pending' actually committed
// (has sale_items, inventory was deducted), an admin can fix the status.
router.patch(
  "/recovery/:id/fix-payment-status",
  authenticate,
  requireRole("Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const saleId = Number(req.params.id);
    if (!Number.isInteger(saleId) || saleId <= 0) {
      res.status(400).json({ message: "Invalid sale ID." });
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Lock the sale row
      const [saleRows] = await conn.execute<any[]>(
        `SELECT id, invoice_number, payment_status, total_amount
         FROM sales WHERE id = ? FOR UPDATE`,
        [saleId]
      );
      if (saleRows.length === 0) {
        await conn.rollback();
        res.status(404).json({ message: "Sale not found." });
        return;
      }

      const sale = saleRows[0];
      if (sale.payment_status !== "pending") {
        await conn.rollback();
        res.status(422).json({ message: `Sale ${sale.invoice_number} already has payment_status: ${sale.payment_status}` });
        return;
      }

      // Verify that sale_items exist (sale was fully committed)
      const [itemCheck] = await conn.execute<any[]>(
        `SELECT COUNT(*) AS cnt FROM sale_items WHERE sale_id = ?`,
        [saleId]
      );
      if (itemCheck[0].cnt === 0) {
        await conn.rollback();
        res.status(422).json({ message: "Sale has no items. This sale was not fully committed. Consider deleting it." });
        return;
      }

      // Fix the payment status
      await conn.execute(
        `UPDATE sales SET payment_status = 'completed' WHERE id = ?`,
        [saleId]
      );

      await conn.commit();

      await logAuditEvent({
        action: "SALE_PAYMENT_STATUS_FIXED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "sales",
        entityId: saleId,
        newValues: { invoice_number: sale.invoice_number, payment_status: "completed" },
      });

      res.status(200).json({
        message: `Sale ${sale.invoice_number} payment status fixed to 'completed'.`,
        invoice_number: sale.invoice_number,
      });
    } catch (err) {
      await conn.rollback();
      console.error("[PATCH /api/sales/recovery/:id/fix-payment-status] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
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
        `SELECT id, invoice_number, void_status, customer_name, total_amount FROM sales WHERE id = ? FOR UPDATE`,
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

      // Notify all admins in real-time
      broadcastVoidRequest({
        type: "void_request",
        void_id: voidResult.insertId,
        sale_id: saleId,
        invoice_number: sale.invoice_number,
        cashier_name: req.user!.full_name ?? req.user!.username,
        cashier_user_id: req.user!.id,
        customer_name: sale.customer_name,
        total_amount: Number(sale.total_amount),
        reason: parsed.data.reason,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      await conn.rollback();
      console.error("[POST /api/sales/:id/void-request] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);

// ─── GET /my-void-requests — Cashier: load their pending void requests ───────────
router.get(
  "/my-void-requests",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT
           sv.id,
           sv.sale_id,
           s.invoice_number,
           s.customer_name,
           s.total_amount,
           sv.status,
           sv.reason,
           sv.created_at
         FROM sale_voids sv
         JOIN sales s ON s.id = sv.sale_id
         WHERE sv.requested_by = ?
           AND sv.status = 'pending'
         ORDER BY sv.created_at DESC`,
        [req.user!.id]
      );
      res.status(200).json(rows);
    } catch (err) {
      console.error("[GET /api/sales/my-void-requests] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
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
        `SELECT sv.id, sv.sale_id, sv.status, sv.reason, s.invoice_number
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

      // ── Restore inventory for each sold item (exactly once) ───────────────
      const [saleItems] = await conn.execute<any[]>(
        `SELECT product_id, quantity FROM sale_items WHERE sale_id = ?`,
        [voidRow.sale_id]
      );
      for (const item of saleItems) {
        await conn.execute(
          `UPDATE products SET quantity = quantity + ? WHERE id = ?`,
          [item.quantity, item.product_id]
        );
        await conn.execute(
          `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, reference, user_id)
           VALUES (?, 'Void', 'void_restore', ?, ?, ?)`,
          [item.product_id, item.quantity, voidRow.invoice_number, req.user!.id]
        );
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
        reason: voidRow.reason,
        newValues: { invoice_number: voidRow.invoice_number, void_request_id: voidId },
      });

      // Notify the cashier who submitted the request
      const [cashierRow] = await pool.execute<any[]>(
        `SELECT s.cashier_id, s.total_amount FROM sales s WHERE s.id = ?`,
        [voidRow.sale_id]
      );
      if ((cashierRow as any[])[0]) {
        const { cashier_id, total_amount } = (cashierRow as any[])[0];
        sendVoidDecision({
          type: "void_decision",
          void_id: voidId,
          sale_id: voidRow.sale_id,
          invoice_number: voidRow.invoice_number,
          total_amount: Number(total_amount),
          decision: "approved",
          admin_name: req.user!.full_name ?? req.user!.username,
          rejection_reason: null,
          cashier_user_id: cashier_id,
        });
      }

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

      // Notify the cashier who submitted the request
      const [cashierRowR] = await pool.execute<any[]>(
        `SELECT s.cashier_id, s.total_amount FROM sales s WHERE s.id = ?`,
        [voidRow.sale_id]
      );
      if ((cashierRowR as any[])[0]) {
        const { cashier_id, total_amount } = (cashierRowR as any[])[0];
        sendVoidDecision({
          type: "void_decision",
          void_id: voidId,
          sale_id: voidRow.sale_id,
          invoice_number: voidRow.invoice_number,
          total_amount: Number(total_amount),
          decision: "rejected",
          admin_name: req.user!.full_name ?? req.user!.username,
          rejection_reason: parsed.data.rejection_reason ?? null,
          cashier_user_id: cashier_id,
        });
      }

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

// ─── GET / — List / search sales ─────────────────────────────────────────────
router.get(
  "/",
  authenticate,
  requireRole("Admin", "Cashier"),
  async (req: Request, res: Response): Promise<void> => {
    const {
      invoice_number,
      customer_name,
      date_from,
      date_to,
      cashier_id,
      void_status,
      payment_status,
    } = req.query as Record<string, string | undefined>;

    try {
      const conditions: string[] = [];
      const params: (string | number)[] = [];

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
      if (cashier_id && /^\d+$/.test(cashier_id)) {
        conditions.push("s.cashier_id = ?");
        params.push(parseInt(cashier_id, 10));
      }
      if (void_status && ["active", "void_requested", "voided"].includes(void_status)) {
        conditions.push("s.void_status = ?");
        params.push(void_status);
      }
      if (payment_status && ["pending", "completed"].includes(payment_status)) {
        conditions.push("s.payment_status = ?");
        params.push(payment_status);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const returnableFilter = `
        AND s.id IN (
          SELECT DISTINCT si.sale_id
          FROM sale_items si
          JOIN products p ON p.id = si.product_id
          WHERE p.is_returnable = 1
            AND si.quantity > COALESCE((
              SELECT COALESCE(SUM(ri.quantity_returned), 0)
              FROM return_items ri
              JOIN returns r ON ri.return_id = r.id
              WHERE ri.sale_item_id = si.id
                AND r.status IN ('pending', 'waiting_for_cashier', 'completed')
            ), 0)
        )
      `;
      const finalWhere = where ? `${where} ${returnableFilter}` : `WHERE 1=1 ${returnableFilter}`;

      const [rows] = await pool.execute<any[]>(
        `SELECT s.id, s.invoice_number, s.customer_name, s.customer_address,
                s.customer_tin, s.cashier_id, u.full_name AS cashier_name,
                s.subtotal, s.vat_amount, s.total_amount, s.cash_tendered,
                s.change_amount, s.void_status, s.payment_status, s.receipt_printed, s.created_at
         FROM sales s
         JOIN users u ON u.id = s.cashier_id
         ${finalWhere}
         ORDER BY s.created_at DESC
         LIMIT 200`,
        params
      );

      res.status(200).json(rows);
    } catch (err) {
      console.error("[GET /api/sales] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    }
  }
);

// ─── GET /my-void-requests — Cashier: list their own void requests ───────────
router.get(
  "/my-void-requests",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT sv.id, sv.sale_id, s.invoice_number, s.customer_name,
                s.total_amount, sv.reason, sv.status, sv.rejection_reason,
                u2.full_name AS approved_by_name,
                sv.created_at, sv.resolved_at
         FROM sale_voids sv
         JOIN sales s  ON s.id  = sv.sale_id
         LEFT JOIN users u2 ON u2.id = sv.approved_by
         WHERE sv.requested_by = ?
         ORDER BY sv.created_at DESC
         LIMIT 50`,
        [req.user!.id]
      );

      // Fetch all items in one query instead of N+1
      const saleIds = (rows as any[]).map(r => r.sale_id);
      const [allItems] = await pool.execute<any[]>(
        `SELECT si.sale_id, si.quantity, si.unit_price, si.subtotal,
                p.product_name,
                COALESCE(u.abbreviation, '') AS unit
         FROM sale_items si
         JOIN products p ON p.id = si.product_id
         LEFT JOIN units u ON u.id = p.unit_id
         WHERE si.sale_id IN (${saleIds.length ? saleIds.map(() => '?').join(',') : '0'})`,
        saleIds
      );

      const itemsBySaleId: Record<number, any[]> = {};
      for (const item of allItems) {
        if (!itemsBySaleId[item.sale_id]) itemsBySaleId[item.sale_id] = [];
        itemsBySaleId[item.sale_id].push({
          product_name: item.product_name,
          unit: item.unit,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          subtotal: Number(item.subtotal),
        });
      }

      const result = (rows as any[]).map(row => ({
        ...row,
        total_amount: Number(row.total_amount),
        items: itemsBySaleId[row.sale_id] || [],
      }));

      res.status(200).json(result);
    } catch (err) {
      console.error("[GET /api/sales/my-void-requests] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
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
                sv.rejection_reason,
                sv.created_at, sv.resolved_at
         FROM sale_voids sv
         JOIN sales s  ON s.id  = sv.sale_id
         JOIN users u1 ON u1.id = sv.requested_by
         LEFT JOIN users u2 ON u2.id = sv.approved_by
         ORDER BY sv.created_at DESC
         LIMIT 100`
      );

      // Fetch all items in one query instead of N+1
      const saleIds = (rows as any[]).map(r => r.sale_id);
      const [allItems] = await pool.execute<any[]>(
        `SELECT si.sale_id, si.quantity, si.unit_price, si.subtotal,
                p.product_name,
                COALESCE(u.abbreviation, '') AS unit
         FROM sale_items si
         JOIN products p ON p.id = si.product_id
         LEFT JOIN units u ON u.id = p.unit_id
         WHERE si.sale_id IN (${saleIds.length ? saleIds.map(() => '?').join(',') : '0'})`,
        saleIds
      );

      const itemsBySaleId: Record<number, any[]> = {};
      for (const item of allItems) {
        if (!itemsBySaleId[item.sale_id]) itemsBySaleId[item.sale_id] = [];
        itemsBySaleId[item.sale_id].push({
          product_name: item.product_name,
          unit: item.unit,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          subtotal: Number(item.subtotal),
        });
      }

      const result = (rows as any[]).map(row => ({
        ...row,
        total_amount: Number(row.total_amount),
        items: itemsBySaleId[row.sale_id] || [],
      }));

      res.status(200).json(result);
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
                s.change_amount, s.void_status, s.payment_status, s.receipt_printed, s.created_at
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
           COALESCE(u.abbreviation, '') AS unit_abbreviation,
           COALESCE(p.quantity_type, 'WHOLE_UNIT') AS quantity_type,
           COALESCE(u.allow_decimal, 0) AS unit_allow_decimal,
           (
             SELECT COALESCE(SUM(ri.quantity_returned), 0)
             FROM return_items ri
             JOIN returns r ON ri.return_id = r.id
             WHERE ri.sale_item_id = si.id
               AND r.status IN ('pending', 'waiting_for_cashier', 'completed')
           ) AS quantity_returned
         FROM sale_items si
         JOIN products p ON p.id = si.product_id
         LEFT JOIN units u ON u.id = p.unit_id
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
        payment_status: sale.payment_status,
        receipt_printed: sale.receipt_printed === 1 || sale.receipt_printed === true,
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

export default router;