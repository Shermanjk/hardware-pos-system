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

const supplierSchema = z.object({
  supplier_name:  z.string().min(1, "Supplier name is required").max(150),
  contact_person: z.string().optional().nullable(),
  contact_number: z.string().optional().nullable(),
  email:          z.string().email("Invalid email").optional().nullable().or(z.literal("")),
  address:        z.string().optional().nullable(),
  status:         z.enum(["Active", "Inactive"]).optional().default("Active"),
});

// ─── GET /api/suppliers ───────────────────────────────────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute<any[]>(`
      SELECT
        s.id,
        s.supplier_name,
        s.contact_person,
        s.contact_number,
        s.email,
        s.address,
        s.status,
        COUNT(p.id) AS product_count
      FROM suppliers s
      LEFT JOIN products p ON p.supplier_id = s.id AND p.status = 'Active'
      GROUP BY s.id
      ORDER BY s.supplier_name ASC
    `);
    res.status(200).json(rows);
  } catch (err) {
    console.error("[suppliers/GET /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── POST /api/suppliers ──────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "supplier_name"), message: i.message })) });
    return;
  }

  const { supplier_name, contact_person, contact_number, email, address, status } = parsed.data;
  try {
    const [existing] = await pool.execute<any[]>(
      "SELECT id FROM suppliers WHERE supplier_name = ? LIMIT 1",
      [supplier_name]
    );
    if ((existing as any[]).length > 0) {
      res.status(409).json({ message: "Supplier already exists." });
      return;
    }

    const [result] = await pool.execute<any>(
      "INSERT INTO suppliers (supplier_name, contact_person, contact_number, email, address, status) VALUES (?, ?, ?, ?, ?, ?)",
      [supplier_name, contact_person ?? null, contact_number ?? null, email || null, address ?? null, status]
    );
    res.status(201).json({ id: result.insertId, supplier_name, contact_person, contact_number, email, address, status });
  } catch (err) {
    console.error("[suppliers/POST /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── PUT /api/suppliers/:id ───────────────────────────────────────────────────
router.put("/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid ID." }); return; }

  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "supplier_name"), message: i.message })) });
    return;
  }

  const { supplier_name, contact_person, contact_number, email, address, status } = parsed.data;
  try {
    const [result] = await pool.execute<any>(
      "UPDATE suppliers SET supplier_name = ?, contact_person = ?, contact_number = ?, email = ?, address = ?, status = ? WHERE id = ?",
      [supplier_name, contact_person ?? null, contact_number ?? null, email || null, address ?? null, status, id]
    );
    if (result.affectedRows === 0) {
      res.status(404).json({ message: "Supplier not found." });
      return;
    }
    res.status(200).json({ id, supplier_name, contact_person, contact_number, email, address, status });
  } catch (err) {
    console.error("[suppliers/PUT /:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

// ─── DELETE /api/suppliers/:id ────────────────────────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ message: "Invalid ID." }); return; }

  try {
    const [inUse] = await pool.execute<any[]>(
      "SELECT id FROM products WHERE supplier_id = ? LIMIT 1",
      [id]
    );
    if ((inUse as any[]).length > 0) {
      res.status(409).json({ message: "Cannot delete — supplier is in use by products." });
      return;
    }

    const [result] = await pool.execute<any>("DELETE FROM suppliers WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ message: "Supplier not found." });
      return;
    }
    res.status(200).json({ message: "Supplier deleted." });
  } catch (err) {
    console.error("[suppliers/DELETE /:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});

export default router;
