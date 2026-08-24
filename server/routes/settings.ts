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
  store_name:                z.string().max(150).optional().nullable(),
  facebook:                  z.string().max(150).optional().nullable(), // renamed from store_fb
  contact_number:            z.string().max(50).optional().nullable(), // renamed from store_phone
  address:                   z.string().max(255).optional().nullable(), // renamed from store_address
  currency:                  z.string().max(10).optional().nullable(),
  // Business / taxpayer
  proprietor:                z.string().max(150).optional().nullable(),
  registered_taxpayer_name:  z.string().max(200).optional().nullable(),
  tin: z.string()
    .optional()
    .nullable()
    .transform((val) => {
      if (val === undefined) return undefined;
      if (val === null || val === "") return "";
      const digits = val.replace(/\D/g, "");
      if (digits.length >= 9) return digits.slice(0, 9);
      return digits;
    })
    .refine((val) => val === undefined || val === null || val === "" || val.length === 9, {
      message: "TIN must be 9 digits (e.g. 123456789 or 123-456-789)",
    }),
  branch_code: z.string()
    .optional()
    .nullable()
    .transform((val) => {
      if (val === undefined) return undefined;
      if (val === null || val === "") return "00000";
      const digits = val.replace(/\D/g, "");
      if (!digits) return "00000";
      if (digits.length > 5) return digits.slice(0, 5);
      return digits.padStart(Math.max(3, digits.length), "0");
    })
    .refine((val) => val === undefined || val === null || (val.length >= 3 && val.length <= 5), {
      message: "Branch Code must be 3 to 5 digits (e.g. 00000)",
    }),
  business_license:          z.string().max(100).optional().nullable(),
  document_type:             z.string().max(60).optional().nullable(),
  vat_rate:                  z.number().min(0, "Tax rate cannot be negative").max(100, "Tax rate cannot exceed 100").optional().nullable(),
  vat_enabled:               z.boolean().optional(), // renamed from vat_registered
  vat_registered:            z.boolean().optional(), // alias for compatibility
  // POS machine & Accreditation
  pos_min:                   z.string().max(30).optional().nullable(),
  pos_serial:                z.string().max(30).optional().nullable(),
  ptu_or_accn_no:            z.string().max(100).optional().nullable(),
  ptu_date_issued:           z.string().optional().nullable(),
  accreditation_no:          z.string().max(100).optional().nullable(),
  accreditation_date_issued: z.string().optional().nullable(),
});

