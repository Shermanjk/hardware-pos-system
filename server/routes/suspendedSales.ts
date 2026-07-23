import { Router, Request, Response } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();

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
        cart_data: typeof row.cart_data === 'string' ? JSON.parse(row.cart_data) : row.cart_data,
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

    const { customer_name, customer_address, customer_tin, cart_items, label } = parsed.data;

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

      // Insert suspended sale
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
          JSON.stringify(cart_items),
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
        cart_data: typeof row.cart_data === 'string' ? JSON.parse(row.cart_data) : row.cart_data,
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

    const { customer_name, customer_address, customer_tin, cart_items, label } = parsed.data;

    try {
      const [result] = await pool.execute<any>(
        `UPDATE suspended_sales 
         SET customer_name = ?, customer_address = ?, customer_tin = ?, cart_data = ?, label = ?, updated_at = NOW()
         WHERE suspended_order_id = ? AND cashier_id = ? AND status = 'SUSPENDED'`,
        [
          customer_name || "",
          customer_address || null,
          customer_tin || null,
          JSON.stringify(cart_items),
          label || null,
          id,
          req.user!.id,
        ]
      );

      if (result.affectedRows === 0) {
        res.status(404).json({ message: "Suspended sale not found or already completed." });
        return;
      }

      res.status(200).json({ message: "Suspended sale updated." });
    } catch (err) {
      console.error("[PUT /api/suspended-sales/:id] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
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

    try {
      // Mark as cancelled instead of deleting to keep audit trail
      const [result] = await pool.execute<any>(
        `UPDATE suspended_sales 
         SET status = 'CANCELLED', updated_at = NOW()
         WHERE suspended_order_id = ? AND cashier_id = ? AND status = 'SUSPENDED'`,
        [id, req.user!.id]
      );

      if (result.affectedRows === 0) {
        res.status(404).json({ message: "Suspended sale not found or already completed." });
        return;
      }

      res.status(200).json({ message: "Suspended sale discarded." });
    } catch (err) {
      console.error("[DELETE /api/suspended-sales/:id] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);

// ─── POST /api/suspended-sales/:id/complete — Convert to completed sale ───────
router.post(
  "/:id/complete",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { cash_tendered, change_amount } = req.body;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Get suspended sale
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
      const cartItems = typeof suspended.cart_data === 'string' 
        ? JSON.parse(suspended.cart_data) 
        : suspended.cart_data;

      // Calculate totals from cart items (backend authoritative)
      let subtotal = 0;
      let vatAmount = 0;

      for (const item of cartItems) {
        const lineSubtotal = Number(item.subtotal);
        const taxType = item.tax_type || "VATABLE";
        
        if (taxType === "VATABLE") {
          const taxableAmt = Math.round((lineSubtotal / 1.12) * 100) / 100;
          const vatAmt = Math.round((lineSubtotal - taxableAmt) * 100) / 100;
          subtotal += taxableAmt;
          vatAmount += vatAmt;
        } else {
          subtotal += lineSubtotal;
        }
      }

      const totalAmount = Math.round((subtotal + vatAmount) * 100) / 100;
      const changeAmount = change_amount !== undefined 
        ? Number(change_amount) 
        : Math.round((Number(cash_tendered || 0) - totalAmount) * 100) / 100;

      // Generate invoice number
      const invoiceSeqRows = await conn.execute<any[]>(
        `SELECT id, current_number FROM invoice_sequences WHERE prefix = 'INV' LIMIT 1 FOR UPDATE`
      );
      const nextInvNum = (invoiceSeqRows[0][0]?.current_number || 0) + 1;
      await conn.execute(
        `UPDATE invoice_sequences SET current_number = ?, updated_at = NOW() WHERE id = ?`,
        [nextInvNum, invoiceSeqRows[0][0]?.id]
      );
      const invoiceNumber = `INV-${String(nextInvNum).padStart(6, "0")}`;

      // Insert sale header
      await conn.execute(
        `INSERT INTO sales
           (invoice_number, customer_name, customer_address, customer_tin,
            cashier_id, subtotal, vat_amount, total_amount, cash_tendered, change_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceNumber,
          suspended.customer_name || "Walk-in Customer",
          suspended.customer_address || null,
          suspended.customer_tin || null,
          req.user!.id,
          subtotal,
          vatAmount,
          totalAmount,
          cash_tendered || 0,
          changeAmount >= 0 ? changeAmount : 0,
        ]
      );

      const [saleResult] = await conn.execute<any>(
        `SELECT LAST_INSERT_ID() AS sale_id`
      );
      const saleId = saleResult[0].sale_id;

      // Insert sale items and deduct inventory
      for (const item of cartItems) {
        const lineSubtotal = Number(item.subtotal);
        const taxType = item.tax_type || "VATABLE";
        const isVatable = taxType === "VATABLE";
        const taxRate = isVatable ? 12 : 0;
        const taxableAmt = isVatable ? Math.round((lineSubtotal / 1.12) * 100) / 100 : lineSubtotal;
        const vatAmt = isVatable ? Math.round((lineSubtotal - taxableAmt) * 100) / 100 : 0;

        // Insert sale item
        await conn.execute(
          `INSERT INTO sale_items
             (sale_id, product_id, quantity, unit_price, subtotal,
              tax_type, tax_rate, taxable_amount, vat_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            saleId,
            item.product_id,
            item.quantity,
            item.unitPrice,
            lineSubtotal,
            taxType,
            taxRate,
            taxableAmt,
            vatAmt,
          ]
        );

        // Check stock and deduct
        const [productRows] = await conn.execute<any[]>(
          `SELECT quantity, product_name FROM products WHERE id = ? FOR UPDATE`,
          [item.product_id]
        );

        if (!productRows[0] || productRows[0].quantity < item.quantity) {
          await conn.rollback();
          res.status(409).json({ 
            message: `Insufficient stock for product: ${item.name || `ID ${item.product_id}`}` 
          });
          return;
        }

        await conn.execute(
          `UPDATE products SET quantity = quantity - ? WHERE id = ?`,
          [item.quantity, item.product_id]
        );

        // Inventory log
        await conn.execute(
          `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, reference, user_id)
           VALUES (?, 'Sale', 'sale', ?, ?, ?)`,
          [item.product_id, -item.quantity, invoiceNumber, req.user!.id]
        );
      }

      // Mark suspended sale as completed
      await conn.execute(
        `UPDATE suspended_sales SET status = 'COMPLETED', updated_at = NOW() WHERE id = ?`,
        [suspended.id]
      );

      await conn.commit();

      res.status(201).json({
        invoice_number: invoiceNumber,
        id: saleId,
        subtotal,
        vat_amount: vatAmount,
        total_amount: totalAmount,
        change_amount: changeAmount >= 0 ? changeAmount : 0,
        suspended_order_id: id,
        items: cartItems.map((item: any) => ({
          product_id: item.product_id,
          tax_type: item.tax_type || "VATABLE",
          taxable_amount: (item.taxable_amount || 0),
          vat_amount: (item.vat_amount || 0),
          line_subtotal: item.subtotal,
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