import { Router, Request, Response } from "express";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

router.use(authenticate);

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

export default router;
