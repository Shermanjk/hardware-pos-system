import { Request, Response, Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();

// ─── Helper: parse cart_data JSON (supports old array format & new wrapper) ───
// Old format:  JSON array of items  →  { items: [...], discount: null }
// New format:  { items: [...], discount: {...} | null }
function parseCartData(raw: any): { cart_data: any[]; discount: any | null } {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (Array.isArray(parsed)) {
    return { cart_data: parsed, discount: null };
  }
  return { cart_data: parsed?.items ?? [], discount: parsed?.discount ?? null };
}

// ─── Validation schemas ───────────────────────────────────────────────────────

const suspendedItemSchema = z.object({
  product_id: z.number().int().positive(),
  name: z.string(),
  barcode: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
  subtotal: z.number().positive(),
  tax_type: z.enum(["VATABLE", "VAT_EXEMPT", "ZERO_RATED", "NON_TAXABLE"]).optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  taxable_amount: z.number().min(0).optional(),
  vat_amount: z.number().min(0).optional(),
});

const suspendSaleSchema = z.object({
  customer_name: z.string().min(0).default(""),
  customer_address: z.string().optional(),
  customer_tin: z.string().optional(),
  cart_items: z.array(suspendedItemSchema).min(1),
  label: z.string().optional(),
  discount: z.object({
    id: z.number().int().positive(),
    name: z.string(),
    percentage: z.number(),
    requiresApproval: z.boolean(),
    isScPwd: z.boolean().optional(),
  }).nullable().optional(),
});

// ─── GET /api/suspended-sales — List suspended sales for current cashier ───────
router.get(
  "/",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT 
           id,
           suspended_order_id,
           cashier_id,
           customer_name,
           customer_address,
           customer_tin,
           cart_data,
           status,
           label,
           created_at,
           updated_at
         FROM suspended_sales
         WHERE cashier_id = ? AND status = 'SUSPENDED'
         ORDER BY updated_at DESC`,
        [req.user!.id]
      );
      
      const suspended = rows.map((row) => ({
        id: row.id,
        suspended_order_id: row.suspended_order_id,
        customer_name: row.customer_name,
        customer_address: row.customer_address,
        customer_tin: row.customer_tin,
        ...parseCartData(row.cart_data),
        status: row.status,
        label: row.label,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
      
      res.status(200).json(suspended);
    } catch (err) {
      console.error("[GET /api/suspended-sales] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── POST /api/suspended-sales — Suspend a sale ───────────────────────────────
router.post(
  "/",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = suspendSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ 
        message: "Invalid request", 
        errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) 
      });
      return;
    }

    const { customer_name, customer_address, customer_tin, cart_items, label, discount } = parsed.data;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Generate unique suspended order ID
      const [seqRows] = await conn.execute<any[]>(
        `SELECT id, current_number FROM invoice_sequences WHERE prefix = 'SUSP' LIMIT 1 FOR UPDATE`
      );
      
      let suspendedOrderId: string;
      
      if (!seqRows[0]) {
        // Create sequence if not exists
        await conn.execute(
          `INSERT INTO invoice_sequences (prefix, current_number, updated_at) VALUES ('SUSP', 0, NOW())`
        );
        const [newSeq] = await conn.execute<any[]>(
          `SELECT id, current_number FROM invoice_sequences WHERE prefix = 'SUSP' LIMIT 1`
        );
        const nextNum = (newSeq[0].current_number as number) + 1;
        await conn.execute(
          `UPDATE invoice_sequences SET current_number = ?, updated_at = NOW() WHERE id = ?`,
          [nextNum, newSeq[0].id]
        );
        suspendedOrderId = `SUSP-${String(nextNum).padStart(6, "0")}`;
      } else {
        const nextNum = (seqRows[0].current_number as number) + 1;
        await conn.execute(
          `UPDATE invoice_sequences SET current_number = ?, updated_at = NOW() WHERE id = ?`,
          [nextNum, seqRows[0].id]
        );
        suspendedOrderId = `SUSP-${String(nextNum).padStart(6, "0")}`;
      }

      // Insert suspended sale — cart_data stores items, label stores discount as JSON in the label
      // We store discount separately inside a wrapper JSON object
      const cartDataJson = JSON.stringify({ items: cart_items, discount: discount ?? null });

      await conn.execute(
        `INSERT INTO suspended_sales 
           (suspended_order_id, cashier_id, customer_name, customer_address, customer_tin, cart_data, label)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          suspendedOrderId,
          req.user!.id,
          customer_name || "",
          customer_address || null,
          customer_tin || null,
          cartDataJson,
          label || null,
        ]
      );

      await conn.commit();

      res.status(201).json({
        id: suspendedOrderId,
        message: "Sale suspended successfully.",
      });
    } catch (err) {
      await conn.rollback();
      console.error("[POST /api/suspended-sales] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    } finally {
      conn.release();
    }
  }
);

