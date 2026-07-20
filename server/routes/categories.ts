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

const categorySchema = z.object({
  category_name: z.string().min(1, "Category name is required").max(100),
  description:   z.string().optional().nullable(),
});

// ─── GET /api/categories ──────────────────────────────────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT id, category_name, description FROM categories ORDER BY category_name ASC"
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error("[categories/GET /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── POST /api/categories ─────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "category_name"), message: i.message })) });
    return;
  }

  const { category_name, description } = parsed.data;
  try {
    const [existing] = await pool.execute<any[]>(
      "SELECT id FROM categories WHERE category_name = ? LIMIT 1",
      [category_name]
    );
    if ((existing as any[]).length > 0) {
      res.status(409).json({ message: "Category already exists." });
      return;
    }

    const [result] = await pool.execute<any>(
      "INSERT INTO categories (category_name, description) VALUES (?, ?)",
      [category_name, description ?? null]
    );
    res.status(201).json({ id: result.insertId, category_name, description });
  } catch (err) {
    console.error("[categories/POST /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── PUT /api/categories/:id ──────────────────────────────────────────────────
router.put("/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid ID." }); return; }

  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "category_name"), message: i.message })) });
    return;
  }

  try {
    const [result] = await pool.execute<any>(
      "UPDATE categories SET category_name = ?, description = ? WHERE id = ?",
      [parsed.data.category_name, parsed.data.description ?? null, id]
    );
    if (result.affectedRows === 0) {
      res.status(404).json({ message: "Category not found." });
      return;
    }
    res.status(200).json({ id, ...parsed.data });
  } catch (err) {
    console.error("[categories/PUT /:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── DELETE /api/categories/:id ───────────────────────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid ID." }); return; }

  try {
    const [inUse] = await pool.execute<any[]>(
      "SELECT id FROM products WHERE category_id = ? LIMIT 1",
      [id]
    );
    if ((inUse as any[]).length > 0) {
      res.status(409).json({ message: "Cannot delete — category is in use by products." });
      return;
    }

    const [result] = await pool.execute<any>("DELETE FROM categories WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ message: "Category not found." });
      return;
    }
    res.status(200).json({ message: "Category deleted." });
  } catch (err) {
    console.error("[categories/DELETE /:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

export default router;
