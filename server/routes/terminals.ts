import { Request, Response, Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { logAuditEvent } from "../utils/auditLogger.js";

const router = Router();
router.use(authenticate);

// ─── Validation Schemas ────────────────────────────────────────────────────────

const terminalCreateSchema = z.object({
  terminal_code: z
    .string()
    .min(1, "Terminal code is required")
    .max(20, "Terminal code must be 20 characters or less")
    .trim()
    .toUpperCase(),
  terminal_name: z
    .string()
    .min(1, "Terminal name is required")
    .max(100, "Terminal name must be 100 characters or less")
    .trim(),
  pos_serial: z.string().max(50).default("").transform((v) => v.trim()),
  pos_min: z.string().max(50).default("").transform((v) => v.trim()),
  is_active: z.boolean().default(true),
});

const terminalUpdateSchema = z.object({
  terminal_code: z
    .string()
    .min(1)
    .max(20)
    .trim()
    .toUpperCase()
    .optional(),
  terminal_name: z
    .string()
    .min(1)
    .max(100)
    .trim()
    .optional(),
  pos_serial: z.string().max(50).optional().transform((v) => (v !== undefined ? v.trim() : undefined)),
  pos_min: z.string().max(50).optional().transform((v) => (v !== undefined ? v.trim() : undefined)),
  is_active: z.boolean().optional(),
});

// ─── GET /api/terminals ────────────────────────────────────────────────────────
// Lists active terminals for workstation binding (Cashiers, Admins, Clerks)
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT id, terminal_code, terminal_name, pos_serial, pos_min, is_active, created_at, updated_at
       FROM pos_terminals
       WHERE is_active = TRUE
       ORDER BY terminal_code ASC`
    );
    res.status(200).json({ terminals: rows });
  } catch (err) {
    console.error("[terminals/GET]", err);
    res.status(500).json({ message: "Failed to load terminals." });
  }
});

// ─── GET /api/terminals/all ────────────────────────────────────────────────────
// Lists all terminals including inactive ones (Admin only)
router.get("/all", requireRole("Admin"), async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT id, terminal_code, terminal_name, pos_serial, pos_min, is_active, created_at, updated_at
       FROM pos_terminals
       ORDER BY terminal_code ASC`
    );
    res.status(200).json({ terminals: rows });
  } catch (err) {
    console.error("[terminals/all/GET]", err);
    res.status(500).json({ message: "Failed to load all terminals." });
  }
});

