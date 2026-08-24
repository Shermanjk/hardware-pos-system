import bcrypt from "bcryptjs";
import { Request, Response, Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { logAuditEvent } from "../utils/auditLogger.js";
import { generateInvoiceNumber } from "../utils/invoiceNumber.js";
import { applyFifoAllocation, recalcCustomerBalance } from "./customers.js";
import { broadcastVoidRequest, sendVoidDecision, broadcastEntityUpdate } from "../ws.js";

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
  cash_tendered:    z.number().min(0),   // 0 is allowed for pure-credit sales
  change_amount:    z.number().min(0),
  // client_transaction_id provides idempotency — if the same key is sent twice,
  // the second request returns the existing sale instead of creating a duplicate.
  // This prevents duplicate sales after network retry, browser refresh, or power outage.
  client_transaction_id: z.string().min(1).optional(),
  // Discount fields
  discount_id: z.number().int().positive().optional(),
  discount_request_id: z.number().int().positive().optional(),
  // SC/PWD identification fields
  sc_pwd_type: z.enum(["NONE", "SENIOR_CITIZEN", "PWD"]).optional(),
  sc_pwd_id: z.string().optional(),
  // ─── Credit / Utang fields ───────────────────────────────────────────────
  payment_type:             z.enum(["CASH", "CREDIT"]).optional().default("CASH"),
  customer_id:              z.number().int().positive().optional(),
  down_payment:             z.number().min(0).optional().default(0),
  credit_limit_override_id: z.number().int().positive().optional(),
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
      discount_id, discount_request_id,
      sc_pwd_type = "NONE", sc_pwd_id,
      payment_type = "CASH", customer_id, down_payment = 0,
      credit_limit_override_id,
    } = parsed.data;

    // ── DISCOUNT VALIDATION ────────────────────────────────────────────────────
    let discountAmount = 0;
    let discountName = null;
    let discountIsScPwd = false;
    if (discount_id) {
      const [discountRows] = await pool.execute<any[]>(
        `SELECT id, discount_name, discount_type, value, requires_admin_approval, is_sc_pwd, status
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
      if (discount.discount_type !== "Percentage") {
        res.status(422).json({ message: "Only percentage discounts are supported." });
        return;
      }
      discountIsScPwd = discount.is_sc_pwd === 1 || discount.is_sc_pwd === true;
      if (discountIsScPwd) {
        if (!sc_pwd_type || (sc_pwd_type !== "SENIOR_CITIZEN" && sc_pwd_type !== "PWD")) {
          res.status(422).json({ message: "Statutory SC/PWD discounts require selecting Senior Citizen or PWD as the customer type." });
          return;
        }
        if (!sc_pwd_id || !sc_pwd_id.trim()) {
          res.status(422).json({ message: "Statutory SC/PWD discounts require a valid ID number." });
          return;
        }
        if (!customer_name || customer_name.trim().toLowerCase() === "walk-in customer" || customer_name.trim().toLowerCase() === "walk-in" || customer_name.trim().length < 2) {
          res.status(422).json({ message: "Statutory SC/PWD discounts require the customer's full name (not walk-in)." });
          return;
        }
      }

      // If discount requires approval, validate the approval request
      if (discount.requires_admin_approval) {
        if (!discount_request_id) {
          res.status(422).json({ message: "This discount requires admin approval. Please submit an approval request first." });
          return;
        }
        const [approvalRows] = await pool.execute<any[]>(
          `SELECT id, status, discount_id, discount_amount
           FROM discount_requests
           WHERE id = ? AND discount_id = ? AND cashier_id = ?`,
          [discount_request_id, discount_id, req.user!.id]
        );
        if (approvalRows.length === 0) {
          res.status(404).json({ message: "Discount approval request not found." });
          return;
        }
        const approval = approvalRows[0];
        if (approval.status !== "approved") {
          res.status(422).json({ message: `Discount request is ${approval.status}. Only approved discounts can be applied.` });
          return;
        }
        discountAmount = Number(approval.discount_amount);
      } else {
        // Calculate discount amount from percentage (will be applied after item totals calculated)
        discountAmount = 0; // Will be calculated after item totals
      }
      discountName = discount.discount_name;
    }

    // ── IDEMPOTENCY CHECK ─────────────────────────────────────────────────────
    // If client_transaction_id is provided, check if a sale with this key already exists.
    // This prevents duplicate sales from retried requests after network failure,
    // browser refresh, or power outage recovery.
    const clientTxnId = parsed.data.client_transaction_id;
    if (clientTxnId) {
      try {
        const [existing] = await pool.execute<any[]>(
          `SELECT s.id, s.invoice_number, s.subtotal, s.discount, s.discount_id, s.vat_amount, s.vat_exempt_amount, s.total_amount, s.change_amount,
                  s.payment_status, s.receipt_printed, s.sc_pwd_type, s.sc_pwd_id, d.discount_name
           FROM sales s
           LEFT JOIN discounts d ON d.id = s.discount_id
           WHERE s.client_transaction_id = ? LIMIT 1`,
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
            discount: Number(sale.discount ?? 0),
            discount_name: sale.discount_name ?? null,
            discount_id: sale.discount_id ?? null,
            vat_amount: Number(sale.vat_amount),
            vat_exempt_amount: Number(sale.vat_exempt_amount ?? 0),
            sc_pwd_type: sale.sc_pwd_type ?? "NONE",
            sc_pwd_id: sale.sc_pwd_id ?? null,
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

      // ── 0. Read tax_rate from system_settings ───────────────────────────────────
      const [settingsRows] = await conn.execute<any[]>(
        `SELECT vat_rate, vat_enabled FROM system_settings WHERE id = 1 LIMIT 1`
      );
      const dbTaxRate   = Number(settingsRows[0]?.vat_rate ?? 12);
      const dbVatActive = settingsRows[0]?.vat_enabled === true || settingsRows[0]?.vat_enabled === 1;

      // ── 1. Fetch DB product data + check stock (row-level lock) ───────────────
      const productData: Record<number, {
        name: string; tax_type: string; selling_price: number; quantity: number;
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
          quantity:      Number(product.quantity),
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

      // ── 4. Apply discount if applicable ──────────────────────────────────────
      let final_discount_amount = 0;
      let vat_exempt_amount = 0;
      let final_vat_amount = calc_vat_amount;
      let final_subtotal = calc_subtotal;
      let isScPwdDiscount = sc_pwd_type === "SENIOR_CITIZEN" || sc_pwd_type === "PWD" || discountIsScPwd;

      if (discount_id) {
        // Fetch discount info from DB to get percentage / type / is_sc_pwd
        const [discountRows] = await conn.execute<any[]>(
          `SELECT value, discount_type, is_sc_pwd FROM discounts WHERE id = ?`,
          [discount_id]
        );
        if (discountRows.length > 0) {
          const discountRecord = discountRows[0];
          const isScPwdFlag = discountRecord.is_sc_pwd === 1 || discountRecord.is_sc_pwd === true;
          if (isScPwdFlag) isScPwdDiscount = true;
          const percentage = Number(discountRecord.value);

          if (isScPwdDiscount) {
            // SC/PWD statutory discount per RA 9994 / RA 9442:
            // 1. Filter VATABLE items (eligible for VAT exemption)
            const vatableGross = calcItems
              .filter((i) => i.tax_type === "VATABLE")
              .reduce((s, i) => s + i.line_subtotal, 0);
            const nonVatableGross = calcItems
              .filter((i) => i.tax_type !== "VATABLE")
              .reduce((s, i) => s + i.line_subtotal, 0);

            // 2. Remove 12% VAT to get Net Base for VATABLE items
            const taxDivisor = 1 + (dbTaxRate / 100);
            const netBase = dbVatActive && vatableGross > 0
              ? Math.round((vatableGross / taxDivisor) * 100) / 100
              : vatableGross;

            // 3. SC/PWD 20% discount applies on the Net Base
            const computedDiscount = Math.round((netBase * (percentage / 100)) * 100) / 100;
            // Use pre-approved discount amount if approval was required, otherwise computed
            const rawDiscount = (discountAmount > 0) ? discountAmount : computedDiscount;
            final_discount_amount = Math.min(rawDiscount, netBase);

            // 4. VAT is EXEMPTED for SC/PWD: VAT charged = 0
            final_vat_amount = 0;
            vat_exempt_amount = netBase;
            final_subtotal = Math.round((netBase + nonVatableGross) * 100) / 100;
          } else {
            // Standard discount: percentage or fixed amount
            let rawDiscount = 0;
            if (discountAmount > 0) {
              rawDiscount = discountAmount;
            } else if (discountRecord.discount_type === "Percentage") {
              rawDiscount = Math.round((calc_total_amount * (percentage / 100)) * 100) / 100;
            } else {
              rawDiscount = Math.min(percentage, calc_total_amount);
            }
            final_discount_amount = Math.min(rawDiscount, calc_total_amount);
          }
        }
      } else if (isScPwdDiscount) {
        // SC/PWD discount without discount_id (e.g. direct SC/PWD classification)
        const vatableGross = calcItems
          .filter((i) => i.tax_type === "VATABLE")
          .reduce((s, i) => s + i.line_subtotal, 0);
        const nonVatableGross = calcItems
          .filter((i) => i.tax_type !== "VATABLE")
          .reduce((s, i) => s + i.line_subtotal, 0);

        const taxDivisor = 1 + (dbTaxRate / 100);
        const netBase = dbVatActive && vatableGross > 0
          ? Math.round((vatableGross / taxDivisor) * 100) / 100
          : vatableGross;

        const defaultScPercentage = 20;
        final_discount_amount = Math.round((netBase * (defaultScPercentage / 100)) * 100) / 100;
        final_vat_amount = 0;
        vat_exempt_amount = netBase;
        final_subtotal = Math.round((netBase + nonVatableGross) * 100) / 100;
      }

      // ── Final Amount Payable calculation ─────────────────────────────────────
      // For SC/PWD: Final Payable = Net Base − SC/PWD Discount (+ non-vatable items)
      // For Regular: Final Payable = Gross Amount − Discount
      let final_total_amount: number;
      if (isScPwdDiscount) {
        const nonVatableGross = calcItems
          .filter((i) => i.tax_type !== "VATABLE")
          .reduce((s, i) => s + i.line_subtotal, 0);
        final_total_amount = Math.round((vat_exempt_amount - final_discount_amount + nonVatableGross) * 100) / 100;
      } else {
        final_total_amount = Math.round((calc_total_amount - final_discount_amount) * 100) / 100;
      }
      const calc_change = Math.round((cash_tendered - final_total_amount) * 100) / 100;

      // ── 5. Generate invoice number (concurrency-safe) ─────────────────────────
      const invoice_number = await generateInvoiceNumber(conn);
      let final_sc_pwd_type = isScPwdDiscount ? sc_pwd_type : "NONE";
      let final_sc_pwd_id   = isScPwdDiscount ? (sc_pwd_id ?? null) : null;

      // ── 6. Insert the sale row using backend-calculated totals ────────────────
      // payment_status starts as 'pending' — it will be updated to 'completed'
      // after the transaction commits successfully.

      const [saleResult] = await conn.execute<any>(
        `INSERT INTO sales
           (invoice_number, customer_name, customer_address, customer_tin,
            cashier_id, subtotal, discount, discount_id, sc_pwd_type, sc_pwd_id,
            vat_amount, vat_exempt_amount, total_amount, cash_tendered, change_amount,
            payment_status, client_transaction_id,
            payment_type, customer_id, amount_paid_at_sale)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
        [
          invoice_number,
          customer_name,
          customer_address ?? null,
          customer_tin ?? null,
          req.user!.id,
          final_subtotal,
          final_discount_amount,
          discount_id ?? null,
          final_sc_pwd_type,
          final_sc_pwd_id,
          final_vat_amount,
          vat_exempt_amount,
          final_total_amount,
          cash_tendered,
          calc_change >= 0 ? calc_change : 0,
          clientTxnId ?? null,
          payment_type,
          payment_type === "CREDIT" ? (customer_id ?? null) : null,
          payment_type === "CREDIT" ? down_payment : null,
        ]
      );
      const sale_id: number = saleResult.insertId;

      // ── 7. Update discount request with sale_id if applicable ───────────────────
      if (discount_request_id) {
        await conn.execute(
          `UPDATE discount_requests SET sale_id = ? WHERE id = ?`,
          [sale_id, discount_request_id]
        );
      }

      // ── 8. Insert sale items using backend-calculated values ──────────────────
      // Track running quantity per product (in case same product appears multiple times)
      const runningQty: Record<number, number> = {};
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

        // BUG-04 FIX: Include quantity (before) and remaining_stock (after) in inventory log
        const beforeQty = runningQty[ci.product_id] !== undefined
          ? runningQty[ci.product_id]
          : productData[ci.product_id].quantity;
        const afterQty = beforeQty - ci.quantity;
        runningQty[ci.product_id] = afterQty;

        await conn.execute(
          `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, quantity, remaining_stock, reference, user_id)
           VALUES (?, 'Sale', 'sale', ?, ?, ?, ?, ?)`,
          [ci.product_id, -ci.quantity, beforeQty, afterQty, invoice_number, req.user!.id]
        );
      }

      // ── 9. Credit ledger entries (credit sales only) ──────────────────────
      let credit_balance_snapshot: number | null = null;
      if (payment_type === "CREDIT" && customer_id) {
        // Validate customer inside the transaction
        const [custRows] = await conn.execute<any[]>(
          `SELECT id, full_name, current_balance, credit_limit, is_credit_enabled
           FROM customers WHERE id = ? FOR UPDATE`,
          [customer_id]
        );
        if (custRows.length === 0) {
          await conn.rollback();
          res.status(404).json({ message: "Customer not found." });
          return;
        }
        const customer = custRows[0];
        if (!customer.is_credit_enabled) {
          await conn.rollback();
          res.status(422).json({ message: "Credit is not enabled for this customer." });
          return;
        }

        // Credit amount = sale total minus any down payment collected
        const creditAmount = Math.round((final_total_amount - down_payment) * 100) / 100;
        const projectedBalance = Math.round((Number(customer.current_balance) + creditAmount) * 100) / 100;

        // Validate credit limit (unless an approved override was provided)
        if (projectedBalance > Number(customer.credit_limit)) {
          if (!credit_limit_override_id) {
            await conn.rollback();
            res.status(422).json({
              message: `Credit limit exceeded. Current balance: ₱${Number(customer.current_balance).toFixed(2)}, Limit: ₱${Number(customer.credit_limit).toFixed(2)}.`,
              code: "CREDIT_LIMIT_EXCEEDED",
              current_balance: Number(customer.current_balance),
              credit_limit: Number(customer.credit_limit),
              sale_total: final_total_amount,
            });
            return;
          }
          // Verify the override is approved for this customer
          const [overrideRows] = await conn.execute<any[]>(
            `SELECT id FROM credit_limit_overrides
             WHERE id = ? AND customer_id = ? AND status = 'approved' AND sale_id IS NULL`,
            [credit_limit_override_id, customer_id]
          );
          if (overrideRows.length === 0) {
            await conn.rollback();
            res.status(422).json({ message: "Invalid or already-used credit limit override." });
            return;
          }
        }

        // Insert CREDIT_SALE ledger entry with gross invoice total
        const [ledgerResult] = await conn.execute<any>(
          `INSERT INTO credit_ledger
             (customer_id, sale_id, entry_type, amount, reference, recorded_by)
           VALUES (?, ?, 'CREDIT_SALE', ?, ?, ?)`,
          [customer_id, sale_id, final_total_amount, invoice_number, req.user!.id]
        );
        const saleLedgerId: number = ledgerResult.insertId;

        // If down payment > 0, insert a PAYMENT entry and FIFO-allocate it
        if (down_payment > 0) {
          const [pmtResult] = await conn.execute<any>(
            `INSERT INTO credit_ledger
               (customer_id, sale_id, entry_type, amount, reference, notes, recorded_by)
             VALUES (?, ?, 'PAYMENT', ?, ?, 'Down payment at sale', ?)`,
          [customer_id, sale_id, -down_payment, invoice_number, req.user!.id]
          );
          // Allocate down payment against this specific sale entry
          await conn.execute(
            `INSERT INTO credit_allocations (payment_ledger_id, sale_ledger_id, amount_applied)
             VALUES (?, ?, ?)`,
            [pmtResult.insertId, saleLedgerId, down_payment]
          );
        }

        // Recalculate and persist balance
        credit_balance_snapshot = await recalcCustomerBalance(conn, customer_id);

        // Link the override to this sale so it cannot be reused
        if (credit_limit_override_id) {
          await conn.execute(
            `UPDATE credit_limit_overrides SET sale_id = ? WHERE id = ?`,
            [sale_id, credit_limit_override_id]
          );
        }

        // Persist balance snapshot on sales row
        await conn.execute(
          `UPDATE sales SET credit_balance = ? WHERE id = ?`,
          [credit_balance_snapshot, sale_id]
        );
      }

      // ── 10. COMMIT — all-or-nothing ───────────────────────────────────────────
      // If power fails here, the entire transaction is rolled back.
      // No sale, no inventory deduction, no invoice number consumed.
      await conn.commit();

      // ── 11. Update payment_status to 'completed' (post-commit) ────────────────
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

      // ── 11. Audit log (non-fatal, outside transaction) ────────────────────────
      await logAuditEvent({
        action: "SALE_COMPLETED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "sales",
        entityId: sale_id,
        newValues: { invoice_number, total_amount: final_total_amount, customer_name, discount: final_discount_amount, discount_name: discountName },
      });

      // Log discount application if applicable
      if (discount_id) {
        await logAuditEvent({
          action: "DISCOUNT_APPLIED",
          performedById: req.user!.id,
          performedByUsername: req.user!.username,
          entityType: "sales",
          entityId: sale_id,
          newValues: {
            discount_id,
            discount_name: discountName,
            discount_amount: final_discount_amount,
            subtotal: calc_subtotal,
            final_total: final_total_amount,
          },
        });
      }

      // Real-time system sync: notify all connected dashboards and terminals
      broadcastEntityUpdate({ entity: "sales", action: "created", id: sale_id });
      broadcastEntityUpdate({ entity: "dashboard" });
      broadcastEntityUpdate({ entity: "inventory" });
      if (payment_type === "CREDIT" && customer_id) {
        broadcastEntityUpdate({ entity: "customers", action: "updated", id: customer_id, customerId: customer_id });
        broadcastEntityUpdate({ entity: "credit_ledger", customerId: customer_id });
      }

      res.status(201).json({
        invoice_number,
        id: sale_id,
        subtotal:      final_subtotal,
        discount:       final_discount_amount,
        discount_name:  discountName,
        discount_id:    discount_id,
        vat_amount:    final_vat_amount,
        vat_exempt_amount,
        sc_pwd_type,
        sc_pwd_id:     sc_pwd_id ?? null,
        total_amount:  final_total_amount,
        change_amount: calc_change >= 0 ? calc_change : 0,
        payment_status: "completed",
        payment_type,
        credit_balance: credit_balance_snapshot,
        down_payment:  payment_type === "CREDIT" ? down_payment : null,
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
        `SELECT id, invoice_number, void_status, customer_name, total_amount, created_at FROM sales WHERE id = ? FOR UPDATE`,
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

      // Check if this sale belongs to a closed Z-Reading window (BIR Compliance Guard)
      const [lastZRows] = await conn.execute<any[]>(
        `SELECT closed_at FROM z_readings ORDER BY id DESC LIMIT 1`
      );
      if (lastZRows.length > 0 && lastZRows[0].closed_at) {
        const lastZClosedAt = new Date(lastZRows[0].closed_at);
        const saleCreatedAt = new Date(sale.created_at);
        if (saleCreatedAt <= lastZClosedAt) {
          await conn.rollback();
          res.status(422).json({
            message: "This transaction belongs to a closed Z-Reading period and cannot be voided. In accordance with BIR regulations, please process a Return / Refund instead.",
            code: "TRANSACTION_LOCKED_POST_Z_READING",
          });
          return;
        }
      }

      // Check for active or completed returns on this sale
      const [returnCheckRows] = await conn.execute<any[]>(
        `SELECT COUNT(*) AS cnt FROM returns WHERE sale_id = ? AND status NOT IN ('rejected')`,
        [saleId]
      );
      if (Number(returnCheckRows[0]?.cnt ?? 0) > 0) {
        await conn.rollback();
        res.status(422).json({ message: "Cannot void a transaction with active or completed returns." });
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
        `SELECT sv.id, sv.sale_id, sv.status, sv.reason, s.invoice_number, s.created_at
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

      // Check if this sale belongs to a closed Z-Reading window (BIR Compliance Guard)
      const [lastZRowsApprove] = await conn.execute<any[]>(
        `SELECT closed_at FROM z_readings ORDER BY id DESC LIMIT 1`
      );
      if (lastZRowsApprove.length > 0 && lastZRowsApprove[0].closed_at) {
        const lastZClosedAt = new Date(lastZRowsApprove[0].closed_at);
        const saleCreatedAt = new Date(voidRow.created_at);
        if (saleCreatedAt <= lastZClosedAt) {
          await conn.rollback();
          res.status(422).json({
            message: "This transaction belongs to a closed Z-Reading period and cannot be voided. In accordance with BIR regulations, please process a Return / Refund instead.",
            code: "TRANSACTION_LOCKED_POST_Z_READING",
          });
          return;
        }
      }

      // ── Restore inventory for each sold item (deducting any already returned items) ───
      const [saleItems] = await conn.execute<any[]>(
        `SELECT id, product_id, quantity FROM sale_items WHERE sale_id = ?`,
        [voidRow.sale_id]
      );
      const [completedReturns] = await conn.execute<any[]>(
        `SELECT ri.sale_item_id, COALESCE(SUM(ri.quantity_returned), 0) AS returned_qty
         FROM return_items ri
         JOIN returns r ON r.id = ri.return_id
         WHERE r.sale_id = ? AND r.status = 'completed'
         GROUP BY ri.sale_item_id`,
        [voidRow.sale_id]
      );
      const returnedMap = new Map(completedReturns.map((r: any) => [r.sale_item_id, Number(r.returned_qty)]));

      for (const item of saleItems) {
        const alreadyReturned = returnedMap.get(item.id) || 0;
        const qtyToRestore = Math.max(0, Number(item.quantity) - alreadyReturned);
        if (qtyToRestore > 0) {
          await conn.execute(
            `UPDATE products SET quantity = quantity + ? WHERE id = ?`,
            [qtyToRestore, item.product_id]
          );
          await conn.execute(
            `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, reference, user_id)
             VALUES (?, 'Void', 'void_restore', ?, ?, ?)`,
            [item.product_id, qtyToRestore, voidRow.invoice_number, req.user!.id]
          );
        }
      }

      await conn.execute(
        `UPDATE sale_voids SET status = 'approved', approved_by = ?, resolved_at = NOW() WHERE id = ?`,
        [req.user!.id, voidId]
      );
      await conn.execute(
        `UPDATE sales SET void_status = 'voided' WHERE id = ?`,
        [voidRow.sale_id]
      );

      // ── VOID_REVERSAL for credit sales ────────────────────────────────────
      // If the voided sale was a credit sale, insert a VOID_REVERSAL ledger
      // entry to restore the customer's credit balance.
      const [voidedSaleRows] = await conn.execute<any[]>(
        `SELECT payment_type, customer_id, total_amount, amount_paid_at_sale
         FROM sales WHERE id = ?`,
        [voidRow.sale_id]
      );
      if (voidedSaleRows.length > 0 && voidedSaleRows[0].payment_type === "CREDIT" && voidedSaleRows[0].customer_id) {
        const vs = voidedSaleRows[0];
        // The reversal amount = amount that was put on credit (total - down payment at sale)
        const downPaid = Number(vs.amount_paid_at_sale ?? 0);
        const reversalAmount = Math.round((Number(vs.total_amount) - downPaid) * 100) / 100;
        if (reversalAmount > 0) {
          const [reversalResult] = await conn.execute<any>(
            `INSERT INTO credit_ledger
               (customer_id, sale_id, entry_type, amount, reference, notes, recorded_by, authorized_by)
             VALUES (?, ?, 'VOID_REVERSAL', ?, ?, 'Automatic reversal on void approval', ?, ?)`,
            [vs.customer_id, voidRow.sale_id, -reversalAmount,
             voidRow.invoice_number, req.user!.id, req.user!.id]
          );
          // FIFO-allocate the reversal against the original CREDIT_SALE entry
          const [origEntry] = await conn.execute<any[]>(
            `SELECT id FROM credit_ledger
             WHERE sale_id = ? AND entry_type = 'CREDIT_SALE' LIMIT 1`,
            [voidRow.sale_id]
          );
          if (origEntry.length > 0) {
            const alreadyApplied = downPaid; // down payment already allocated at sale time
            const toReverse = Math.min(reversalAmount, reversalAmount); // the net credit amount
            await conn.execute(
              `INSERT INTO credit_allocations (payment_ledger_id, sale_ledger_id, amount_applied)
               VALUES (?, ?, ?)`,
              [reversalResult.insertId, origEntry[0].id, toReverse]
            );
          }
          await recalcCustomerBalance(conn, vs.customer_id);
        }
      }

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

      // Real-time system sync: notify sales, inventory, dashboard, and requests
      broadcastEntityUpdate({ entity: "sales", action: "voided", id: voidRow.sale_id });
      broadcastEntityUpdate({ entity: "dashboard" });
      broadcastEntityUpdate({ entity: "inventory" });
      broadcastEntityUpdate({ entity: "requests" });

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

      // Real-time system sync: notify requests & sales
      broadcastEntityUpdate({ entity: "requests", action: "rejected" });
      broadcastEntityUpdate({ entity: "sales", action: "updated", id: voidRow.sale_id });

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

// ─── POST /voids/:id/local-override — Manager Override on Cashier Terminal ────
// Verifies admin credentials on the spot, then executes the void immediately
// (identical logic to void-approve) without requiring an admin terminal login.
router.post(
  "/voids/:id/local-override",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const voidId = Number(req.params.id);
    if (!Number.isInteger(voidId) || voidId <= 0) {
      res.status(400).json({ message: "Invalid void request ID." });
      return;
    }

    const parsed = z.object({
      username: z.string().min(1, "Username is required"),
      password: z.string().min(1, "Password is required"),
    }).safeParse(req.body);
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
        res.status(403).json({ message: "Only an Admin can authorize void requests." });
        return;
      }

      // ── 2. Load and lock the void request ─────────────────────────────────
      const [rows] = await conn.execute<any[]>(
        `SELECT sv.id, sv.sale_id, sv.status, sv.reason, s.invoice_number, s.created_at
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
        res.status(422).json({
          message: voidRow.status === "approved"
            ? "This void request was already approved."
            : "This void request can no longer be approved.",
        });
        return;
      }

      // Check if this sale belongs to a closed Z-Reading window (BIR Compliance Guard)
      const [lastZRowsOverride] = await conn.execute<any[]>(
        `SELECT closed_at FROM z_readings ORDER BY id DESC LIMIT 1`
      );
      if (lastZRowsOverride.length > 0 && lastZRowsOverride[0].closed_at) {
        const lastZClosedAt = new Date(lastZRowsOverride[0].closed_at);
        const saleCreatedAt = new Date(voidRow.created_at);
        if (saleCreatedAt <= lastZClosedAt) {
          await conn.rollback();
          res.status(422).json({
            message: "This transaction belongs to a closed Z-Reading period and cannot be voided. In accordance with BIR regulations, please process a Return / Refund instead.",
            code: "TRANSACTION_LOCKED_POST_Z_READING",
          });
          return;
        }
      }

      // ── 3. Restore inventory — identical to void-approve ──────────────────
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
           VALUES (?, 'Adjustment', 'void_restore', ?, ?, ?)`,
          [item.product_id, item.quantity, voidRow.invoice_number, manager.id]
        );
      }

      await conn.execute(
        `UPDATE sale_voids SET status = 'approved', approved_by = ?, resolved_at = NOW() WHERE id = ?`,
        [manager.id, voidId]
      );
      await conn.execute(
        `UPDATE sales SET void_status = 'voided' WHERE id = ?`,
        [voidRow.sale_id]
      );

      await conn.commit();

      // ── 4. Audit log ───────────────────────────────────────────────────────
      await logAuditEvent({
        action: "SALE_VOIDED_LOCAL_OVERRIDE",
        performedById: manager.id,
        performedByUsername: manager.username,
        entityType: "sales",
        entityId: voidRow.sale_id,
        reason: voidRow.reason,
        newValues: {
          invoice_number: voidRow.invoice_number,
          void_request_id: voidId,
          override_method: "local_manager_override",
          cashier_id: req.user!.id,
          cashier_username: req.user!.username,
        },
      });

      // ── 5. Notify cashier via WebSocket ───────────────────────────────────
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
          admin_name: manager.full_name ?? manager.username,
          rejection_reason: null,
          cashier_user_id: cashier_id,
        });
      }

      // Real-time system sync: notify sales, inventory, dashboard, requests
      broadcastEntityUpdate({ entity: "sales", action: "voided", id: voidRow.sale_id });
      broadcastEntityUpdate({ entity: "dashboard" });
      broadcastEntityUpdate({ entity: "inventory" });
      broadcastEntityUpdate({ entity: "requests" });

      res.status(200).json({
        message: "Void approved via manager override.",
        admin_name: manager.full_name ?? manager.username,
        admin_id: manager.id,
      });
    } catch (err) {
      await conn.rollback();
      console.error("[POST /api/sales/voids/:id/local-override] Error:", err);
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
      return_status,
      payment_type,
    } = req.query as Record<string, string | undefined>;

    try {
      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (invoice_number) {
        const rawSearch = invoice_number.trim();
        const stripped = rawSearch.replace(/^INV-?/i, "").trim();
        const padded = /^\d+$/.test(stripped) ? stripped.padStart(6, "0") : stripped;
        const invPrefixed = `INV-${padded}`;

        const searchTerms = Array.from(new Set([rawSearch, stripped, padded, invPrefixed])).filter(Boolean);
        const likeClauses = searchTerms.map(() => "s.invoice_number LIKE ?").join(" OR ");
        conditions.push(`(${likeClauses})`);
        searchTerms.forEach((term) => params.push(`%${term}%`));
      }
      if (customer_name) {
        conditions.push("s.customer_name LIKE ?");
        params.push(`%${customer_name}%`);
      }
      if (payment_type && ["CASH", "CREDIT"].includes(payment_type)) {
        conditions.push("s.payment_type = ?");
        params.push(payment_type);
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
      if (return_status === "no_returns") {
        conditions.push("(SELECT COUNT(*) FROM returns r WHERE r.sale_id = s.id AND r.status IN ('pending', 'waiting_for_cashier')) = 0");
      } else if (return_status === "has_returns") {
        conditions.push("(SELECT COUNT(*) FROM returns r WHERE r.sale_id = s.id AND r.status IN ('pending', 'waiting_for_cashier')) > 0");
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await pool.execute<any[]>(
        `SELECT s.id, s.invoice_number, s.customer_name, s.customer_address,
                s.customer_tin, s.cashier_id, u.full_name AS cashier_name,
                s.subtotal, s.discount, s.discount_id, s.sc_pwd_type, s.sc_pwd_id,
                s.vat_amount, s.vat_exempt_amount, s.total_amount, s.cash_tendered,
                s.change_amount, s.void_status, s.payment_status, s.receipt_printed, s.created_at,
                s.payment_type, s.customer_id, s.amount_paid_at_sale, s.credit_balance,
                c.customer_code,
                COALESCE(d.discount_name, dr_d.discount_name) AS discount_name,
                COALESCE(d.discount_type, dr_d.discount_type) AS discount_type,
                COALESCE(d.value, dr.requested_percentage, dr_d.value) AS discount_percentage,
                COALESCE(d.is_sc_pwd, dr_d.is_sc_pwd, 0) AS discount_is_sc_pwd,
                (SELECT COUNT(*) FROM returns r WHERE r.sale_id = s.id AND r.status IN ('pending', 'waiting_for_cashier', 'completed')) AS return_count,
                (SELECT COALESCE(SUM(r.refund_amount), 0) FROM returns r WHERE r.sale_id = s.id AND r.status = 'completed') AS total_refunded
         FROM sales s
         JOIN users u ON u.id = s.cashier_id
         LEFT JOIN customers c ON c.id = s.customer_id
         LEFT JOIN discounts d ON d.id = s.discount_id
         LEFT JOIN discount_requests dr ON dr.sale_id = s.id
         LEFT JOIN discounts dr_d ON dr_d.id = dr.discount_id
         ${where}
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
      const rawParam = invoiceNumber.trim();
      const strippedParam = rawParam.replace(/^INV-?/i, "").trim();
      const paddedParam = /^\d+$/.test(strippedParam) ? strippedParam.padStart(6, "0") : strippedParam;
      const invPrefixed = `INV-${paddedParam}`;
      const lookupKeys = Array.from(new Set([rawParam, strippedParam, paddedParam, invPrefixed])).filter(Boolean);
      const placeholders = lookupKeys.map(() => "?").join(", ");

      const [saleRows] = await pool.execute<any[]>(
        `SELECT s.id, s.invoice_number, s.customer_name, s.customer_address,
                s.customer_tin, s.cashier_id, u.full_name AS cashier_name,
                s.subtotal, s.vat_amount, s.vat_exempt_amount, s.total_amount, s.cash_tendered,
                s.change_amount, s.void_status, s.payment_status, s.receipt_printed, s.created_at,
                s.sc_pwd_type, s.sc_pwd_id, s.discount, s.discount_id,
                s.payment_type, s.customer_id, s.amount_paid_at_sale, s.credit_balance,
                c.customer_code,
                COALESCE(d.discount_name, dr_d.discount_name) AS discount_name,
                COALESCE(d.discount_type, dr_d.discount_type) AS discount_type,
                COALESCE(d.value, dr.requested_percentage, dr_d.value) AS discount_percentage,
                COALESCE(d.is_sc_pwd, dr_d.is_sc_pwd, 0) AS discount_is_sc_pwd,
                dr.id AS discount_request_id,
                dr.status AS discount_approval_status,
                dr.approved_by AS discount_approved_by,
                dr.approved_at AS discount_approved_at,
                app_u.full_name AS approved_by_name,
                (
                  SELECT action FROM audit_logs
                  WHERE entity_type = 'discount_requests' AND entity_id = dr.id
                    AND action IN ('DISCOUNT_APPROVED', 'DISCOUNT_APPROVED_LOCAL_OVERRIDE')
                  ORDER BY id DESC LIMIT 1
                ) AS approval_action
         FROM sales s
         JOIN users u ON u.id = s.cashier_id
         LEFT JOIN customers c ON c.id = s.customer_id
         LEFT JOIN discounts d ON d.id = s.discount_id
         LEFT JOIN discount_requests dr ON dr.sale_id = s.id
         LEFT JOIN discounts dr_d ON dr_d.id = dr.discount_id
         LEFT JOIN users app_u ON app_u.id = dr.approved_by
         WHERE s.invoice_number IN (${placeholders})
         LIMIT 1`,
        lookupKeys
      );

      const sale = saleRows[0];
      if (!sale) {
        res.status(404).json({ message: "Invoice not found." });
        return;
      }

      // Infer missing discount details if not explicitly linked
      let resolvedDiscountName = sale.discount_name;
      let resolvedDiscountType = sale.discount_type;
      let resolvedDiscountPercentage = sale.discount_percentage != null ? Number(sale.discount_percentage) : null;
      let resolvedIsScPwd = sale.discount_is_sc_pwd === 1 || sale.discount_is_sc_pwd === true;

      const discountAmt = Number(sale.discount ?? 0);
      if (sale.sc_pwd_type === "SENIOR_CITIZEN") {
        resolvedDiscountName = resolvedDiscountName ?? "Senior Citizen";
        resolvedDiscountType = resolvedDiscountType ?? "Percentage";
        resolvedDiscountPercentage = resolvedDiscountPercentage ?? 20;
        resolvedIsScPwd = true;
      } else if (sale.sc_pwd_type === "PWD") {
        resolvedDiscountName = resolvedDiscountName ?? "PWD";
        resolvedDiscountType = resolvedDiscountType ?? "Percentage";
        resolvedDiscountPercentage = resolvedDiscountPercentage ?? 20;
        resolvedIsScPwd = true;
      } else if (discountAmt > 0) {
        if (!resolvedDiscountType) {
          resolvedDiscountType = resolvedDiscountPercentage ? "Percentage" : "Fixed";
        }
      }

      let approvalInfo: {
        status: string;
        approved_by: string;
        approved_at?: string | null;
        approval_method: string;
      } | null = null;

      if (sale.discount_request_id && (sale.discount_approval_status === "approved" || sale.discount_approved_by)) {
        approvalInfo = {
          status: "Approved",
          approved_by: sale.approved_by_name || "Admin",
          approved_at: sale.discount_approved_at ?? null,
          approval_method: sale.approval_action === "DISCOUNT_APPROVED_LOCAL_OVERRIDE"
            ? "Manager Override"
            : "Remote Admin Approval",
        };
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
        vat_exempt_amount: Number(sale.vat_exempt_amount ?? 0),
        total_amount:  Number(sale.total_amount),
        cash_tendered: Number(sale.cash_tendered),
        change_amount: Number(sale.change_amount),
        payment_status: sale.payment_status,
        receipt_printed: sale.receipt_printed === 1 || sale.receipt_printed === true,
        sc_pwd_type: sale.sc_pwd_type ?? "NONE",
        sc_pwd_id: sale.sc_pwd_id ?? null,
        discount: discountAmt,
        discount_id: sale.discount_id ?? null,
        discount_name: resolvedDiscountName ?? null,
        discount_type: resolvedDiscountType ?? null,
        discount_percentage: resolvedDiscountPercentage,
        discount_is_sc_pwd: resolvedIsScPwd,
        approval_info: approvalInfo,
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