// ─── GET /api/suspended-sales/:id — Get specific suspended sale ────────────────
router.get(
  "/:id",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    try {
      const [rows] = await pool.execute<any[]>(
        `SELECT 
           id,
           suspended_order_id,
           cashier_id,
           customer_name,
           customer_address,
           customer_tin,
           cart_data,
           status,
           label,
           created_at,
           updated_at
         FROM suspended_sales
         WHERE suspended_order_id = ? AND cashier_id = ? AND status = 'SUSPENDED'
         LIMIT 1`,
        [id, req.user!.id]
      );

      if (rows.length === 0) {
        res.status(404).json({ message: "Suspended sale not found." });
        return;
      }

      const row = rows[0];
      res.status(200).json({
        id: row.id,
        suspended_order_id: row.suspended_order_id,
        customer_name: row.customer_name,
        customer_address: row.customer_address,
        customer_tin: row.customer_tin,
        ...parseCartData(row.cart_data),
        status: row.status,
        label: row.label,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    } catch (err) {
      console.error("[GET /api/suspended-sales/:id] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── PUT /api/suspended-sales/:id — Update suspended sale (resume) ─────────────
router.put(
  "/:id",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const parsed = suspendSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ 
        message: "Invalid request",
        errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) 
      });
      return;
    }

    const { customer_name, customer_address, customer_tin, cart_items, label, discount } = parsed.data;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Row-lock the suspended sale to prevent concurrent update/complete/discard
      const [rows] = await conn.execute<any[]>(
        `SELECT id FROM suspended_sales
         WHERE suspended_order_id = ? AND cashier_id = ? AND status = 'SUSPENDED'
         FOR UPDATE`,
        [id, req.user!.id]
      );
      if (rows.length === 0) {
        await conn.rollback();
        res.status(404).json({ message: "Suspended sale not found or already completed." });
        return;
      }

      const cartDataJson = JSON.stringify({ items: cart_items, discount: discount ?? null });

      const [result] = await conn.execute<any>(
        `UPDATE suspended_sales 
         SET customer_name = ?, customer_address = ?, customer_tin = ?, cart_data = ?, label = ?, updated_at = NOW()
         WHERE suspended_order_id = ? AND cashier_id = ? AND status = 'SUSPENDED'`,
        [
          customer_name || "",
          customer_address || null,
          customer_tin || null,
          cartDataJson,
          label || null,
          id,
          req.user!.id,
        ]
      );

      if (result.affectedRows === 0) {
        await conn.rollback();
        res.status(404).json({ message: "Suspended sale not found or already completed." });
        return;
      }

      await conn.commit();
      res.status(200).json({ message: "Suspended sale updated." });
    } catch (err) {
      await conn.rollback();
      console.error("[PUT /api/suspended-sales/:id] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    } finally {
      conn.release();
    }
  }
);

// ─── DELETE /api/suspended-sales/:id — Discard suspended sale ─────────────────
router.delete(
  "/:id",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Row-lock to prevent race conditions
      const [rows] = await conn.execute<any[]>(
        `SELECT id FROM suspended_sales
         WHERE suspended_order_id = ? AND cashier_id = ? AND status = 'SUSPENDED'
         FOR UPDATE`,
        [id, req.user!.id]
      );
      if (rows.length === 0) {
        await conn.rollback();
        res.status(404).json({ message: "Suspended sale not found or already completed." });
        return;
      }

      // Mark as cancelled instead of deleting to keep audit trail
      const [result] = await conn.execute<any>(
        `UPDATE suspended_sales 
         SET status = 'CANCELLED', updated_at = NOW()
         WHERE suspended_order_id = ? AND cashier_id = ? AND status = 'SUSPENDED'`,
        [id, req.user!.id]
      );

      if (result.affectedRows === 0) {
        await conn.rollback();
        res.status(404).json({ message: "Suspended sale not found or already completed." });
        return;
      }

      await conn.commit();
      res.status(200).json({ message: "Suspended sale discarded." });
    } catch (err) {
      await conn.rollback();
      console.error("[DELETE /api/suspended-sales/:id] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    } finally {
      conn.release();
    }
  }
);

