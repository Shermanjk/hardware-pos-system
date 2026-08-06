import bcrypt from "bcryptjs";
import { Request, Response, Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { logAuditEvent } from "../utils/auditLogger.js";
const router = Router();
router.use(authenticate);

function requireAdmin(req: Request, res: Response): boolean {
  if (req.user?.role !== "Admin") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}

function requireAdminOrClerk(req: Request, res: Response): boolean {
  if (req.user?.role !== "Admin" && req.user?.role !== "Inventory Clerk") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}

function requireCashierOrAdmin(req: Request, res: Response): boolean {
  if (req.user?.role !== "Cashier" && req.user?.role !== "Admin") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const setPriceSchema = z.object({
  price_per_unit: z.number().positive("Price must be greater than 0"),
  reason: z.string().optional().nullable(),
});

const purchaseSchema = z.object({
  product_id:         z.number().int().positive(),
  supplier_id:        z.number().int().positive().optional().nullable(),
  seller_name:        z.string().max(150).optional().nullable(),
  seller_address:     z.string().max(500).optional().nullable(),
  seller_contact:     z.string().max(100).optional().nullable(),
  quantity:           z.number().positive("Quantity must be greater than 0"),
  // NEW: deducted_quantity replaces deduction_per_unit
  // This is the physical quantity to deduct (e.g., 3 kg)
  deducted_quantity:  z.number().min(0).default(0),
  // Keep deduction_per_unit for backwards compatibility with old API calls
  // but it will be ignored in favor of deducted_quantity for new transactions
  deduction_per_unit: z.number().min(0).optional().default(0),
  transaction_date:   z.string().min(1, "Transaction date is required"),
  remarks:            z.string().max(500).optional().nullable(),
  // Payment fields — recorded at purchase time
  payment_status:     z.enum(["UNPAID", "PARTIALLY_PAID", "PAID"]).default("UNPAID"),
  amount_paid:        z.number().min(0).default(0),
  payment_method:     z.string().max(50).optional().nullable(),
  payment_reference:  z.string().max(100).optional().nullable(),
  // Frontend-submitted calculated totals are accepted for schema validation only.
  // The backend recalculates all monetary values from DB data and ignores these.
  submitted_reference_price: z.number().min(0).optional(),
  submitted_gross_amount:    z.number().min(0).optional(),
  submitted_total_deduction: z.number().min(0).optional(),
  submitted_final_amount:    z.number().min(0).optional(),
});

const recordPaymentSchema = z.object({
  amount:            z.number().positive("Payment amount must be greater than 0"),
  payment_method:    z.string().max(50).optional().nullable(),
  payment_reference: z.string().max(100).optional().nullable(),
  notes:             z.string().max(500).optional().nullable(),
});

// ─── GET /api/commodity-prices/products — list MARKET_BASED products ─────────
router.get("/products", async (req: Request, res: Response) => {
  if (!requireAdminOrClerk(req, res)) return;
  try {
    const [rows] = await pool.execute<any[]>(`
      SELECT
        p.id,
        p.product_name,
        p.barcode,
        p.pricing_type,
        COALESCE(u.unit_name, '')        AS unit,
        COALESCE(u.abbreviation, '')     AS unit_abbreviation,
        u.id                             AS unit_id,
        p.quantity,
        lp.price_per_unit                AS current_price,
        lp.effective_from                AS price_effective_from
      FROM products p
      LEFT JOIN units u ON u.id = p.unit_id
      LEFT JOIN (
        SELECT cp1.product_id, cp1.price_per_unit, cp1.effective_from
        FROM commodity_prices cp1
        INNER JOIN (
          SELECT product_id, MAX(effective_from) AS max_ef
          FROM commodity_prices
          GROUP BY product_id
        ) cp2 ON cp1.product_id = cp2.product_id AND cp1.effective_from = cp2.max_ef
      ) lp ON lp.product_id = p.id
      WHERE p.pricing_type = 'MARKET_BASED'
        AND p.status = 'Active'
      ORDER BY p.product_name ASC
    `);
    res.status(200).json(rows);
  } catch (err) {
    console.error("[commodity/GET /products]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/commodity-prices/:productId/current — current reference price ──
router.get("/:productId/current", async (req: Request, res: Response) => {
  if (!requireAdminOrClerk(req, res)) return;
  const productId = parseInt(req.params.productId, 10);
  if (isNaN(productId)) { res.status(400).json({ message: "Invalid product ID." }); return; }

  try {
    const [rows] = await pool.execute<any[]>(`
      SELECT
        cp.id,
        cp.product_id,
        p.product_name,
        COALESCE(u.unit_name, '')    AS unit,
        COALESCE(u.abbreviation, '') AS unit_abbreviation,
        cp.price_per_unit,
        cp.effective_from,
        cp.reason,
        COALESCE(usr.full_name, '—') AS changed_by_name
      FROM commodity_prices cp
      JOIN products p   ON p.id   = cp.product_id
      LEFT JOIN units u ON u.id   = p.unit_id
      LEFT JOIN users usr ON usr.id = cp.changed_by
      WHERE cp.product_id = ?
      ORDER BY cp.effective_from DESC
      LIMIT 1
    `, [productId]);

    if (rows.length === 0) {
      res.status(404).json({ message: "No price has been set for this product yet." });
      return;
    }
    res.status(200).json({ ...rows[0], price_per_unit: Number(rows[0].price_per_unit) });
  } catch (err) {
    console.error("[commodity/GET /:productId/current]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/commodity-prices/:productId/history — full price history ────────
router.get("/:productId/history", async (req: Request, res: Response) => {
  if (!requireAdminOrClerk(req, res)) return;
  const productId = parseInt(req.params.productId, 10);
  if (isNaN(productId)) { res.status(400).json({ message: "Invalid product ID." }); return; }

  try {
    const [rows] = await pool.execute<any[]>(`
      SELECT
        cp.id,
        cp.price_per_unit,
        cp.effective_from,
        cp.reason,
        COALESCE(usr.full_name, '—') AS changed_by_name
      FROM commodity_prices cp
      LEFT JOIN users usr ON usr.id = cp.changed_by
      WHERE cp.product_id = ?
      ORDER BY cp.effective_from DESC
    `, [productId]);

    res.status(200).json(rows.map((r) => ({ ...r, price_per_unit: Number(r.price_per_unit) })));
  } catch (err) {
    console.error("[commodity/GET /:productId/history]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── POST /api/commodity-prices/:productId/set-price — Admin sets new price ──
router.post("/:productId/set-price", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const productId = parseInt(req.params.productId, 10);
  if (isNaN(productId)) { res.status(400).json({ message: "Invalid product ID." }); return; }

  const parsed = setPriceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }

  const { price_per_unit, reason } = parsed.data;

  try {
    const [productRows] = await pool.execute<any[]>(
      "SELECT id, product_name, pricing_type FROM products WHERE id = ? LIMIT 1",
      [productId]
    );
    if (productRows.length === 0) {
      res.status(404).json({ message: "Product not found." });
      return;
    }
    if (productRows[0].pricing_type !== "MARKET_BASED") {
      res.status(422).json({ message: "This product is not configured as MARKET_BASED. Update the product's pricing type first." });
      return;
    }

    const [prevRows] = await pool.execute<any[]>(
      "SELECT price_per_unit FROM commodity_prices WHERE product_id = ? ORDER BY effective_from DESC LIMIT 1",
      [productId]
    );
    const previousPrice = prevRows[0]?.price_per_unit ?? null;

    const [result] = await pool.execute<any>(
      `INSERT INTO commodity_prices (product_id, price_per_unit, changed_by, reason)
       VALUES (?, ?, ?, ?)`,
      [productId, price_per_unit, req.user!.id, reason ?? null]
    );

    await logAuditEvent({
      action: "COMMODITY_PRICE_CHANGED",
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      entityType: "commodity_prices",
      entityId: result.insertId,
      previousValues: previousPrice !== null ? { price_per_unit: Number(previousPrice) } : undefined,
      newValues: { price_per_unit, product_id: productId, product_name: productRows[0].product_name },
      reason: reason ?? undefined,
    });

    res.status(201).json({
      message: "Price updated successfully.",
      id: result.insertId,
      product_id: productId,
      price_per_unit,
      previous_price: previousPrice !== null ? Number(previousPrice) : null,
    });
  } catch (err) {
    console.error("[commodity/POST /:productId/set-price]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── POST /api/commodity-prices/purchase — submit commodity purchase for approval ──
// Backend recalculates ALL monetary values. Frontend totals are ignored.
// CLERK submits: status = PENDING_APPROVAL, no inventory increase yet.
router.post("/purchase", async (req: Request, res: Response) => {
  if (!requireAdminOrClerk(req, res)) return;

  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }

  // NEW: Support both deducted_quantity (new) and deduction_per_unit (legacy)
  // If deducted_quantity is provided (>0), use it. Otherwise fall back to the old method.
  const {
    product_id, supplier_id, seller_name,
    quantity, deducted_quantity, deduction_per_unit, transaction_date, remarks,
  } = parsed.data;
  const seller_address = parsed.data.seller_address?.trim() || null;
  const seller_contact = parsed.data.seller_contact?.trim() || null;

  // Determine which deduction model to use:
  // - If deducted_quantity > 0, use new model (physical quantity deduction)
  // - Otherwise, check deduction_per_unit for legacy support
  const useNewModel = deducted_quantity > 0;
  const effectiveDeductedQty = useNewModel ? deducted_quantity : 0;
  const legacyDeductionPerUnit = deduction_per_unit || 0;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Lock and fetch product
    const [productRows] = await conn.execute<any[]>(
      "SELECT id, product_name, pricing_type, unit_id, quantity AS current_qty FROM products WHERE id = ? FOR UPDATE",
      [product_id]
    );
    if (productRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Product not found." });
      return;
    }
    const product = productRows[0];
    if (product.pricing_type !== "MARKET_BASED") {
      await conn.rollback();
      res.status(422).json({ message: "This product is not configured as MARKET_BASED." });
      return;
    }

    // 2. Fetch current reference price from DB (never trust frontend)
    const [priceRows] = await conn.execute<any[]>(
      "SELECT price_per_unit FROM commodity_prices WHERE product_id = ? ORDER BY effective_from DESC LIMIT 1",
      [product_id]
    );
    if (priceRows.length === 0) {
      await conn.rollback();
      res.status(422).json({ message: "No reference price has been set for this product. Please set a current buying price first." });
      return;
    }
    const reference_price = Number(priceRows[0].price_per_unit);

    // 3. Fetch unit snapshot
    const [unitRows] = await conn.execute<any[]>(
      "SELECT id, unit_name, abbreviation FROM units WHERE id = ? LIMIT 1",
      [product.unit_id]
    );
    const unit = unitRows[0] ?? { id: product.unit_id, unit_name: "unit", abbreviation: "unit" };

    // 4. Backend calculates all monetary values — frontend totals are ignored
    const qtyReceived = Math.max(0, Number(quantity));
    
    let payable_quantity: number;
    let deduction_amount: number;
    let total_deduction: number;
    let gross_amount: number;
    let final_amount: number;
    let final_unit_price: number; // Kept for backwards compatibility

    if (useNewModel) {
      // ─────────────────────────────────────────────────────────────────────
      // NEW MODEL: Physical quantity deduction (deducted_quantity)
      // 
      // Example: 100 kg received, 3 kg deducted → pay for 97 kg
      // Business Rule:
      //   - Deducted quantity must be >= 0
      //   - Deducted quantity must be <= quantity received
      //   - Payable quantity = quantity received - deducted quantity
      //   - Deduction amount = deducted quantity × reference price
      //   - Final amount = payable quantity × reference price
      // ─────────────────────────────────────────────────────────────────────
      
      const deductedQty = Math.max(0, effectiveDeductedQty);
      
      // Validate: deducted quantity cannot exceed received quantity
      if (deductedQty > qtyReceived) {
        await conn.rollback();
        res.status(422).json({ 
          message: `Deducted quantity (${deductedQty}) cannot exceed the quantity received (${qtyReceived}).` 
        });
        return;
      }
      
      payable_quantity = Math.round((qtyReceived - deductedQty) * 10000) / 10000;
      deduction_amount = Math.round(deductedQty * reference_price * 10000) / 10000;
      gross_amount     = Math.round(qtyReceived * reference_price * 10000) / 10000;
      final_amount     = Math.round(payable_quantity * reference_price * 10000) / 10000;
      
      // For backwards compatibility with legacy queries
      final_unit_price = reference_price;
      total_deduction  = deduction_amount;
    } else {
      // ─────────────────────────────────────────────────────────────────────
      // LEGACY MODEL: Price deduction per unit (deduction_per_unit)
      // 
      // This is kept for backwards compatibility with existing data/API calls.
      // The system now uses the new quantity-based model.
      // ─────────────────────────────────────────────────────────────────────
      
      const deduction = Math.max(0, legacyDeductionPerUnit);
      if (deduction > reference_price) {
        await conn.rollback();
        res.status(422).json({ message: "Deduction per unit cannot exceed the reference price." });
        return;
      }
      
      payable_quantity = qtyReceived; // No quantity deduction in legacy model
      deduction_amount = 0; // Not applicable in legacy model
      final_unit_price  = Math.round((reference_price - deduction) * 10000) / 10000;
      gross_amount      = Math.round(qtyReceived * reference_price * 10000) / 10000;
      total_deduction   = Math.round(qtyReceived * deduction * 10000) / 10000;
      final_amount      = Math.round(qtyReceived * final_unit_price * 10000) / 10000;
    }

    // 5. Submit for approval - status = PENDING_APPROVAL
    // NO inventory increase here - inventory only increases on Admin approval
    const purchaseStatus = "PENDING_APPROVAL" as const;

    // 6. Insert purchase record with PENDING_APPROVAL status
    // Include all new columns for physical quantity deduction model
    const [purchaseResult] = await conn.execute<any>(`
      INSERT INTO commodity_purchases
        (product_id, supplier_id, seller_name, seller_address, seller_contact,
         quantity, unit_id, unit_name,
         reference_price, 
         deducted_quantity, payable_quantity, deduction_amount,
         deduction_per_unit, final_unit_price,
         gross_amount, total_deduction, final_amount,
         payment_status,
         status, prepared_by,
         remarks, recorded_by, transaction_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      product_id,
      supplier_id ?? null,
      seller_name?.trim() || null,
      seller_address,
      seller_contact,
      quantity,
      unit.id,
      unit.unit_name,
      reference_price,
      effectiveDeductedQty,
      payable_quantity,
      deduction_amount,
      useNewModel ? 0 : legacyDeductionPerUnit,
      final_unit_price,
      gross_amount,
      total_deduction,
      final_amount,
      "UNPAID",
      purchaseStatus,
      req.user!.id,
      remarks?.trim() || null,
      req.user!.id,
      transaction_date,
    ]);

    const purchaseId: number = purchaseResult.insertId;
    await conn.commit();

    // 7. Audit log for submission
    await logAuditEvent({
      action: "COMMODITY_PURCHASE_SUBMITTED",
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      entityType: "commodity_purchases",
      entityId: purchaseId,
      newValues: {
        product_id,
        product_name: product.product_name,
        quantity,
        unit: unit.unit_name,
        reference_price,
        // New fields for physical quantity deduction
        deducted_quantity: effectiveDeductedQty,
        payable_quantity,
        deduction_amount,
        // Legacy field (for backwards compatibility)
        deduction_per_unit: useNewModel ? 0 : legacyDeductionPerUnit,
        final_unit_price,
        final_amount,
        status: purchaseStatus,
      },
    });

    res.status(201).json({
      message: "Commodity purchase submitted for approval.",
      id: purchaseId,
      product_id,
      quantity,
      // New response fields
      deducted_quantity: effectiveDeductedQty,
      payable_quantity,
      deduction_amount,
      reference_price,
      // Legacy fields for backwards compatibility
      deduction_per_unit: useNewModel ? 0 : legacyDeductionPerUnit,
      final_unit_price,
      gross_amount,
      total_deduction,
      final_amount,
      status: purchaseStatus,
      payment_status: "UNPAID",
      amount_paid: 0,
      balance_due: final_amount,
    });
  } catch (err) {
    await conn.rollback();
    console.error("[commodity/POST /purchase]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

// ─── GET /api/commodity-prices/purchases/pending — Admin pending approvals ─────
router.get("/purchases/pending", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    // First check if status column has PENDING_APPROVAL values at all
    const [countCheck] = await pool.execute<any[]>(`
      SELECT status, COUNT(*) as cnt FROM commodity_purchases GROUP BY status
    `);

    const [rows] = await pool.execute<any[]>(`
      SELECT
        cp.id,
        cp.product_id,
        p.product_name,
        p.barcode,
        cp.seller_name,
        cp.seller_address,
        cp.seller_contact,
        cp.quantity,
        cp.unit_name,
        cp.reference_price,
        -- New columns for physical quantity deduction
        cp.deducted_quantity,
        cp.payable_quantity,
        cp.deduction_amount,
        -- Legacy columns for backwards compatibility
        cp.deduction_per_unit,
        cp.final_unit_price,
        cp.gross_amount,
        cp.total_deduction,
        cp.final_amount,
        cp.remarks,
        cp.transaction_date,
        cp.created_at,
        cp.status AS approval_status,
        cp.prepared_by,
        COALESCE(u.full_name, '—') AS prepared_by_name
      FROM commodity_purchases cp
      JOIN products p ON p.id = cp.product_id
      LEFT JOIN users u ON u.id = cp.prepared_by
      WHERE cp.status = 'PENDING_APPROVAL'
      ORDER BY cp.created_at ASC
    `);

    res.status(200).json(rows.map((r) => ({
      ...r,
      quantity:           Number(r.quantity),
      // New fields
      deducted_quantity: Number(r.deducted_quantity),
      payable_quantity:  Number(r.payable_quantity),
      deduction_amount:  Number(r.deduction_amount),
      reference_price:   Number(r.reference_price),
      // Legacy fields
      deduction_per_unit: Number(r.deduction_per_unit),
      final_unit_price:   Number(r.final_unit_price),
      gross_amount:       Number(r.gross_amount),
      total_deduction:    Number(r.total_deduction),
      final_amount:       Number(r.final_amount),
    })));
  } catch (err) {
    console.error("[commodity/GET /purchases/pending]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/commodity-prices/purchases/approved — for Cashier payment ──────
router.get("/purchases/approved", async (req: Request, res: Response) => {
  if (!requireCashierOrAdmin(req, res)) return;

  const { payment_status } = req.query;
  let where = "WHERE cp.status = 'APPROVED'";
  const params: any[] = [];

  if (payment_status) {
    where += " AND cp.payment_status = ?";
    params.push(payment_status);
  }

  try {
    const [rows] = await pool.execute<any[]>(`
      SELECT
        cp.id,
        cp.product_id,
        p.product_name,
        p.barcode,
        cp.seller_name,
        cp.seller_address,
        cp.seller_contact,
        cp.quantity,
        cp.unit_name,
        cp.reference_price,
        -- New columns for physical quantity deduction
        cp.deducted_quantity,
        cp.payable_quantity,
        cp.deduction_amount,
        -- Legacy columns for backwards compatibility
        cp.deduction_per_unit,
        cp.final_unit_price,
        cp.gross_amount,
        cp.total_deduction,
        cp.final_amount,
        cp.payment_status,
        cp.amount_paid,
        cp.payment_method,
        cp.payment_reference,
        cp.paid_at,
        cp.remarks,
        cp.transaction_date,
        cp.created_at,
        cp.status AS approval_status,
        cp.approved_by,
        cp.approved_at,
        COALESCE(u.full_name, '—') AS approved_by_name
      FROM commodity_purchases cp
      JOIN products p ON p.id = cp.product_id
      LEFT JOIN users u ON u.id = cp.approved_by
      ${where}
      ORDER BY cp.approved_at DESC
    `, params);

    res.status(200).json(rows.map((r) => ({
      ...r,
      quantity:           Number(r.quantity),
      // New fields
      deducted_quantity: Number(r.deducted_quantity),
      payable_quantity:  Number(r.payable_quantity),
      deduction_amount:  Number(r.deduction_amount),
      reference_price:   Number(r.reference_price),
      // Legacy fields
      deduction_per_unit: Number(r.deduction_per_unit),
      final_unit_price:   Number(r.final_unit_price),
      gross_amount:       Number(r.gross_amount),
      total_deduction:    Number(r.total_deduction),
      final_amount:       Number(r.final_amount),
      amount_paid:        Number(r.amount_paid),
      balance_due:        Math.round((Number(r.final_amount) - Number(r.amount_paid)) * 10000) / 10000,
    })));
  } catch (err) {
    console.error("[commodity/GET /purchases/approved]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── POST /api/commodity-prices/purchases/authorize — Create + immediately approve ─
// Single atomic endpoint: creates the purchase record AND approves it in one
// transaction. Used for local manager override so the record NEVER appears as
// PENDING_APPROVAL on the admin terminal.
const authorizeSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

router.post("/purchases/authorize", async (req: Request, res: Response) => {
  // Validate manager credentials first (before touching purchase data)
  const credParsed = authorizeSchema.safeParse(req.body);
  if (!credParsed.success) {
    res.status(400).json({ message: credParsed.error.issues[0]?.message ?? "Invalid request." });
    return;
  }

  // Validate purchase payload using the same schema
  const purchaseParsed = purchaseSchema.safeParse(req.body);
  if (!purchaseParsed.success) {
    res.status(422).json({ errors: purchaseParsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }

  const { username, password } = credParsed.data;
  const {
    product_id, supplier_id, seller_name,
    quantity, deducted_quantity, deduction_per_unit, transaction_date, remarks,
  } = purchaseParsed.data;
  const seller_address = purchaseParsed.data.seller_address?.trim() || null;
  const seller_contact = purchaseParsed.data.seller_contact?.trim() || null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // ── 1. Verify manager credentials ────────────────────────────────────────
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
      res.status(403).json({ message: "Only an Admin can authorize purchase requests." });
      return;
    }

    // ── 2. Fetch and validate product ────────────────────────────────────────
    const [productRows] = await conn.execute<any[]>(
      "SELECT id, product_name, pricing_type, unit_id, quantity AS current_qty FROM products WHERE id = ? FOR UPDATE",
      [product_id]
    );
    if (productRows.length === 0) { await conn.rollback(); res.status(404).json({ message: "Product not found." }); return; }
    const product = productRows[0];
    if (product.pricing_type !== "MARKET_BASED") { await conn.rollback(); res.status(422).json({ message: "This product is not configured as MARKET_BASED." }); return; }

    const [priceRows] = await conn.execute<any[]>(
      "SELECT price_per_unit FROM commodity_prices WHERE product_id = ? ORDER BY effective_from DESC LIMIT 1",
      [product_id]
    );
    if (priceRows.length === 0) { await conn.rollback(); res.status(422).json({ message: "No reference price has been set for this product." }); return; }
    const reference_price = Number(priceRows[0].price_per_unit);

    const [unitRows] = await conn.execute<any[]>(
      "SELECT id, unit_name, abbreviation FROM units WHERE id = ? LIMIT 1",
      [product.unit_id]
    );
    const unit = unitRows[0] ?? { id: product.unit_id, unit_name: "unit", abbreviation: "unit" };

    // ── 3. Calculate amounts ──────────────────────────────────────────────────
    const useNewModel = deducted_quantity > 0;
    const effectiveDeductedQty = useNewModel ? deducted_quantity : 0;
    const legacyDeductionPerUnit = deduction_per_unit || 0;
    const qtyReceived = Math.max(0, Number(quantity));

    let payable_quantity: number, deduction_amount: number, gross_amount: number;
    let final_amount: number, final_unit_price: number, total_deduction: number;

    if (useNewModel) {
      if (effectiveDeductedQty > qtyReceived) { await conn.rollback(); res.status(422).json({ message: "Deducted quantity cannot exceed quantity received." }); return; }
      payable_quantity = Math.round((qtyReceived - effectiveDeductedQty) * 10000) / 10000;
      deduction_amount = Math.round(effectiveDeductedQty * reference_price * 10000) / 10000;
      gross_amount     = Math.round(qtyReceived * reference_price * 10000) / 10000;
      final_amount     = Math.round(payable_quantity * reference_price * 10000) / 10000;
      final_unit_price = reference_price;
      total_deduction  = deduction_amount;
    } else {
      const deduction = Math.max(0, legacyDeductionPerUnit);
      if (deduction > reference_price) { await conn.rollback(); res.status(422).json({ message: "Deduction per unit cannot exceed the reference price." }); return; }
      payable_quantity = qtyReceived;
      deduction_amount = 0;
      final_unit_price  = Math.round((reference_price - deduction) * 10000) / 10000;
      gross_amount      = Math.round(qtyReceived * reference_price * 10000) / 10000;
      total_deduction   = Math.round(qtyReceived * deduction * 10000) / 10000;
      final_amount      = Math.round(qtyReceived * final_unit_price * 10000) / 10000;
    }

    // ── 4. Insert purchase record directly as APPROVED ────────────────────────
    const [purchaseResult] = await conn.execute<any>(`
      INSERT INTO commodity_purchases
        (product_id, supplier_id, seller_name, seller_address, seller_contact,
         quantity, unit_id, unit_name,
         reference_price,
         deducted_quantity, payable_quantity, deduction_amount,
         deduction_per_unit, final_unit_price,
         gross_amount, total_deduction, final_amount,
         payment_status,
         status, prepared_by, approved_by, approved_at,
         amount_paid, paid_at, paid_by,
         remarks, recorded_by, transaction_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW(), ?, ?, ?, ?)
    `, [
      product_id, supplier_id ?? null, seller_name?.trim() || null, seller_address, seller_contact,
      quantity, unit.id, unit.unit_name, reference_price,
      effectiveDeductedQty, payable_quantity, deduction_amount,
      useNewModel ? 0 : legacyDeductionPerUnit, final_unit_price,
      gross_amount, total_deduction, final_amount,
      "PAID", "APPROVED",
      req.user!.id, manager.id,
      final_amount, manager.id,
      remarks?.trim() || null, req.user!.id, transaction_date,
    ]);

    const purchaseId: number = purchaseResult.insertId;

    // ── 5. Update product inventory ───────────────────────────────────────────
    const newQty = Math.round((Number(product.current_qty) + payable_quantity) * 1000) / 1000;
    await conn.execute("UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?", [newQty, product_id]);
    await conn.execute(`
      INSERT INTO inventory_logs
        (product_id, transaction_type, action, quantity_change, quantity, remaining_stock,
         reference, commodity_purchase_id, user_id)
      VALUES (?, 'Stock In', 'Commodity Purchase Approved', ?, ?, ?, ?, ?, ?)
    `, [product_id, payable_quantity, product.current_qty, newQty, `CP-${purchaseId}`, purchaseId, manager.id]);

    await conn.commit();

    // ── 6. Audit logs ─────────────────────────────────────────────────────────
    await logAuditEvent({
      action: "COMMODITY_PURCHASE_SUBMITTED",
      performedById: req.user!.id, performedByUsername: req.user!.username,
      entityType: "commodity_purchases", entityId: purchaseId,
      newValues: { product_id, product_name: product.product_name, quantity, reference_price, deducted_quantity: effectiveDeductedQty, payable_quantity, final_amount, status: "APPROVED" },
    });
    await logAuditEvent({
      action: "COMMODITY_PURCHASE_APPROVED_LOCAL_OVERRIDE",
      performedById: manager.id, performedByUsername: manager.username,
      entityType: "commodity_purchases", entityId: purchaseId,
      newValues: { product_name: product.product_name, quantity_added: payable_quantity, new_stock_quantity: newQty, override_method: "local_manager_override", clerk_id: req.user!.id, clerk_username: req.user!.username },
    });

    res.status(201).json({
      message: "Purchase authorized and inventory updated.",
      id: purchaseId, status: "APPROVED", new_stock_quantity: newQty,
      admin_name: manager.full_name ?? manager.username, admin_id: manager.id,
      payable_quantity, final_amount,
    });
  } catch (err) {
    await conn.rollback();
    console.error("[commodity/POST /purchases/authorize] Error:", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

// ─── POST /api/commodity-prices/purchases/:id/payment — record a payment ──────
// Records a payment event against an APPROVED commodity purchase.
// CASHIER only. Backend recalculates payment_status from total payments vs final_amount.
router.post("/purchases/:id/payment", async (req: Request, res: Response) => {
  if (!requireCashierOrAdmin(req, res)) return;

  const purchaseId = parseInt(req.params.id, 10);
  if (isNaN(purchaseId)) { res.status(400).json({ message: "Invalid purchase ID." }); return; }

  const parsed = recordPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }

  const { amount, payment_method, payment_reference, notes } = parsed.data;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock the purchase row
    const [purchaseRows] = await conn.execute<any[]>(
      "SELECT id, status, final_amount, amount_paid, payment_status, product_id FROM commodity_purchases WHERE id = ? FOR UPDATE",
      [purchaseId]
    );
    if (purchaseRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Purchase not found." });
      return;
    }
    const purchase = purchaseRows[0];

    // Must be APPROVED before payment can be recorded
    if (purchase.status !== "APPROVED") {
      await conn.rollback();
      res.status(422).json({ message: `Cannot record payment. Purchase status: ${purchase.status}` });
      return;
    }

    if (purchase.payment_status === "PAID") {
      await conn.rollback();
      res.status(422).json({ message: "This purchase has already been fully paid." });
      return;
    }

    const final_amount = Number(purchase.final_amount);
    const prev_paid    = Number(purchase.amount_paid);
    const new_total    = Math.round((prev_paid + amount) * 10000) / 10000;

    if (new_total > final_amount) {
      await conn.rollback();
      res.status(422).json({
        message: `Payment of ₱${amount.toFixed(2)} would exceed the final amount. Balance due: ₱${(final_amount - prev_paid).toFixed(2)}.`,
      });
      return;
    }

    // Derive new payment status
    let new_status: "UNPAID" | "PARTIALLY_PAID" | "PAID";
    if (new_total <= 0) {
      new_status = "UNPAID";
    } else if (new_total >= final_amount) {
      new_status = "PAID";
    } else {
      new_status = "PARTIALLY_PAID";
    }

    const prev_status = purchase.payment_status as string;

    // Insert payment event
    const [paymentResult] = await conn.execute<any>(`
      INSERT INTO commodity_purchase_payments
        (commodity_purchase_id, amount, payment_method, payment_reference, notes, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      purchaseId,
      amount,
      payment_method?.trim() || null,
      payment_reference?.trim() || null,
      notes?.trim() || null,
      req.user!.id,
    ]);

    // Update purchase payment summary
    await conn.execute(`
      UPDATE commodity_purchases
      SET amount_paid = ?,
          payment_status = ?,
          payment_method = COALESCE(?, payment_method),
          payment_reference = COALESCE(?, payment_reference),
          paid_at = NOW(),
          paid_by = ?
      WHERE id = ?
    `, [
      new_total,
      new_status,
      payment_method?.trim() || null,
      payment_reference?.trim() || null,
      req.user!.id,
      purchaseId,
    ]);

    await conn.commit();

    // Fetch product name for audit
    const [prodRows] = await pool.execute<any[]>(
      "SELECT product_name FROM products WHERE id = ? LIMIT 1",
      [purchase.product_id]
    );
    const product_name = prodRows[0]?.product_name ?? "";

    await logAuditEvent({
      action: "PAYMENT_RECORDED",
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      entityType: "commodity_purchases",
      entityId: purchaseId,
      newValues: {
        payment_event_id: paymentResult.insertId,
        amount_this_payment: amount,
        total_amount_paid: new_total,
        payment_status: new_status,
        payment_method: payment_method ?? null,
        product_name,
      },
    });

    if (prev_status !== new_status) {
      await logAuditEvent({
        action: "PAYMENT_STATUS_CHANGED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "commodity_purchases",
        entityId: purchaseId,
        previousValues: { payment_status: prev_status, amount_paid: prev_paid },
        newValues: { payment_status: new_status, amount_paid: new_total, product_name },
      });
    }

    res.status(201).json({
      message: "Payment recorded successfully.",
      purchase_id: purchaseId,
      payment_event_id: paymentResult.insertId,
      amount_this_payment: amount,
      total_amount_paid: new_total,
      balance_due: Math.round((final_amount - new_total) * 10000) / 10000,
      payment_status: new_status,
    });
  } catch (err) {
    await conn.rollback();
    console.error("[commodity/POST /purchases/:id/payment]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

// ─── GET /api/commodity-prices/purchases/:id/payments — payment history ───────
router.get("/purchases/:id/payments", async (req: Request, res: Response) => {
  if (!requireAdminOrClerk(req, res)) return;

  const purchaseId = parseInt(req.params.id, 10);
  if (isNaN(purchaseId)) { res.status(400).json({ message: "Invalid purchase ID." }); return; }

  try {
    const [rows] = await pool.execute<any[]>(`
      SELECT
        cpp.id,
        cpp.commodity_purchase_id,
        cpp.amount,
        cpp.payment_method,
        cpp.payment_reference,
        cpp.notes,
        cpp.created_at,
        COALESCE(u.full_name, '—') AS recorded_by_name
      FROM commodity_purchase_payments cpp
      LEFT JOIN users u ON u.id = cpp.recorded_by
      WHERE cpp.commodity_purchase_id = ?
      ORDER BY cpp.created_at ASC
    `, [purchaseId]);

    res.status(200).json(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
  } catch (err) {
    console.error("[commodity/GET /purchases/:id/payments]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/commodity-prices/purchases — list purchase history ──────────────
router.get("/purchases", async (req: Request, res: Response) => {
  if (!requireAdminOrClerk(req, res)) return;

  const limit  = Math.min(1000, Math.max(1, parseInt((req.query.limit  as string) || "50", 10)));
  const offset = Math.max(0, parseInt((req.query.offset as string) || "0",  10));
  const { product_id, date_from, date_to, payment_status, status } = req.query;

  let where = "WHERE 1=1";
  const params: any[] = [];

  if (product_id) {
    where += " AND cp.product_id = ?";
    params.push(parseInt(product_id as string, 10));
  }
  if (date_from) {
    where += " AND cp.transaction_date >= ?";
    params.push(date_from);
  }
  if (date_to) {
    where += " AND cp.transaction_date <= ?";
    params.push(date_to);
  }
  if (payment_status) {
    where += " AND cp.payment_status = ?";
    params.push(payment_status);
  }
  if (status) {
    where += " AND cp.status = ?";
    params.push(status);
  }

  try {
    const [rows] = await pool.execute<any[]>(`
      SELECT
        cp.id,
        cp.product_id,
        p.product_name,
        p.barcode,
        COALESCE(s.supplier_name, cp.seller_name, '—') AS seller,
        cp.seller_name,
        cp.seller_address,
        cp.seller_contact,
        cp.quantity,
        cp.unit_name,
        cp.reference_price,
        -- New columns for physical quantity deduction
        cp.deducted_quantity,
        cp.payable_quantity,
        cp.deduction_amount,
        -- Legacy columns for backwards compatibility
        cp.deduction_per_unit,
        cp.final_unit_price,
        cp.gross_amount,
        cp.total_deduction,
        cp.final_amount,
        cp.payment_status,
        cp.status AS approval_status,
        cp.amount_paid,
        cp.payment_method,
        cp.payment_reference,
        cp.paid_at,
        cp.remarks,
        cp.transaction_date,
        cp.created_at,
        cp.prepared_by,
        COALESCE(u.full_name, '—') AS recorded_by_name,
        COALESCE(prep.full_name, '—') AS prepared_by_name,
        cp.approved_by,
        cp.approved_at,
        cp.rejected_by,
        cp.rejected_at,
        cp.rejection_reason
      FROM commodity_purchases cp
      JOIN products p ON p.id = cp.product_id
      LEFT JOIN suppliers s ON s.id = cp.supplier_id
      LEFT JOIN users u ON u.id = cp.recorded_by
      LEFT JOIN users prep ON prep.id = cp.prepared_by
      ${where}
      ORDER BY cp.transaction_date DESC, cp.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `, params);

    res.status(200).json(rows.map((r) => ({
      ...r,
      quantity:           Number(r.quantity),
      // New fields
      deducted_quantity: Number(r.deducted_quantity),
      payable_quantity:  Number(r.payable_quantity),
      deduction_amount:  Number(r.deduction_amount),
      reference_price:   Number(r.reference_price),
      // Legacy fields
      deduction_per_unit: Number(r.deduction_per_unit),
      final_unit_price:   Number(r.final_unit_price),
      gross_amount:       Number(r.gross_amount),
      total_deduction:    Number(r.total_deduction),
      final_amount:       Number(r.final_amount),
      amount_paid:        Number(r.amount_paid),
      balance_due:        Math.round((Number(r.final_amount) - Number(r.amount_paid)) * 10000) / 10000,
    })));
  } catch (err) {
    console.error("[commodity/GET /purchases]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── POST /api/commodity-prices/purchases/:id/approve — Admin approves ───────
router.post("/purchases/:id/approve", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const purchaseId = parseInt(req.params.id, 10);
  if (isNaN(purchaseId)) { res.status(400).json({ message: "Invalid purchase ID." }); return; }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Lock the purchase row — including payable_quantity for correct stock increment
    const [purchaseRows] = await conn.execute<any[]>(
      "SELECT id, status, product_id, quantity, payable_quantity, deducted_quantity, prepared_by, final_amount FROM commodity_purchases WHERE id = ? FOR UPDATE",
      [purchaseId]
    );
    if (purchaseRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Purchase not found." });
      return;
    }
    const purchase = purchaseRows[0];

    // 2. Validate status is PENDING_APPROVAL
    if (purchase.status !== "PENDING_APPROVAL") {
      await conn.rollback();
      res.status(422).json({ message: `Cannot approve. Current status: ${purchase.status}` });
      return;
    }

    // 3. Prevent self-approval
    if (purchase.prepared_by === req.user!.id) {
      await conn.rollback();
      res.status(403).json({ message: "You cannot approve your own purchase request." });
      return;
    }

    // 4. Lock product row and get current quantity
    const [productRows] = await conn.execute<any[]>(
      "SELECT id, product_name, quantity AS current_qty FROM products WHERE id = ? FOR UPDATE",
      [purchase.product_id]
    );
    if (productRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Product not found." });
      return;
    }
    const product = productRows[0];

    // 5. Update purchase status to APPROVED, add approval info, and auto-mark as PAID
    const finalAmount = Number(purchase.final_amount);
    await conn.execute(`
      UPDATE commodity_purchases
      SET status = 'APPROVED',
          approved_by = ?,
          approved_at = NOW(),
          payment_status = 'PAID',
          amount_paid = ?,
          paid_at = NOW(),
          paid_by = ?
      WHERE id = ?
    `, [req.user!.id, finalAmount, req.user!.id, purchaseId]);

    // 6. Increase inventory by the PAYABLE quantity (gross quantity - deducted_quantity)
    //    Use payable_quantity if set, otherwise fall back to quantity for legacy records.
    const payableQty = Number(purchase.payable_quantity ?? null) > 0 && Number(purchase.payable_quantity) <= Number(purchase.quantity)
      ? Number(purchase.payable_quantity)
      : Number(purchase.quantity);
    const newQty = Math.round((Number(product.current_qty) + payableQty) * 1000) / 1000;
    await conn.execute(
      "UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?",
      [newQty, purchase.product_id]
    );

    // 7. Create inventory log linked to commodity_purchase
    await conn.execute(`
      INSERT INTO inventory_logs
        (product_id, transaction_type, action, quantity_change, quantity, remaining_stock,
         reference, commodity_purchase_id, user_id)
      VALUES (?, 'Stock In', 'Commodity Purchase Approved', ?, ?, ?, ?, ?, ?)
    `, [
      purchase.product_id,
      payableQty,
      product.current_qty,
      newQty,
      `CP-${purchaseId}`,
      purchaseId,
      req.user!.id,
    ]);

    await conn.commit();

    // 8. Audit log
    await logAuditEvent({
      action: "COMMODITY_PURCHASE_APPROVED",
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      entityType: "commodity_purchases",
      entityId: purchaseId,
      newValues: {
        product_id: purchase.product_id,
        product_name: product.product_name,
        quantity_received_gross: Number(purchase.quantity),
        deducted_quantity:     Number(purchase.deducted_quantity ?? 0),
        quantity_added:        payableQty,
        new_stock_quantity:    newQty,
      },
    });

    res.status(200).json({
      message: "Purchase approved. Inventory updated.",
      id: purchaseId,
      status: "APPROVED",
      new_stock_quantity: newQty,
      payable_quantity:   payableQty,
      deducted_quantity:  Number(purchase.deducted_quantity ?? 0),
    });
  } catch (err) {
    await conn.rollback();
    console.error("[commodity/POST /purchases/:id/approve]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

// ─── POST /api/commodity-prices/purchases/:id/reject — Admin rejects ─────────
const rejectSchema = z.object({
  rejection_reason: z.string().min(1, "Rejection reason is required").max(500),
});

router.post("/purchases/:id/reject", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const purchaseId = parseInt(req.params.id, 10);
  if (isNaN(purchaseId)) { res.status(400).json({ message: "Invalid purchase ID." }); return; }

  const parsed = rejectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }

  const { rejection_reason } = parsed.data;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Lock the purchase row
    const [purchaseRows] = await conn.execute<any[]>(
      "SELECT id, status, product_id, prepared_by FROM commodity_purchases WHERE id = ? FOR UPDATE",
      [purchaseId]
    );
    if (purchaseRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Purchase not found." });
      return;
    }
    const purchase = purchaseRows[0];

    // 2. Validate status is PENDING_APPROVAL
    if (purchase.status !== "PENDING_APPROVAL") {
      await conn.rollback();
      res.status(422).json({ message: `Cannot reject. Current status: ${purchase.status}` });
      return;
    }

    // 3. Prevent self-rejection (optional, but consistent with approval)
    if (purchase.prepared_by === req.user!.id) {
      await conn.rollback();
      res.status(403).json({ message: "You cannot reject your own purchase request." });
      return;
    }

    // 4. Update purchase status to REJECTED
    await conn.execute(`
      UPDATE commodity_purchases
      SET status = 'REJECTED',
          rejected_by = ?,
          rejected_at = NOW(),
          rejection_reason = ?
      WHERE id = ?
    `, [req.user!.id, rejection_reason.trim(), purchaseId]);

    await conn.commit();

    // 5. Audit log
    await logAuditEvent({
      action: "COMMODITY_PURCHASE_REJECTED",
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      entityType: "commodity_purchases",
      entityId: purchaseId,
      newValues: {
        product_id: purchase.product_id,
        rejection_reason: rejection_reason.trim(),
      },
    });

    res.status(200).json({
      message: "Purchase rejected.",
      id: purchaseId,
      status: "REJECTED",
    });
  } catch (err) {
    await conn.rollback();
    console.error("[commodity/POST /purchases/:id/reject]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

// ─── POST /api/commodity-prices/purchases/:id/local-override — Clerk Terminal ─
// Verifies admin credentials on the spot, then approves the commodity purchase
// immediately — identical logic to /purchases/:id/approve.
const localOverrideSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

router.post("/purchases/:id/local-override", async (req: Request, res: Response) => {
  const purchaseId = parseInt(req.params.id, 10);
  if (isNaN(purchaseId)) { res.status(400).json({ message: "Invalid purchase ID." }); return; }

  const parsed = localOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request." });
    return;
  }

  const { username, password } = parsed.data;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // ── 1. Verify manager credentials ────────────────────────────────────────
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
      res.status(403).json({ message: "Only an Admin can authorize purchase requests." });
      return;
    }

    // ── 2. Lock purchase row ──────────────────────────────────────────────────
    const [purchaseRows] = await conn.execute<any[]>(
      "SELECT id, status, product_id, quantity, payable_quantity, deducted_quantity, prepared_by, final_amount FROM commodity_purchases WHERE id = ? FOR UPDATE",
      [purchaseId]
    );
    if (purchaseRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Purchase not found." });
      return;
    }
    const purchase = purchaseRows[0];

    if (purchase.status !== "PENDING_APPROVAL") {
      await conn.rollback();
      res.status(422).json({ message: `Cannot approve. Current status: ${purchase.status}` });
      return;
    }

    // Prevent self-approval — admin cannot approve a record they submitted
    if (purchase.prepared_by === manager.id) {
      await conn.rollback();
      res.status(403).json({ message: "You cannot approve your own purchase request." });
      return;
    }

    // ── 3. Lock product row ───────────────────────────────────────────────────
    const [productRows] = await conn.execute<any[]>(
      "SELECT id, product_name, quantity AS current_qty FROM products WHERE id = ? FOR UPDATE",
      [purchase.product_id]
    );
    if (productRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Product not found." });
      return;
    }
    const product = productRows[0];

    // ── 4. Approve — identical to /purchases/:id/approve ─────────────────────
    const finalAmount = Number(purchase.final_amount);
    await conn.execute(`
      UPDATE commodity_purchases
      SET status = 'APPROVED', approved_by = ?, approved_at = NOW(),
          payment_status = 'PAID', amount_paid = ?, paid_at = NOW(), paid_by = ?
      WHERE id = ?
    `, [manager.id, finalAmount, manager.id, purchaseId]);

    const payableQty = Number(purchase.payable_quantity ?? null) > 0 && Number(purchase.payable_quantity) <= Number(purchase.quantity)
      ? Number(purchase.payable_quantity)
      : Number(purchase.quantity);
    const newQty = Math.round((Number(product.current_qty) + payableQty) * 1000) / 1000;
    await conn.execute(
      "UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?",
      [newQty, purchase.product_id]
    );

    await conn.execute(`
      INSERT INTO inventory_logs
        (product_id, transaction_type, action, quantity_change, quantity, remaining_stock,
         reference, commodity_purchase_id, user_id)
      VALUES (?, 'Stock In', 'Commodity Purchase Approved', ?, ?, ?, ?, ?, ?)
    `, [purchase.product_id, payableQty, product.current_qty, newQty, `CP-${purchaseId}`, purchaseId, manager.id]);

    await conn.commit();

    // ── 5. Audit log ──────────────────────────────────────────────────────────
    await logAuditEvent({
      action: "COMMODITY_PURCHASE_APPROVED_LOCAL_OVERRIDE",
      performedById: manager.id,
      performedByUsername: manager.username,
      entityType: "commodity_purchases",
      entityId: purchaseId,
      newValues: {
        product_id: purchase.product_id,
        product_name: product.product_name,
        quantity_added: payableQty,
        new_stock_quantity: newQty,
        override_method: "local_manager_override",
        clerk_id: req.user!.id,
        clerk_username: req.user!.username,
      },
    });

    res.status(200).json({
      message: "Purchase approved via manager override. Inventory updated.",
      id: purchaseId,
      status: "APPROVED",
      new_stock_quantity: newQty,
      admin_name: manager.full_name ?? manager.username,
      admin_id: manager.id,
    });
  } catch (err) {
    await conn.rollback();
    console.error("[commodity/POST /purchases/:id/local-override] Error:", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

export default router;
