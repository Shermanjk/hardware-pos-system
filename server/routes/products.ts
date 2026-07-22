import { Router, Request, Response } from "express";
import { z } from "zod";
import { PoolConnection } from "mysql2/promise";
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

// ─── Columns returned in product responses ────────────────────────────────────
const PRODUCT_COLS = `
  p.id,
  p.barcode,
  p.barcode_source,
  p.supplier_barcode,
  p.product_name,
  p.description,
  p.category_id,
  COALESCE(c.category_name, '')  AS category,
  p.supplier_id,
  COALESCE(s.supplier_name, '')  AS supplier,
  p.unit_id,
  COALESCE(u.unit_name, '')      AS unit,
  COALESCE(u.abbreviation, '')   AS unit_abbreviation,
  p.cost_price,
  p.selling_price,
  p.quantity,
  p.reorder_level,
  p.image,
  p.status,
  p.is_returnable,
  p.damaged_stock,
  p.tax_type,
  p.created_at,
  p.updated_at
`;

// ─── Zod schemas ──────────────────────────────────────────────────────────────
const TAX_TYPES = ["VATABLE", "VAT_EXEMPT", "ZERO_RATED", "NON_TAXABLE"] as const;

const productSchema = z.object({
  barcode:          z.string().min(1, "Barcode is required"),
  barcode_source:   z.enum(["manufacturer", "store"]),
  supplier_barcode: z.string().optional().nullable(),
  product_name:     z.string().min(1, "Product name is required"),
  description:      z.string().optional().nullable(),
  category_id:      z.number().int().positive("Category is required"),
  supplier_id:      z.number().int().positive().optional().nullable(),
  unit_id:          z.number().int().positive("Unit is required"),
  cost_price:       z.number().min(0, "Cost price must be 0 or greater"),
  selling_price:    z.number().min(0, "Selling price must be 0 or greater"),
  reorder_level:    z.number().int().min(0, "Reorder level must be 0 or greater"),
  is_returnable:    z.boolean().optional().default(true),
  status:           z.enum(["Active", "Inactive"]).optional().default("Active"),
  tax_type:         z.enum(TAX_TYPES).optional().default("VATABLE"),
});

const updateProductSchema = productSchema.partial();

// ─── Barcode auto-generation ──────────────────────────────────────────────────
const STORE_BARCODE_START = 1;
const STORE_BARCODE_PAD   = 4;

async function generateBarcode(conn: PoolConnection): Promise<string> {
  const [rows] = await conn.execute<any[]>(
    `SELECT barcode FROM products WHERE barcode_source = 'store' ORDER BY CAST(barcode AS UNSIGNED) DESC LIMIT 1`
  );
  if ((rows as any[]).length === 0) return String(STORE_BARCODE_START).padStart(STORE_BARCODE_PAD, "0");
  const last = parseInt((rows as any[])[0].barcode as string, 10);
  return String(isNaN(last) ? STORE_BARCODE_START : last + 1).padStart(STORE_BARCODE_PAD, "0");
}

