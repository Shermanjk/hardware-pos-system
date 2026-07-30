import { Router, Request, Response } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

router.use(authenticate);

function requireAdmin(req: Request, res: Response): boolean {
  if (req.user?.role !== "Admin") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}

const unitSchema = z.object({
  unit_name: z.string().min(1, "Unit name is required").max(50),
  abbreviation: z.string().min(1, "Abbreviation is required").max(30),
  unit_type: z.enum(["Count", "Weight", "Volume", "Length", "Area", "Packaging", "Other"], {
    message: "Unit type is required",
  }),
  allow_decimal: z.boolean({
    message: "Decimal support is required",
  }),
  description: z.string().optional().nullable(),
  status: z.enum(["Active", "Inactive"]).default("Active"),
});

// ─── GET /api/units ───────────────────────────────────────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT u.id, u.unit_name, u.abbreviation, u.unit_type, u.allow_decimal, u.description, u.status,
              COUNT(p.id) as product_count
       FROM units u
       LEFT JOIN products p ON p.unit_id = u.id
       GROUP BY u.id, u.unit_name, u.abbreviation, u.unit_type, u.allow_decimal, u.description, u.status
       ORDER BY u.unit_name ASC`
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error("[units/GET /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── POST /api/units ──────────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const parsed = unitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "unit_name"), message: i.message })) });
    return;
  }

  const { unit_name, abbreviation, unit_type, allow_decimal, description, status } = parsed.data;
  try {
    const [existing] = await pool.execute<any[]>(
      "SELECT id FROM units WHERE LOWER(unit_name) = LOWER(?) OR LOWER(abbreviation) = LOWER(?) LIMIT 1",
      [unit_name, abbreviation]
    );
    if ((existing as any[]).length > 0) {
      res.status(409).json({ message: "Unit with this name or abbreviation already exists." });
      return;
    }

    const [result] = await pool.execute<any>(
      "INSERT INTO units (unit_name, abbreviation, unit_type, allow_decimal, description, status) VALUES (?, ?, ?, ?, ?, ?)",
      [unit_name, abbreviation, unit_type, allow_decimal ? 1 : 0, description ?? null, status]
    );
    res.status(201).json({ id: result.insertId, unit_name, abbreviation, unit_type, allow_decimal, description, status });
  } catch (err) {
    console.error("[units/POST /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── PUT /api/units/:id ───────────────────────────────────────────────────────
router.put("/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid ID." }); return; }

  const parsed = unitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "unit_name"), message: i.message })) });
    return;
  }

  const { unit_name, abbreviation, unit_type, allow_decimal, description, status } = parsed.data;
  try {
    // Check for duplicates (excluding current unit)
    const [existing] = await pool.execute<any[]>(
      "SELECT id FROM units WHERE (LOWER(unit_name) = LOWER(?) OR LOWER(abbreviation) = LOWER(?)) AND id != ? LIMIT 1",
      [unit_name, abbreviation, id]
    );
    if ((existing as any[]).length > 0) {
      res.status(409).json({ message: "Unit with this name or abbreviation already exists." });
      return;
    }

    const [result] = await pool.execute<any>(
      "UPDATE units SET unit_name = ?, abbreviation = ?, unit_type = ?, allow_decimal = ?, description = ?, status = ? WHERE id = ?",
      [unit_name, abbreviation, unit_type, allow_decimal ? 1 : 0, description ?? null, status, id]
    );
    if (result.affectedRows === 0) {
      res.status(404).json({ message: "Unit not found." });
      return;
    }
    res.status(200).json({ id, unit_name, abbreviation, unit_type, allow_decimal, description, status });
  } catch (err) {
    console.error("[units/PUT /:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── DELETE /api/units/:id ────────────────────────────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid ID." }); return; }

  try {
    const [inUse] = await pool.execute<any[]>(
      "SELECT COUNT(*) as count FROM products WHERE unit_id = ?",
      [id]
    );
    const productCount = (inUse as any[])[0]?.count || 0;
    if (productCount > 0) {
      res.status(409).json({
        message: `Cannot delete. This unit is currently assigned to ${productCount} ${productCount === 1 ? 'product' : 'products'}. Deactivate it instead.`,
        can_mark_inactive: true,
        product_count: productCount
      });
      return;
    }

    const [result] = await pool.execute<any>("DELETE FROM units WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ message: "Unit not found." });
      return;
    }
    res.status(200).json({ message: "Unit deleted." });
  } catch (err) {
    console.error("[units/DELETE /:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

export default router;
