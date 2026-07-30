import { Router, Request, Response } from "express";
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

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const createAdjustmentRequestSchema = z.object({
  product_id: z.number().int().positive("Product ID is required"),
  system_quantity: z.number().min(0, "System quantity must be non-negative"),
  physical_quantity: z.number().min(0, "Physical quantity must be non-negative"),
  reason: z.enum([
    "Drying/Moisture Loss",
    "Spillage",
    "Theft",
    "Processing Loss",
    "Handling Loss",
    "Warehouse Damage",
    "Inventory Miscount",
    "Other"
  ], "Reason is required"),
  remarks: z.string().max(500).optional().nullable()
}).refine((data) => {
  // Remarks required when reason is "Other"
  if (data.reason === "Other" && (!data.remarks || data.remarks.trim() === "")) {
    return false;
  }
  return true;
}, {
  message: "Remarks are required when reason is 'Other'",
  path: ["remarks"]
});

const rejectRequestSchema = z.object({
  rejection_reason: z.string().min(1, "Rejection reason is required").max(500, "Rejection reason too long")
});

// ─── POST /api/market-based-adjustments/requests ─────────────────────────────
router.post("/requests", async (req: Request, res: Response) => {
  if (!requireAdminOrClerk(req, res)) return;

  const parsed = createAdjustmentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }

  const { product_id, system_quantity, physical_quantity, reason, remarks } = parsed.data;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Validate product exists and is Market-Based
    const [productRows] = await conn.execute<any[]>(
      `SELECT id, product_name, pricing_type, status, quantity 
       FROM products WHERE id = ? FOR UPDATE`,
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
      res.status(422).json({ message: "Only Market-Based products require adjustment requests." });
      return;
    }

    if (product.status !== "Active") {
      await conn.rollback();
      res.status(422).json({ message: "Product is not active." });
      return;
    }

    // Generate reference: MBAR-YYYYMMDD-NNNNNN
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const [seqRows] = await conn.execute<any[]>(
      `SELECT id, current_number FROM invoice_sequences WHERE prefix = 'MBAR' LIMIT 1 FOR UPDATE`
    );

    if (!seqRows[0]) {
      await conn.rollback();
      res.status(500).json({ message: "MBAR sequence not found. Run migration 025." });
      return;
    }

    const nextSeq = (seqRows[0].current_number as number) + 1;
    await conn.execute(
      `UPDATE invoice_sequences SET current_number = ?, updated_at = NOW() WHERE id = ?`,
      [nextSeq, seqRows[0].id]
    );

    const reference = `MBAR-${dateStr}-${String(nextSeq).padStart(6, "0")}`;

    // Insert adjustment request
    const [result] = await conn.execute<any>(
      `INSERT INTO market_based_adjustment_requests
         (product_id, system_quantity, physical_quantity, reason, remarks, prepared_by, reference)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [product_id, system_quantity, physical_quantity, reason, remarks?.trim() || null, req.user!.id, reference]
    );

    const requestId = result.insertId;

    await conn.commit();

    // Audit log
    await logAuditEvent({
      action: "MBAR_ADJUSTMENT_REQUESTED",
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      entityType: "market_based_adjustment_requests",
      entityId: requestId,
      newValues: {
        product_id,
        product_name: product.product_name,
        system_quantity,
        physical_quantity,
        difference: physical_quantity - system_quantity,
        reason,
        remarks,
        reference
      },
    });

    res.status(201).json({
      id: requestId,
      product_id,
      product_name: product.product_name,
      system_quantity,
      physical_quantity,
      difference: physical_quantity - system_quantity,
      reason,
      remarks,
      prepared_by: req.user!.id,
      prepared_by_name: req.user!.username,
      prepared_at: new Date().toISOString(),
      status: "PENDING_APPROVAL",
      reference
    });
  } catch (err) {
    await conn.rollback();
    console.error("[marketBasedAdjustments/POST /requests]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

// ─── GET /api/market-based-adjustments/requests ──────────────────────────────
router.get("/requests", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { status, product_id, prepared_by, date_from, date_to, limit, offset } = req.query;

  let where = "WHERE 1=1";
  const params: any[] = [];

  if (status && status !== "all") {
    where += " AND mbar.status = ?";
    params.push(status);
  }
  if (product_id) {
    where += " AND mbar.product_id = ?";
    params.push(parseInt(product_id as string, 10));
  }
  if (prepared_by) {
    where += " AND mbar.prepared_by = ?";
    params.push(parseInt(prepared_by as string, 10));
  }
  if (date_from) {
    where += " AND mbar.prepared_at >= ?";
    params.push(date_from);
  }
  if (date_to) {
    where += " AND mbar.prepared_at <= ?";
    params.push(date_to);
  }

  const limitVal = Math.min(100, Math.max(1, parseInt((limit as string) || "50", 10)));
  const offsetVal = Math.max(0, parseInt((offset as string) || "0", 10));

  try {
    const [rows] = await pool.execute<any[]>(`
      SELECT
        mbar.id,
        mbar.product_id,
        p.product_name,
        p.barcode,
        mbar.system_quantity,
        mbar.physical_quantity,
        mbar.difference,
        mbar.reason,
        mbar.remarks,
        mbar.prepared_by,
        COALESCE(u1.full_name, '—') AS prepared_by_name,
        mbar.prepared_at,
        mbar.status,
        mbar.approved_by,
        COALESCE(u2.full_name, '—') AS approved_by_name,
        mbar.approved_at,
        mbar.rejection_reason,
        mbar.reference
      FROM market_based_adjustment_requests mbar
      JOIN products p ON p.id = mbar.product_id
      LEFT JOIN users u1 ON u1.id = mbar.prepared_by
      LEFT JOIN users u2 ON u2.id = mbar.approved_by
      ${where}
      ORDER BY mbar.prepared_at DESC
      LIMIT ${limitVal} OFFSET ${offsetVal}
    `, params);

    res.status(200).json(rows.map((r: any) => ({
      ...r,
      system_quantity: Number(r.system_quantity),
      physical_quantity: Number(r.physical_quantity),
      difference: Number(r.difference)
    })));
  } catch (err) {
    console.error("[marketBasedAdjustments/GET /requests]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/market-based-adjustments/requests/:id ─────────────────────────
router.get("/requests/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid request ID." }); return; }

  try {
    const [rows] = await pool.execute<any[]>(`
      SELECT
        mbar.id,
        mbar.product_id,
        p.product_name,
        p.barcode,
        p.pricing_type,
        p.quantity_type,
        COALESCE(u.unit_name, '') AS unit,
        COALESCE(u.abbreviation, '') AS unit_abbreviation,
        mbar.system_quantity,
        mbar.physical_quantity,
        mbar.difference,
        mbar.reason,
        mbar.remarks,
        mbar.prepared_by,
        COALESCE(u1.full_name, '—') AS prepared_by_name,
        mbar.prepared_at,
        mbar.status,
        mbar.approved_by,
        COALESCE(u2.full_name, '—') AS approved_by_name,
        mbar.approved_at,
        mbar.rejection_reason,
        mbar.reference
      FROM market_based_adjustment_requests mbar
      JOIN products p ON p.id = mbar.product_id
      LEFT JOIN units u ON u.id = p.unit_id
      LEFT JOIN users u1 ON u1.id = mbar.prepared_by
      LEFT JOIN users u2 ON u2.id = mbar.approved_by
      WHERE mbar.id = ?
    `, [id]);

    if (rows.length === 0) {
      res.status(404).json({ message: "Adjustment request not found." });
      return;
    }

    const row = rows[0];
    res.status(200).json({
      ...row,
      system_quantity: Number(row.system_quantity),
      physical_quantity: Number(row.physical_quantity),
      difference: Number(row.difference)
    });
  } catch (err) {
    console.error("[marketBasedAdjustments/GET /requests/:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── POST /api/market-based-adjustments/requests/:id/approve ────────────────
router.post("/requests/:id/approve", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid request ID." }); return; }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Get request details
    const [requestRows] = await conn.execute<any[]>(
      `SELECT * FROM market_based_adjustment_requests WHERE id = ? FOR UPDATE`,
      [id]
    );

    if (requestRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Adjustment request not found." });
      return;
    }

    const request = requestRows[0];

    if (request.status !== "PENDING_APPROVAL") {
      await conn.rollback();
      res.status(422).json({ message: "Request can only be approved when in PENDING_APPROVAL status." });
      return;
    }

    // Lock and update product
    const [productRows] = await conn.execute<any[]>(
      `SELECT id, quantity, product_name FROM products WHERE id = ? FOR UPDATE`,
      [request.product_id]
    );

    if (productRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Product not found." });
      return;
    }

    const product = productRows[0];
    const newQuantity = Number(request.physical_quantity);

    // Update product quantity
    await conn.execute(
      "UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?",
      [newQuantity, product.id]
    );

    // Create inventory log
    await conn.execute(`
      INSERT INTO inventory_logs
        (product_id, transaction_type, action, quantity_change, quantity, remaining_stock, reference, user_id)
      VALUES (?, 'Adjustment', 'Market-Based Adjustment', ?, ?, ?, ?, ?)
    `, [
      request.product_id,
      request.difference,
      product.quantity,
      newQuantity,
      request.reference,
      req.user!.id,
    ]);

    // Update request status
    await conn.execute(
      `UPDATE market_based_adjustment_requests
       SET status = 'APPROVED', approved_by = ?, approved_at = NOW()
       WHERE id = ?`,
      [req.user!.id, id]
    );

    await conn.commit();

    // Audit log
    await logAuditEvent({
      action: "MBAR_ADJUSTMENT_APPROVED",
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      entityType: "market_based_adjustment_requests",
      entityId: id,
      previousValues: {
        system_quantity: request.system_quantity,
        physical_quantity: request.physical_quantity,
        difference: request.difference
      },
      newValues: {
        new_quantity: newQuantity,
        approved_by: req.user!.username
      },
    });

    res.status(200).json({
      message: "Adjustment approved and inventory updated",
      new_quantity: newQuantity,
      reference: request.reference
    });
  } catch (err) {
    await conn.rollback();
    console.error("[marketBasedAdjustments/POST /requests/:id/approve]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

// ─── POST /api/market-based-adjustments/requests/:id/reject ─────────────────
router.post("/requests/:id/reject", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid request ID." }); return; }

  const parsed = rejectRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }

  const { rejection_reason } = parsed.data;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Get request details
    const [requestRows] = await conn.execute<any[]>(
      `SELECT * FROM market_based_adjustment_requests WHERE id = ? FOR UPDATE`,
      [id]
    );

    if (requestRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Adjustment request not found." });
      return;
    }

    const request = requestRows[0];

    if (request.status !== "PENDING_APPROVAL") {
      await conn.rollback();
      res.status(422).json({ message: "Request can only be rejected when in PENDING_APPROVAL status." });
      return;
    }

    // Update request status
    await conn.execute(
      `UPDATE market_based_adjustment_requests
       SET status = 'REJECTED', approved_by = ?, approved_at = NOW(), rejection_reason = ?
       WHERE id = ?`,
      [req.user!.id, rejection_reason, id]
    );

    await conn.commit();

    // Audit log
    await logAuditEvent({
      action: "MBAR_ADJUSTMENT_REJECTED",
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      entityType: "market_based_adjustment_requests",
      entityId: id,
      newValues: {
        rejection_reason
      },
    });

    res.status(200).json({
      message: "Adjustment request rejected",
      reference: request.reference
    });
  } catch (err) {
    await conn.rollback();
    console.error("[marketBasedAdjustments/POST /requests/:id/reject]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

// ─── GET /api/market-based-adjustments/history ───────────────────────────────
router.get("/history", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const { product_id, prepared_by, status, reason, date_from, date_to, limit, offset } = req.query;

  let where = "WHERE 1=1";
  const params: any[] = [];

  if (product_id) {
    where += " AND mbar.product_id = ?";
    params.push(parseInt(product_id as string, 10));
  }
  if (prepared_by) {
    where += " AND mbar.prepared_by = ?";
    params.push(parseInt(prepared_by as string, 10));
  }
  if (status && status !== "all") {
    where += " AND mbar.status = ?";
    params.push(status);
  }
  if (reason && reason !== "all") {
    where += " AND mbar.reason = ?";
    params.push(reason);
  }
  if (date_from) {
    where += " AND mbar.prepared_at >= ?";
    params.push(date_from);
  }
  if (date_to) {
    where += " AND mbar.prepared_at <= ?";
    params.push(date_to);
  }

  const limitVal = Math.min(100, Math.max(1, parseInt((limit as string) || "50", 10)));
  const offsetVal = Math.max(0, parseInt((offset as string) || "0", 10));

  try {
    const [rows] = await pool.execute<any[]>(`
      SELECT
        mbar.id,
        mbar.product_id,
        p.product_name,
        p.barcode,
        mbar.system_quantity,
        mbar.physical_quantity,
        mbar.difference,
        mbar.reason,
        mbar.remarks,
        mbar.prepared_by,
        COALESCE(u1.full_name, '—') AS prepared_by_name,
        mbar.prepared_at,
        mbar.status,
        mbar.approved_by,
        COALESCE(u2.full_name, '—') AS approved_by_name,
        mbar.approved_at,
        mbar.rejection_reason,
        mbar.reference
      FROM market_based_adjustment_requests mbar
      JOIN products p ON p.id = mbar.product_id
      LEFT JOIN users u1 ON u1.id = mbar.prepared_by
      LEFT JOIN users u2 ON u2.id = mbar.approved_by
      ${where}
      ORDER BY mbar.prepared_at DESC
      LIMIT ${limitVal} OFFSET ${offsetVal}
    `, params);

    res.status(200).json(rows.map((r: any) => ({
      ...r,
      system_quantity: Number(r.system_quantity),
      physical_quantity: Number(r.physical_quantity),
      difference: Number(r.difference)
    })));
  } catch (err) {
    console.error("[marketBasedAdjustments/GET /history]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/market-based-adjustments/pending-count ─────────────────────────
router.get("/pending-count", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT COUNT(*) AS count FROM market_based_adjustment_requests WHERE status = 'PENDING_APPROVAL'`
    );
    res.status(200).json({ count: rows[0].count });
  } catch (err) {
    console.error("[marketBasedAdjustments/GET /pending-count]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

export default router;
