import { Router, Request, Response } from "express";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { generateInvoiceNumber } from "../utils/invoiceNumber.js";
import { z } from "zod";

const router = Router();

// ─── Validation schema ────────────────────────────────────────────────────────
const createSaleSchema = z.object({
  customer_name:    z.string().min(1),
  customer_address: z.string().optional(),
  customer_tin:     z.string().optional(),
  subtotal:         z.number().positive(),
  vat_amount:       z.number().min(0),
  total_amount:     z.number().positive(),
  cash_tendered:    z.number().positive(),
  change_amount:    z.number().min(0),
  items: z.array(z.object({
    product_id: z.number().int().positive(),
    quantity:   z.number().int().positive(),
    unit_price: z.number().positive(),
    subtotal:   z.number().positive(),
  })).min(1),
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
      customer_name,
      customer_address,
      customer_tin,
      subtotal,
      vat_amount,
      total_amount,
      cash_tendered,
      change_amount,
      items,
    } = parsed.data;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // ── 1. Check stock for each item (with row-level lock) ───────────────────
      for (const item of items) {
        const [rows] = await conn.execute<any[]>(
          `SELECT quantity, name FROM products WHERE id = ? FOR UPDATE`,
          [item.product_id]
        );
        const product = rows[0];
        if (!product || product.quantity < item.quantity) {
          await conn.rollback();
          const name = product?.name ?? `ID ${item.product_id}`;
          res.status(409).json({ message: `Insufficient stock for product: ${name}.` });
          return;
        }
      }

      // ── 2. Generate invoice number ────────────────────────────────────────────
      const invoice_number = await generateInvoiceNumber(conn);

      // ── 3. Insert the sale row ────────────────────────────────────────────────
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
          subtotal,
          vat_amount,
          total_amount,
          cash_tendered,
          change_amount,
        ]
      );
      const sale_id: number = saleResult.insertId;

      // ── 4. Insert sale items, decrement stock, log inventory ─────────────────
      for (const item of items) {
        // Insert sale_item
        const [siResult] = await conn.execute<any>(
          `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal)
           VALUES (?, ?, ?, ?, ?)`,
          [sale_id, item.product_id, item.quantity, item.unit_price, item.subtotal]
        );

        // Decrement stock
        await conn.execute(
          `UPDATE products SET quantity = quantity - ? WHERE id = ?`,
          [item.quantity, item.product_id]
        );

        // Inventory log (negative quantity_change for a sale)
        await conn.execute(
          `INSERT INTO inventory_logs (product_id, action, quantity_change, reference, user_id)
           VALUES (?, 'sale', ?, ?, ?)`,
          [item.product_id, -item.quantity, invoice_number, req.user!.id]
        );
      }

      await conn.commit();

      res.status(201).json({ invoice_number, id: sale_id });
    } catch (err) {
      await conn.rollback();
      console.error("[POST /api/sales] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
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
      // Fetch sale with cashier name
      const [saleRows] = await pool.execute<any[]>(
        `SELECT s.id, s.invoice_number, s.customer_name, s.customer_address,
                s.customer_tin, s.cashier_id, u.full_name AS cashier_name,
                s.subtotal, s.vat_amount, s.total_amount, s.cash_tendered,
                s.change_amount, s.created_at
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

      // Fetch sale items with product info and quantity_returned
      const [itemRows] = await pool.execute<any[]>(
        `SELECT
           si.id,
           si.sale_id,
           si.product_id,
           p.name         AS product_name,
           p.barcode,
           p.is_returnable,
           si.quantity,
           si.unit_price,
           si.subtotal,
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

      res.status(200).json({ ...sale, items: itemRows });
    } catch (err) {
      console.error("[GET /api/sales/:invoiceNumber] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    }
  }
);

// ─── GET / — List / search sales (Admin only) ─────────────────────────────────
router.get(
  "/",
  authenticate,
  requireRole("Admin"),
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
                s.change_amount, s.created_at
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
