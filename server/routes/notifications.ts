// ─── GET /api/notifications/pending-counts ────────────────────────────────────
// Returns the current count of pending return and void requests for the admin
// sidebar. This is the HTTP fallback that keeps badge counts accurate even when
// a WebSocket notification was missed during a reconnection gap.

import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { pool } from "../db.js";

const router = Router();

router.get("/pending-counts", authenticate, async (_req: Request, res: Response) => {
  try {
    const [[returnsRow]] = await pool.execute<any[]>(
      `SELECT COUNT(*) AS cnt FROM returns WHERE status = 'pending'`
    );
    const [[voidsRow]] = await pool.execute<any[]>(
      `SELECT COUNT(*) AS cnt FROM sale_voids WHERE status = 'pending'`
    );

    res.json({
      pendingReturns: Number(returnsRow.cnt),
      pendingVoids:   Number(voidsRow.cnt),
    });
  } catch (err) {
    console.error("[notifications/pending-counts]", err);
    res.status(500).json({ message: "Failed to fetch pending counts." });
  }
});

export default router;