// ─── GET /api/settings ────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute<any[]>("SELECT * FROM system_settings WHERE id = 1 LIMIT 1");
    const row = rows[0] ?? {};
    res.set("Cache-Control", "no-store");
    res.status(200).json({
      ...row,
      branch_code:               row.branch_code ?? "00000",
      ptu_or_accn_no:            row.ptu_or_accn_no ?? null,
      ptu_date_issued:           row.ptu_date_issued ? String(row.ptu_date_issued).slice(0, 10) : null,
      accreditation_no:          row.accreditation_no ?? "000-000000000-000000",
      accreditation_date_issued: row.accreditation_date_issued ? String(row.accreditation_date_issued).slice(0, 10) : null,
      vat_rate:                  Number(row.vat_rate ?? 0),
      vat_enabled:               Boolean(row.vat_enabled),
      vat_registered:            Boolean(row.vat_enabled), // Alias for frontend compatibility
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
    // ─── Operational Guardrail (Active Shift Lock) ───────────────────────────
    // Before saving changes to statutory tax or machine settings, check for open cash sessions
    const statutoryFields = [
      "vat_enabled",
      "vat_registered",
      "vat_rate",
      "tin",
      "branch_code",
      "pos_min",
      "pos_serial",
      "ptu_or_accn_no",
      "ptu_date_issued",
      "accreditation_no",
      "accreditation_date_issued",
    ];
    const isModifyingStatutory = statutoryFields.some((field) => (data as any)[field] !== undefined);

    if (isModifyingStatutory) {
      const [openSessions] = await pool.execute<any[]>(
        "SELECT id FROM cash_sessions WHERE session_status = 'open' LIMIT 1"
      );
      if (openSessions && openSessions.length > 0) {
        res.status(400).json({
          message: "Cannot change statutory tax or machine settings while a shift is open. Please close all shifts and perform a Z-Reading first.",
        });
        return;
      }
    }

    // Fetch previous values for audit log
    const [prevRows] = await pool.execute<any[]>("SELECT * FROM system_settings WHERE id = 1 LIMIT 1");
    const previous = prevRows[0] ?? {};

    const setClauses: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [];

    const fieldMap: Record<string, string> = {
      store_name:                "store_name",
      facebook:                  "facebook",
      contact_number:            "contact_number",
      address:                   "address",
      currency:                  "currency",
      vat_rate:                  "vat_rate",
      business_license:          "business_license",
      registered_taxpayer_name:  "registered_taxpayer_name",
      proprietor:                "proprietor",
      tin:                       "tin",
      branch_code:               "branch_code",
      document_type:             "document_type",
      pos_min:                   "pos_min",
      pos_serial:                "pos_serial",
      ptu_or_accn_no:            "ptu_or_accn_no",
      ptu_date_issued:           "ptu_date_issued",
      accreditation_no:          "accreditation_no",
      accreditation_date_issued: "accreditation_date_issued",
      vat_enabled:               "vat_enabled",
      vat_registered:            "vat_enabled", // alias maps to same column
      // Legacy field names for backward compatibility
      store_fb:                  "facebook",
      store_phone:               "contact_number",
      store_address:             "address",
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        setClauses.push(`${col} = ?`);
        values.push(data[key as keyof typeof data]);
      }
    }

    values.push(1); // WHERE id = 1
    await pool.execute(`UPDATE system_settings SET ${setClauses.join(", ")} WHERE id = ?`, values as any[]);

    const [rows] = await pool.execute<any[]>("SELECT * FROM system_settings WHERE id = 1 LIMIT 1");
    const row = rows[0] ?? {};

    // Determine audit action type
    const isTaxChange = data.vat_rate !== undefined || data.vat_enabled !== undefined || data.vat_registered !== undefined;
    const isBusinessInfoChange =
      data.registered_taxpayer_name !== undefined ||
      data.tin !== undefined ||
      data.branch_code !== undefined ||
      data.ptu_or_accn_no !== undefined ||
      data.ptu_date_issued !== undefined ||
      data.accreditation_no !== undefined ||
      data.accreditation_date_issued !== undefined ||
      data.pos_min !== undefined ||
      data.pos_serial !== undefined ||
      data.document_type !== undefined ||
      data.address !== undefined;

    const auditAction = isTaxChange
      ? "TAX_CONFIGURATION_UPDATED"
      : isBusinessInfoChange
      ? "BUSINESS_INFORMATION_UPDATED"
      : "SYSTEM_SETTINGS_UPDATED";

    await logAuditEvent({
      action: auditAction,
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      entityType: "system_settings",
      entityId: 1,
      previousValues: Object.fromEntries(
        Object.keys(data).map((k) => [k, previous[k]])
      ),
      newValues: data as Record<string, unknown>,
    });

    res.status(200).json({
      ...row,
      branch_code:               row.branch_code ?? "00000",
      ptu_or_accn_no:            row.ptu_or_accn_no ?? null,
      ptu_date_issued:           row.ptu_date_issued ? String(row.ptu_date_issued).slice(0, 10) : null,
      accreditation_no:          row.accreditation_no ?? "000-000000000-000000",
      accreditation_date_issued: row.accreditation_date_issued ? String(row.accreditation_date_issued).slice(0, 10) : null,
      vat_rate:                  Number(row.vat_rate ?? 0),
      vat_enabled:               Boolean(row.vat_enabled),
      vat_registered:            Boolean(row.vat_enabled), // Alias for frontend compatibility
    });
  } catch (err) {
    console.error("[settings/PUT] Unexpected error:", err);
    res.status(500).json({ message: "An unexpected error occurred. Please try again." });
  }
});

export default router;