// ─── GET /api/products ────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  try {
    const { search, category_id, supplier_id, status } = req.query;

    let where = "WHERE 1=1";
    const params: any[] = [];

    if (search) {
      where += " AND (p.product_name LIKE ? OR p.barcode LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category_id) {
      where += " AND p.category_id = ?";
      params.push(Number(category_id));
    }
    if (supplier_id) {
      where += " AND p.supplier_id = ?";
      params.push(Number(supplier_id));
    }
    if (status && status !== "all") {
      // status filter maps to stock level derived at query time
      switch (status) {
        case "In Stock":
          where += " AND p.quantity > p.reorder_level";
          break;
        case "Low Stock":
          where += " AND p.quantity > FLOOR(p.reorder_level * 0.5) AND p.quantity <= p.reorder_level";
          break;
        case "Critical":
          where += " AND p.quantity > 0 AND p.quantity <= FLOOR(p.reorder_level * 0.5)";
          break;
        case "Out of Stock":
          where += " AND p.quantity = 0";
          break;
      }
    }

    const [rows] = await pool.execute<any[]>(
      `SELECT ${PRODUCT_COLS}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
       LEFT JOIN units      u ON u.id = p.unit_id
       ${where}
       ORDER BY p.product_name ASC`,
      params
    );

    res.status(200).json(rows);
  } catch (err) {
    console.error("[products/GET /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/products/lookup — cashier product search ───────────────────────
// Returns lightweight rows matched by exact barcode OR partial name
router.get("/lookup", async (req: Request, res: Response) => {
  const q = (req.query.q as string ?? "").trim();
  if (!q) { res.status(200).json([]); return; }

  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT
         p.id,
         p.barcode,
         p.product_name,
         p.selling_price,
         p.quantity,
         COALESCE(u.unit_name, '')      AS unit,
         COALESCE(u.abbreviation, '')   AS unit_abbreviation,
         p.is_returnable,
         p.tax_type
       FROM products p
       LEFT JOIN units u ON u.id = p.unit_id
       WHERE p.status = 'Active'
         AND (p.barcode = ? OR p.barcode LIKE ? OR p.product_name LIKE ?)
       ORDER BY
         CASE WHEN p.barcode = ? THEN 0 ELSE 1 END,
         p.product_name ASC
       LIMIT 10`,
      [q, `%${q}%`, `%${q}%`, q]
    );
    res.status(200).json(
      (rows as any[]).map((r) => ({
        ...r,
        selling_price: Number(r.selling_price),
        quantity: Number(r.quantity),
      }))
    );
  } catch (err) {
    console.error("[products/GET /lookup]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── GET /api/products/next-barcode ──────────────────────────────────────────
router.get("/next-barcode", async (_req: Request, res: Response) => {
  const conn = await pool.getConnection();
  try {
    const barcode = await generateBarcode(conn);
    res.status(200).json({ barcode });
  } catch (err) {
    console.error("[products/GET /next-barcode]", err);
    res.status(500).json({ message: "Could not generate barcode." });
  } finally {
    conn.release();
  }
});

// ─── GET /api/products/:id ────────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid product ID." }); return; }

  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT ${PRODUCT_COLS}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
       LEFT JOIN units      u ON u.id = p.unit_id
       WHERE p.id = ?`,
      [id]
    );
    if ((rows as any[]).length === 0) {
      res.status(404).json({ message: "Product not found." });
      return;
    }
    res.status(200).json((rows as any[])[0]);
  } catch (err) {
    console.error("[products/GET /:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── POST /api/products ───────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }

  const {
    barcode, barcode_source, supplier_barcode, product_name, description,
    category_id, supplier_id, unit_id,
    cost_price, selling_price, reorder_level,
    is_returnable, status, tax_type,
  } = parsed.data;

  const conn = await pool.getConnection();
  try {
    // Duplicate barcode check
    const [existing] = await conn.execute<any[]>(
      "SELECT id FROM products WHERE barcode = ? LIMIT 1",
      [barcode]
    );
    if ((existing as any[]).length > 0) {
      res.status(409).json({ message: "Barcode already exists. Please scan or enter another barcode." });
      return;
    }

    const [result] = await conn.execute<any>(
      `INSERT INTO products
         (barcode, barcode_source, supplier_barcode, product_name, description,
          category_id, supplier_id, unit_id,
          cost_price, selling_price, quantity, reorder_level,
          is_returnable, damaged_stock, status, tax_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, ?)`,
      [
        barcode, barcode_source, supplier_barcode ?? null, product_name, description ?? null,
        category_id, supplier_id ?? null, unit_id,
        cost_price, selling_price, reorder_level,
        is_returnable ? 1 : 0, status, tax_type ?? "VATABLE",
      ]
    );

    const newId: number = result.insertId;
    const [newRows] = await conn.execute<any[]>(
      `SELECT ${PRODUCT_COLS}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
       LEFT JOIN units      u ON u.id = p.unit_id
       WHERE p.id = ?`,
      [newId]
    );

    await logAuditEvent({
      action: "PRODUCT_CREATED",
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      entityType: "products",
      entityId: newId,
      newValues: { barcode, product_name, selling_price, cost_price },
    });

    res.status(201).json((newRows as any[])[0]);
  } catch (err) {
    console.error("[products/POST /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

// ─── PUT /api/products/:id ────────────────────────────────────────────────────
router.put("/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid product ID." }); return; }

  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }

  const data = parsed.data;
  if (Object.keys(data).length === 0) {
    res.status(400).json({ message: "No fields provided to update." });
    return;
  }

  const conn = await pool.getConnection();
  try {
    const [existing] = await conn.execute<any[]>(
      "SELECT id FROM products WHERE id = ? LIMIT 1", [id]
    );
    if ((existing as any[]).length === 0) {
      res.status(404).json({ message: "Product not found." });
      return;
    }

    if (data.barcode) {
      const [barcodeCheck] = await conn.execute<any[]>(
        "SELECT id FROM products WHERE barcode = ? AND id != ? LIMIT 1",
        [data.barcode, id]
      );
      if ((barcodeCheck as any[]).length > 0) {
        res.status(409).json({ message: "A product with this barcode already exists." });
        return;
      }
    }

    const fields: string[] = [];
    const values: any[] = [];

    const fieldMap: Record<string, any> = {
      barcode:          data.barcode,
      barcode_source:   data.barcode_source,
      supplier_barcode: data.supplier_barcode,
      product_name:     data.product_name,
      description:      data.description,
      category_id:      data.category_id,
      supplier_id:      data.supplier_id,
      unit_id:          data.unit_id,
      cost_price:       data.cost_price,
      selling_price:    data.selling_price,
      reorder_level:    data.reorder_level,
      is_returnable:    data.is_returnable !== undefined ? (data.is_returnable ? 1 : 0) : undefined,
      status:           data.status,
      tax_type:         data.tax_type,
    };

    for (const [col, val] of Object.entries(fieldMap)) {
      if (val !== undefined) {
        fields.push(`${col} = ?`);
        values.push(val === null ? null : val);
      }
    }
    values.push(id);

    await conn.execute(
      `UPDATE products SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    const [updated] = await conn.execute<any[]>(
      `SELECT ${PRODUCT_COLS}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
       LEFT JOIN units      u ON u.id = p.unit_id
       WHERE p.id = ?`,
      [id]
    );

    // Detect price change for specific audit action
    const [prevRows] = await conn.execute<any[]>("SELECT selling_price, cost_price FROM products WHERE id = ? LIMIT 1", [id]);
    const prev = prevRows[0];
    const isPriceChange = data.selling_price !== undefined || data.cost_price !== undefined;
    await logAuditEvent({
      action: isPriceChange ? "PRODUCT_PRICE_CHANGED" : "PRODUCT_UPDATED",
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      entityType: "products",
      entityId: id,
      previousValues: isPriceChange ? { selling_price: prev?.selling_price, cost_price: prev?.cost_price } : undefined,
      newValues: data as Record<string, unknown>,
    });

    res.status(200).json((updated as any[])[0]);
  } catch (err) {
    console.error("[products/PUT /:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});

// ─── DELETE /api/products/:id — soft delete via status ────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid product ID." }); return; }

  try {
    const [existing] = await pool.execute<any[]>(
      "SELECT id FROM products WHERE id = ? LIMIT 1", [id]
    );
    if ((existing as any[]).length === 0) {
      res.status(404).json({ message: "Product not found." });
      return;
    }

    const [salesCheck] = await pool.execute<any[]>(
      "SELECT id FROM sale_items WHERE product_id = ? LIMIT 1", [id]
    );
    if ((salesCheck as any[]).length > 0) {
      await pool.execute(
        "UPDATE products SET status = 'Inactive' WHERE id = ?", [id]
      );
      res.status(200).json({ message: "Product deactivated (has sales history).", soft: true });
      return;
    }

    await pool.execute("DELETE FROM products WHERE id = ?", [id]);
    res.status(200).json({ message: "Product deleted successfully.", soft: false });
  } catch (err) {
    console.error("[products/DELETE /:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

export default router;
