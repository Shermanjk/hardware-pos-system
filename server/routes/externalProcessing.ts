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

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const createCompanySchema = z.object({
  name:    z.string().min(1, "Company name is required").max(200),
  address: z.string().max(500).optional().nullable(),
  contact: z.string().max(100).optional().nullable(),
});

const recordDeliverySchema = z.object({
  product_id:      z.number().int().positive("Product is required"),
  quantity:        z.number().positive("Quantity must be greater than 0"),
  company_id:      z.number().int().positive().optional().nullable().default(null),
  company_name:    z.string().min(1).max(200).optional(),
  delivery_date:   z.string().min(1, "Delivery date is required"),
  delivered_by:    z.string().max(200).optional().nullable(),
  remarks:         z.string().max(500).optional().nullable(),
}).refine((d) => d.company_id || d.company_name?.trim(), {
  message: "Processing company is required",
  path: ["company_name"],
});

// ─── GET /api/external-processing/companies — list active companies ──────────
router.get("/companies", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT id, name, address, contact, is_active, created_at
       FROM external_processing_companies
       WHERE is_active = 1
       ORDER BY name ASC`
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error("[externalProcessing/GET /companies]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/external-processing/companies/all — all companies (admin) ──────
router.get("/companies/all", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT id, name, address, contact, is_active, created_at
       FROM external_processing_companies
       ORDER BY is_active DESC, name ASC`
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error("[externalProcessing/GET /companies/all]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── POST /api/external-processing/companies — create company ─────────────────
router.post("/companies", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const parsed = createCompanySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }

  const { name, address, contact } = parsed.data;

  try {
    // Check for duplicate name
    const [existing] = await pool.execute<any[]>(
      "SELECT id FROM external_processing_companies WHERE name = ? LIMIT 1",
      [name.trim()]
    );
    if (existing.length > 0) {
      res.status(409).json({ message: "A company with this name already exists." });
      return;
    }

    const [result] = await pool.execute<any>(
      `INSERT INTO external_processing_companies (name, address, contact)
       VALUES (?, ?, ?)`,
      [name.trim(), address?.trim() || null, contact?.trim() || null]
    );

    await logAuditEvent({
      action: "EP_COMPANY_CREATED",
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      entityType: "external_processing_companies",
      entityId: result.insertId,
      newValues: { name, address, contact },
    });

    res.status(201).json({
      id: result.insertId,
      name: name.trim(),
      address: address?.trim() || null,
      contact: contact?.trim() || null,
      is_active: 1,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[externalProcessing/POST /companies]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── PUT /api/external-processing/companies/:id — edit company ──────────────
router.put("/companies/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid company ID." }); return; }

  const parsed = createCompanySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }

  const { name, address, contact } = parsed.data;

  try {
    const [existing] = await pool.execute<any[]>(
      "SELECT id FROM external_processing_companies WHERE id = ? LIMIT 1", [id]
    );
    if (existing.length === 0) { res.status(404).json({ message: "Company not found." }); return; }

    const [dup] = await pool.execute<any[]>(
      "SELECT id FROM external_processing_companies WHERE name = ? AND id != ? LIMIT 1",
      [name.trim(), id]
    );
    if (dup.length > 0) { res.status(409).json({ message: "Another company with this name already exists." }); return; }

    await pool.execute(
      "UPDATE external_processing_companies SET name = ?, address = ?, contact = ? WHERE id = ?",
      [name.trim(), address?.trim() || null, contact?.trim() || null, id]
    );

    await logAuditEvent({
      action: "EP_COMPANY_UPDATED",
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      entityType: "external_processing_companies",
      entityId: id,
      newValues: { name, address, contact },
    });

    res.status(200).json({ id, name: name.trim(), address: address?.trim() || null, contact: contact?.trim() || null });
  } catch (err) {
    console.error("[externalProcessing/PUT /companies/:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── DELETE /api/external-processing/companies/:id — soft-deactivate ─────────
router.delete("/companies/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid company ID." }); return; }

  try {
    const [existing] = await pool.execute<any[]>(
      "SELECT id, name FROM external_processing_companies WHERE id = ? LIMIT 1", [id]
    );
    if (existing.length === 0) { res.status(404).json({ message: "Company not found." }); return; }

    const [deliveries] = await pool.execute<any[]>(
      "SELECT COUNT(*) AS cnt FROM external_processing_deliveries WHERE company_id = ?", [id]
    );
    if (deliveries[0].cnt > 0) {
      // Soft-delete: deactivate so history is preserved
      await pool.execute(
        "UPDATE external_processing_companies SET is_active = 0 WHERE id = ?", [id]
      );
      await logAuditEvent({
        action: "EP_COMPANY_DEACTIVATED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "external_processing_companies",
        entityId: id,
        newValues: { is_active: 0 },
      });
      res.status(200).json({ message: "Company deactivated (has existing deliveries, cannot be permanently deleted)." });
    } else {
      await pool.execute("DELETE FROM external_processing_companies WHERE id = ?", [id]);
      await logAuditEvent({
        action: "EP_COMPANY_DELETED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "external_processing_companies",
        entityId: id,
        newValues: { deleted: true },
      });
      res.status(200).json({ message: "Company deleted." });
    }
  } catch (err) {
    console.error("[externalProcessing/DELETE /companies/:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── POST /api/external-processing/deliveries — record a delivery ────────────
router.post("/deliveries", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const parsed = recordDeliverySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }

  const { product_id, quantity, delivery_date, delivered_by, remarks } = parsed.data;
  let { company_id } = parsed.data;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 0. Resolve company — upsert by name if company_name provided
    if (!company_id && parsed.data.company_name) {
      const name = parsed.data.company_name.trim();
      const [existing] = await conn.execute<any[]>(
        "SELECT id FROM external_processing_companies WHERE name = ? LIMIT 1",
        [name]
      );
      if (existing.length > 0) {
        company_id = existing[0].id;
      } else {
        const [ins] = await conn.execute<any>(
          "INSERT INTO external_processing_companies (name) VALUES (?)",
          [name]
        );
        company_id = ins.insertId;
      }
    }

    // 1. Lock and validate product
    const [productRows] = await conn.execute<any[]>(
      `SELECT id, product_name, pricing_type, product_usage, quantity AS available_stock
       FROM products WHERE id = ? FOR UPDATE`,
      [product_id]
    );

    if (productRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Product not found." });
      return;
    }

    const product = productRows[0];

    // Validate product is active (status Active)
    const [statusCheck] = await conn.execute<any[]>(
      "SELECT status FROM products WHERE id = ?",
      [product_id]
    );
    if (statusCheck[0]?.status !== "Active") {
      await conn.rollback();
      res.status(422).json({ message: "Product is not active." });
      return;
    }

    // Validate product is eligible for external processing delivery
    // Must be MARKET_BASED pricing and RAW_MATERIAL_COMMODITY or BOTH usage
    if (product.pricing_type !== "MARKET_BASED") {
      await conn.rollback();
      res.status(422).json({ message: "Only market-based products are eligible for external processing delivery." });
      return;
    }

    if (product.product_usage === "RETAIL_PRODUCT") {
      await conn.rollback();
      res.status(422).json({ message: "This product is not configured as a raw material / commodity and is not eligible for external processing delivery." });
      return;
    }

    // 2. Validate company exists
    const [companyRows] = await conn.execute<any[]>(
      "SELECT id, name FROM external_processing_companies WHERE id = ?",
      [company_id!]
    );
    if (companyRows.length === 0) {
      await conn.rollback();
      res.status(422).json({ message: "Processing company not found." });
      return;
    }
    const company = companyRows[0];

    // 3. Validate quantity
    if (quantity <= 0) {
      await conn.rollback();
      res.status(422).json({ message: "Quantity must be greater than zero." });
      return;
    }

    const availableStock = Number(product.available_stock);
    if (quantity > availableStock) {
      await conn.rollback();
      res.status(422).json({
        message: `Insufficient stock. Available: ${availableStock} ${product.product_name}. Requested: ${quantity}.`,
        available_stock: availableStock,
        requested: quantity,
      });
      return;
    }

    // 4. Generate delivery reference: EPD-YYYY-NNNNNN
    const year = delivery_date.slice(0, 4);
    const [seqRows] = await conn.execute<any[]>(
      `SELECT id, current_number FROM invoice_sequences WHERE prefix = 'EPD' LIMIT 1 FOR UPDATE`
    );
    let deliveryRef: string;
    if (seqRows[0]) {
      const nextSeq = (seqRows[0].current_number as number) + 1;
      await conn.execute(
        `UPDATE invoice_sequences SET current_number = ?, updated_at = NOW() WHERE id = ?`,
        [nextSeq, seqRows[0].id]
      );
      deliveryRef = `EPD-${year}-${String(nextSeq).padStart(6, "0")}`;
    } else {
      // Fallback: use timestamp-based reference if sequence not configured
      deliveryRef = `EPD-${year}-${String(Date.now()).slice(-6)}`;
    }

    // 5. Deduct quantity from products
    const newQuantity = Math.round((availableStock - quantity) * 1000) / 1000;
    await conn.execute(
      "UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?",
      [newQuantity, product_id]
    );

    // 6. Insert delivery record
    const [deliveryResult] = await conn.execute<any>(
      `INSERT INTO external_processing_deliveries
         (delivery_reference, product_id, quantity, company_id, delivery_date, delivered_by, remarks, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        deliveryRef,
        product_id,
        quantity,
        company_id!,
        delivery_date,
        delivered_by?.trim() || null,
        remarks?.trim() || null,
        req.user!.id,
      ]
    );

    const deliveryId: number = deliveryResult.insertId;

    // 7. Create inventory log
    await conn.execute(`
      INSERT INTO inventory_logs
        (product_id, transaction_type, action, quantity_change, quantity, remaining_stock, reference, user_id)
      VALUES (?, 'Adjustment', 'External Processing Delivery', ?, ?, ?, ?, ?)
    `, [
      product_id,
      -quantity,                     // quantity_change (negative = deduction)
      availableStock,                // quantity (previous stock)
      newQuantity,                   // remaining_stock
      deliveryRef,                   // reference
      req.user!.id,
    ]);

    await conn.commit();

    // 8. Audit log
    await logAuditEvent({
      action: "EP_DELIVERY_RECORDED",
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      entityType: "external_processing_deliveries",
      entityId: deliveryId,
      newValues: {
        delivery_reference: deliveryRef,
        product_id,
        product_name: product.product_name,
        quantity,
        company: company.name,
        delivery_date,
        previous_stock: availableStock,
        new_stock: newQuantity,
      },
    });

    res.status(201).json({
      message: "External processing delivery recorded successfully.",
      id: deliveryId,
      delivery_reference: deliveryRef,
      product_id,
      product_name: product.product_name,
      quantity,
      company: company.name,
      delivery_date,
      delivered_by: delivered_by?.trim() || null,
      remarks: remarks?.trim() || null,
      previous_stock: availableStock,
      remaining_stock: newQuantity,
    });
  } catch (err) {
    await conn.rollback();
    console.error("[externalProcessing/POST /deliveries]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

// ─── GET /api/external-processing/deliveries — list deliveries ───────────────
router.get("/deliveries", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const limit  = Math.max(1, parseInt((req.query.limit  as string) || "50",  10));
  const offset = Math.max(0, parseInt((req.query.offset as string) || "0",   10));
  const { product_id, company_id, date_from, date_to, search } = req.query;

  let where = "WHERE 1=1";
  const params: any[] = [];

  if (product_id) {
    where += " AND epd.product_id = ?";
    params.push(parseInt(product_id as string, 10));
  }
  if (company_id) {
    where += " AND epd.company_id = ?";
    params.push(parseInt(company_id as string, 10));
  }
  if (date_from) {
    where += " AND epd.delivery_date >= ?";
    params.push(date_from);
  }
  if (date_to) {
    where += " AND epd.delivery_date <= ?";
    params.push(date_to);
  }
  if (search) {
    where += " AND (epd.delivery_reference LIKE ? OR epc.name LIKE ? OR p.product_name LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  try {
    const [rows] = await pool.execute<any[]>(`
      SELECT
        epd.id,
        epd.delivery_reference,
        epd.product_id,
        p.product_name,
        COALESCE(u.unit_name, '')      AS unit,
        COALESCE(u.abbreviation, '')   AS unit_abbreviation,
        epd.quantity,
        epd.company_id,
        epc.name                       AS company_name,
        epd.delivery_date,
        epd.delivered_by,
        epd.remarks,
        epd.created_at,
        COALESCE(usr.full_name, '—')   AS recorded_by_name
      FROM external_processing_deliveries epd
      JOIN products p  ON p.id  = epd.product_id
      JOIN external_processing_companies epc ON epc.id = epd.company_id
      LEFT JOIN units u ON u.id = p.unit_id
      LEFT JOIN users usr ON usr.id = epd.recorded_by
      ${where}
      ORDER BY epd.delivery_date DESC, epd.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `, params);

    res.status(200).json(rows.map((r: any) => ({
      ...r,
      quantity: Number(r.quantity),
    })));
  } catch (err) {
    console.error("[externalProcessing/GET /deliveries]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/external-processing/deliveries/:id — single delivery detail ───
router.get("/deliveries/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid delivery ID." }); return; }

  try {
    const [rows] = await pool.execute<any[]>(`
      SELECT
        epd.id,
        epd.delivery_reference,
        epd.product_id,
        p.product_name,
        COALESCE(u.unit_name, '')      AS unit,
        COALESCE(u.abbreviation, '')   AS unit_abbreviation,
        epd.quantity,
        epd.company_id,
        epc.name                       AS company_name,
        epc.address                    AS company_address,
        epd.delivery_date,
        epd.delivered_by,
        epd.remarks,
        epd.created_at,
        COALESCE(usr.full_name, '—')   AS recorded_by_name
      FROM external_processing_deliveries epd
      JOIN products p  ON p.id  = epd.product_id
      JOIN external_processing_companies epc ON epc.id = epd.company_id
      LEFT JOIN units u ON u.id = p.unit_id
      LEFT JOIN users usr ON usr.id = epd.recorded_by
      WHERE epd.id = ?
    `, [id]);

    if (rows.length === 0) {
      res.status(404).json({ message: "Delivery record not found." });
      return;
    }

    res.status(200).json({
      ...rows[0],
      quantity: Number(rows[0].quantity),
    });
  } catch (err) {
    console.error("[externalProcessing/GET /deliveries/:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

export default router;