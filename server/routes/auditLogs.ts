import { Router, Request, Response } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

// ─── All routes require a valid JWT ──────────────────────────────────────────
router.use(authenticate);

// ─── Admin-only guard ─────────────────────────────────────────────────────────
function requireAdmin(req: Request, res: Response): boolean {
  if (req.user?.role !== "Admin") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}

// ─── Query param schema ───────────────────────────────────────────────────────
const paginationSchema = z.object({
  page:     z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ─── GET /api/audit-logs ──────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const parsed = paginationSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid pagination parameters." });
    return;
  }

  const { page, pageSize } = parsed.data;
  const offset = (page - 1) * pageSize;

  try {
    // Total count for pagination metadata
    const [countRows] = await pool.execute<any[]>(
      "SELECT COUNT(*) AS total FROM audit_logs"
    );
    const total: number = countRows[0]?.total ?? 0;

    // Paginated entries — most recent first
    const [entries] = await pool.execute<any[]>(
      `SELECT id, action, performed_by_id, performed_by_username,
              target_user_id, target_username, metadata, created_at
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [pageSize, offset]
    );

    res.status(200).json({ entries, total, page, pageSize });
  } catch (err) {
    console.error("[audit-logs/GET /] Unexpected error:", err);
    res.status(500).json({ message: "An unexpected error occurred. Please try again." });
  }
});

export default router;