// ─── POST /api/terminals ───────────────────────────────────────────────────────
// Creates a new terminal counter (Admin only)
router.post("/", requireRole("Admin"), async (req: Request, res: Response): Promise<void> => {
  const parsed = terminalCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues[0]?.message || "Invalid terminal data.",
      errors: parsed.error.flatten(),
    });
    return;
  }

  const { terminal_code, terminal_name, pos_serial, pos_min, is_active } = parsed.data;

  try {
    // Check if terminal_code already exists
    const [existing] = await pool.execute<any[]>(
      "SELECT id FROM pos_terminals WHERE terminal_code = ? LIMIT 1",
      [terminal_code]
    );
    if (existing.length > 0) {
      res.status(409).json({ message: `Terminal code '${terminal_code}' already exists.` });
      return;
    }

    const [insertResult] = await pool.execute<any>(
      `INSERT INTO pos_terminals (terminal_code, terminal_name, pos_serial, pos_min, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [terminal_code, terminal_name, pos_serial, pos_min, is_active]
    );

    const newId = insertResult.insertId;

    await logAuditEvent({
      action: "TERMINAL_CREATED",
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      entityType: "pos_terminals",
      entityId: newId,
      newValues: { terminal_code, terminal_name, pos_serial, pos_min, is_active },
    });

    res.status(201).json({
      message: `Terminal '${terminal_name}' (${terminal_code}) created successfully.`,
      terminal: {
        id: newId,
        terminal_code,
        terminal_name,
        pos_serial,
        pos_min,
        is_active,
      },
    });
  } catch (err) {
    console.error("[terminals/POST]", err);
    res.status(500).json({ message: "Failed to create terminal." });
  }
});

// ─── PUT /api/terminals/:id ────────────────────────────────────────────────────
// Updates an existing terminal (Admin only)
router.put("/:id", requireRole("Admin"), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    res.status(400).json({ message: "Invalid terminal ID." });
    return;
  }

  const parsed = terminalUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues[0]?.message || "Invalid terminal update payload.",
      errors: parsed.error.flatten(),
    });
    return;
  }

  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT * FROM pos_terminals WHERE id = ? LIMIT 1",
      [id]
    );
    if (rows.length === 0) {
      res.status(404).json({ message: "Terminal not found." });
      return;
    }
    const current = rows[0];

    const updates: string[] = [];
    const values: any[] = [];

    if (parsed.data.terminal_code !== undefined && parsed.data.terminal_code !== current.terminal_code) {
      const [dup] = await pool.execute<any[]>(
        "SELECT id FROM pos_terminals WHERE terminal_code = ? AND id != ? LIMIT 1",
        [parsed.data.terminal_code, id]
      );
      if (dup.length > 0) {
        res.status(409).json({ message: `Terminal code '${parsed.data.terminal_code}' is already used.` });
        return;
      }
      updates.push("terminal_code = ?");
      values.push(parsed.data.terminal_code);
    }

    if (parsed.data.terminal_name !== undefined) {
      updates.push("terminal_name = ?");
      values.push(parsed.data.terminal_name);
    }
    if (parsed.data.pos_serial !== undefined) {
      updates.push("pos_serial = ?");
      values.push(parsed.data.pos_serial);
    }
    if (parsed.data.pos_min !== undefined) {
      updates.push("pos_min = ?");
      values.push(parsed.data.pos_min);
    }
    if (parsed.data.is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(parsed.data.is_active);
    }

    if (updates.length > 0) {
      values.push(id);
      await pool.execute(
        `UPDATE pos_terminals SET ${updates.join(", ")} WHERE id = ?`,
        values
      );

      await logAuditEvent({
        action: "TERMINAL_UPDATED",
        performedById: req.user!.id,
        performedByUsername: req.user!.username,
        entityType: "pos_terminals",
        entityId: id,
        previousValues: current,
        newValues: parsed.data,
      });
    }

    const [updatedRows] = await pool.execute<any[]>(
      "SELECT * FROM pos_terminals WHERE id = ? LIMIT 1",
      [id]
    );

    res.status(200).json({
      message: "Terminal updated successfully.",
      terminal: updatedRows[0],
    });
  } catch (err) {
    console.error("[terminals/PUT]", err);
    res.status(500).json({ message: "Failed to update terminal." });
  }
});

// ─── DELETE /api/terminals/:id ─────────────────────────────────────────────────
// Soft deletes / deactivates a terminal (Admin only)
router.delete("/:id", requireRole("Admin"), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    res.status(400).json({ message: "Invalid terminal ID." });
    return;
  }

  try {
    const [rows] = await pool.execute<any[]>(
      "SELECT * FROM pos_terminals WHERE id = ? LIMIT 1",
      [id]
    );
    if (rows.length === 0) {
      res.status(404).json({ message: "Terminal not found." });
      return;
    }

    // Deactivate rather than hard delete to preserve historical integrity
    await pool.execute(
      "UPDATE pos_terminals SET is_active = FALSE WHERE id = ?",
      [id]
    );

    await logAuditEvent({
      action: "TERMINAL_DEACTIVATED",
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      entityType: "pos_terminals",
      entityId: id,
      previousValues: rows[0],
    });

    res.status(200).json({ message: "Terminal deactivated successfully." });
  } catch (err) {
    console.error("[terminals/DELETE]", err);
    res.status(500).json({ message: "Failed to deactivate terminal." });
  }
});

export default router;
