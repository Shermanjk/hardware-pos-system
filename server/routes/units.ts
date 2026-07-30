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
  description: z.string().optional().nullable(),
});

// ─── GET /api/units ───────────────────────────────────────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT id, unit_name, abbreviation, description FROM units ORDER BY unit_name ASC"
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

  const { unit_name, abbreviation, description } = parsed.data;
  try {
    const [existing] = await pool.execute<any[]>(
      "SELECT id FROM units WHERE unit_name = ? OR abbreviation = ? LIMIT 1",
      [unit_name, abbreviation]
    );
    if ((existing as any[]).length > 0) {
      res.status(409).json({ message: "Unit with this name or abbreviation already exists." });
      return;
    }

    const [result] = await pool.execute<any>(
      "INSERT INTO units (unit_name, abbreviation, description) VALUES (?, ?, ?)",
      [unit_name, abbreviation, description ?? null]
    );
    res.status(201).json({ id: result.insertId, unit_name, abbreviation, description });
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

  try {
    const [result] = await pool.execute<any>(
      "UPDATE units SET unit_name = ?, abbreviation = ?, description = ? WHERE id = ?",
      [parsed.data.unit_name, parsed.data.abbreviation, parsed.data.description ?? null, id]
    );
    if (result.affectedRows === 0) {
      res.status(404).json({ message: "Unit not found." });
      return;
    }
    res.status(200).json({ id, ...parsed.data });
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
      "SELECT id FROM products WHERE unit_id = ? LIMIT 1",
      [id]
    );
    if ((inUse as any[]).length > 0) {
      res.status(409).json({ message: "Cannot delete — unit is in use by products." });
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
