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

const settingsSchema = z.object({
  // General
  store_name:                z.string().max(150).optional(),
  store_fb:                  z.string().max(150).optional(),
  store_phone:               z.string().max(50).optional(),
  store_address:             z.string().max(255).optional(),
  currency:                  z.string().max(10).optional(),
  // Business / taxpayer
  registered_taxpayer_name:  z.string().max(200).optional(),
  tin:                       z.string().max(30).optional(),
  business_license:          z.string().max(100).optional(), // kept for backward compat
  document_type:             z.string().max(60).optional(),
  tax_rate:                  z.number().min(0, "Tax rate cannot be negative").max(100, "Tax rate cannot exceed 100").optional(),
  vat_registered:            z.boolean().optional(),
  // POS machine
  pos_min:                   z.string().max(30).optional(),
  pos_serial:                z.string().max(30).optional(),
});

// ─── GET /api/settings ────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute<any[]>("SELECT * FROM store_settings WHERE id = 1 LIMIT 1");
    const row = rows[0] ?? {};
    res.set("Cache-Control", "no-store");
    res.status(200).json({
      ...row,
      tax_rate:       Number(row.tax_rate ?? 0),
      vat_registered: Boolean(row.vat_registered),
    });
  } catch (err) {
    console.error("[settings/GET] Unexpected error:", err);
    res.status(500).json({ message: "An unexpected error occurred. Please try again." });
  }
});

// ─── PUT /api/settings ────────────────────────────────────────────────────────
router.put("/", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({
      field: String(i.path[0] ?? "general"),
      message: i.message,
    }));
    res.status(422).json({ errors });
    return;
  }

  const data = parsed.data;
  if (Object.keys(data).length === 0) {
    res.status(422).json({ errors: [{ field: "general", message: "No fields to update." }] });
    return;
  }

  try {
    // Fetch previous values for audit log
    const [prevRows] = await pool.execute<any[]>("SELECT * FROM store_settings WHERE id = 1 LIMIT 1");
    const previous = prevRows[0] ?? {};

    const setClauses: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [];

    const fieldMap: Record<string, string> = {
      store_name:               "store_name",
      store_fb:                 "store_fb",
      store_phone:              "store_phone",
      store_address:            "store_address",
      currency:                 "currency",
      tax_rate:                 "tax_rate",
      business_license:         "business_license",
      registered_taxpayer_name: "registered_taxpayer_name",
      tin:                      "tin",
      document_type:            "document_type",
      pos_min:                  "pos_min",
      pos_serial:               "pos_serial",
      vat_registered:           "vat_registered",
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        setClauses.push(`${col} = ?`);
        values.push(data[key as keyof typeof data]);
      }
    }

    values.push(1); // WHERE id = 1
    await pool.execute(`UPDATE store_settings SET ${setClauses.join(", ")} WHERE id = ?`, values as any[]);

    const [rows] = await pool.execute<any[]>("SELECT * FROM store_settings WHERE id = 1 LIMIT 1");
    const row = rows[0] ?? {};

    // Determine audit action type
    const isTaxChange = data.tax_rate !== undefined || data.vat_registered !== undefined;
    const isBusinessInfoChange =
      data.registered_taxpayer_name !== undefined ||
      data.tin !== undefined ||
      data.document_type !== undefined ||
      data.store_address !== undefined;

    const auditAction = isTaxChange
      ? "TAX_CONFIGURATION_UPDATED"
      : isBusinessInfoChange
      ? "BUSINESS_INFORMATION_UPDATED"
      : "SYSTEM_SETTINGS_UPDATED";

    await logAuditEvent({
      action: auditAction,
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      entityType: "store_settings",
      entityId: 1,
      previousValues: Object.fromEntries(
        Object.keys(data).map((k) => [k, previous[k]])
      ),
      newValues: data as Record<string, unknown>,
    });

    res.status(200).json({
      ...row,
      tax_rate:       Number(row.tax_rate ?? 0),
      vat_registered: Boolean(row.vat_registered),
    });
  } catch (err) {
    console.error("[settings/PUT] Unexpected error:", err);
    res.status(500).json({ message: "An unexpected error occurred. Please try again." });
  }
});

export default router;