// ─── POST /api/suspended-sales/:id/complete — Convert to completed sale ───────
// Follows the same power-outage-safe order of operations as POST /api/sales
router.post(
  "/:id/complete",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const cash_tendered = Number(req.body.cash_tendered ?? 0);
    const change_amount = req.body.change_amount !== undefined ? Number(req.body.change_amount) : undefined;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 0. Get suspended sale with row-lock
      const [rows] = await conn.execute<any[]>(
        `SELECT id, cart_data, customer_name, customer_address, customer_tin
         FROM suspended_sales
         WHERE suspended_order_id = ? AND cashier_id = ? AND status = 'SUSPENDED'
         FOR UPDATE`,
        [id, req.user!.id]
      );

      if (rows.length === 0) {
        await conn.rollback();
        res.status(404).json({ message: "Suspended sale not found." });
        return;
      }

      const suspended = rows[0];
      const { cart_data: cartItems } = parseCartData(suspended.cart_data);

      // 1. Read tax_rate and vat_registered from system_settings (authoritative)
      const [settingsRows] = await conn.execute<any[]>(
        `SELECT vat_rate, vat_enabled FROM system_settings WHERE id = 1 LIMIT 1`
      );
      const dbTaxRate   = Number(settingsRows[0]?.vat_rate ?? 12);
      const dbVatActive = settingsRows[0]?.vat_enabled === true || settingsRows[0]?.vat_enabled === 1;

      // 2. Validate product_ids exist and fetch authoritative DB product data
      //    Also lock product rows and check stock BEFORE any writes
      const productData: Record<number, {
        name: string; tax_type: string; selling_price: number; quantity: number;
      }> = {};
      for (const item of cartItems) {
        const pid = Number(item.product_id);
        if (!Number.isInteger(pid) || pid <= 0) {
          await conn.rollback();
          res.status(400).json({ message: `Invalid product ID in suspended cart.` });
          return;
        }
        const qty = Number(item.quantity);
        const [prodRows] = await conn.execute<any[]>(
          `SELECT quantity, product_name AS name, tax_type, selling_price
           FROM products WHERE id = ? FOR UPDATE`,
          [pid]
        );
        const product = prodRows[0];
        if (!product) {
          await conn.rollback();
          res.status(404).json({ message: `Product ID ${pid} no longer exists.` });
          return;
        }
        if (Number(product.quantity) < qty) {
          await conn.rollback();
          res.status(409).json({
            message: `Insufficient stock for product: ${product.name}.`,
          });
          return;
        }
        productData[pid] = {
          name: product.name,
          tax_type: product.tax_type ?? "VATABLE",
          selling_price: Number(product.selling_price),
          quantity: Number(product.quantity),
        };
      }

      // 3. Recalculate ALL totals from authoritative DB product data
      //    (never trust the cart JSON — prices/tax settings may have changed)
      type CalcItem = {
        product_id: number; quantity: number;
        unit_price: number; line_subtotal: number;
        tax_type: string; tax_rate: number;
        taxable_amount: number; vat_amount: number;
      };
      const calcItems: CalcItem[] = cartItems.map((item: any) => {
        const p           = productData[item.product_id];
        const unit_price  = p.selling_price;
        const quantity    = Number(item.quantity);
        const line_subtotal = Math.round(unit_price * quantity * 100) / 100;
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
          product_id: item.product_id, quantity,
          unit_price, line_subtotal,
          tax_type: taxType, tax_rate: taxRate,
          taxable_amount: taxableAmt, vat_amount: vatAmt,
        };
      });

      const calc_total_amount = Math.round(
        calcItems.reduce((s, i) => s + i.line_subtotal, 0) * 100
      ) / 100;
      const calc_vat_amount = Math.round(
        calcItems.reduce((s, i) => s + i.vat_amount, 0) * 100
      ) / 100;
      const calc_subtotal = Math.round((calc_total_amount - calc_vat_amount) * 100) / 100;
      const calc_change   = change_amount !== undefined
        ? change_amount
        : Math.round((cash_tendered - calc_total_amount) * 100) / 100;

      // 4. Generate invoice number (concurrency-safe, row-locked sequence)
      const [invSeqRows] = await conn.execute<any[]>(
        `SELECT id, prefix, current_number FROM invoice_sequences WHERE prefix = 'INV' LIMIT 1 FOR UPDATE`
      );
      if (!invSeqRows[0]) {
        await conn.rollback();
        res.status(500).json({ message: "Invoice sequence not found. Run migration 010." });
        return;
      }
      const nextInvNum = Number(invSeqRows[0].current_number) + 1;
      await conn.execute(
        `UPDATE invoice_sequences SET current_number = ?, updated_at = NOW() WHERE id = ?`,
        [nextInvNum, invSeqRows[0].id]
      );
      const invoice_number = `${invSeqRows[0].prefix}-${String(nextInvNum).padStart(6, "0")}`;

      // 5. Insert sale header (payment_status = 'pending') — all backend-calculated values
      const [saleHeaderResult] = await conn.execute<any>(
        `INSERT INTO sales
           (invoice_number, customer_name, customer_address, customer_tin,
            cashier_id, subtotal, vat_amount, total_amount, cash_tendered, change_amount,
            payment_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          invoice_number,
          suspended.customer_name || "Walk-in Customer",
          suspended.customer_address || null,
          suspended.customer_tin || null,
          req.user!.id,
          calc_subtotal,
          calc_vat_amount,
          calc_total_amount,
          cash_tendered,
          calc_change >= 0 ? calc_change : 0,
        ]
      );
      const sale_id: number = saleHeaderResult.insertId;

      // 6. Insert sale items + deduct inventory + write inventory log
      for (const ci of calcItems) {
        await conn.execute(
          `INSERT INTO sale_items
             (sale_id, product_id, quantity, unit_price, subtotal,
              tax_type, tax_rate, taxable_amount, vat_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [sale_id, ci.product_id, ci.quantity, ci.unit_price, ci.line_subtotal,
           ci.tax_type, ci.tax_rate, ci.taxable_amount, ci.vat_amount]
        );
        await conn.execute(
          `UPDATE products SET quantity = quantity - ? WHERE id = ?`,
          [ci.quantity, ci.product_id]
        );
        await conn.execute(
          `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, reference, user_id)
           VALUES (?, 'Sale', 'sale', ?, ?, ?)`,
          [ci.product_id, -ci.quantity, invoice_number, req.user!.id]
        );
      }

      // 7. Mark suspended sale as COMPLETED
      await conn.execute(
        `UPDATE suspended_sales SET status = 'COMPLETED', updated_at = NOW() WHERE id = ?`,
        [suspended.id]
      );

      // 8. COMMIT — all-or-nothing
      await conn.commit();

      // 9. Post-commit: flip payment_status to 'completed'
      try {
        await pool.execute(
          `UPDATE sales SET payment_status = 'completed' WHERE id = ? AND payment_status = 'pending'`,
          [sale_id]
        );
      } catch (updateErr) {
        console.warn(`[SUSPENDED-COMPLETE] Failed to update payment_status for sale ${sale_id}:`, updateErr);
      }

      // 10. Audit log (non-fatal, outside transaction)
      import("../utils/auditLogger.js")
        .then(({ logAuditEvent }) => logAuditEvent({
          action: "SALE_COMPLETED",
          performedById: req.user!.id,
          performedByUsername: req.user!.username,
          entityType: "sales",
          entityId: sale_id,
          newValues: { invoice_number, total_amount: calc_total_amount, customer_name: suspended.customer_name || "Walk-in Customer", source: "suspended_sale" },
        }))
        .catch((e) => console.error("[auditLogger] import failed:", e));

      res.status(201).json({
        invoice_number,
        id: sale_id,
        subtotal:      calc_subtotal,
        vat_amount:    calc_vat_amount,
        total_amount:  calc_total_amount,
        change_amount: calc_change >= 0 ? calc_change : 0,
        payment_status: "completed",
        receipt_printed: false,
        suspended_order_id: id,
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
      console.error("[POST /api/suspended-sales/:id/complete] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    } finally {
      conn.release();
    }
  }
);

export default router;