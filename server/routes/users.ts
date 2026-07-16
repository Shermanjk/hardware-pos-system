import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { generateTempPassword } from "../utils/passwordGenerator.js";
import { logAuditEvent } from "../utils/auditLogger.js";

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

// ─── Columns returned in user list responses (never expose password_hash) ─────
const USER_COLS = `
  id, full_name, username, role, employee_id, status,
  must_change_password, password_changed_at, updated_at
`;

// ─── Zod schemas ──────────────────────────────────────────────────────────────
const createUserSchema = z.object({
  full_name:   z.string().min(1, "Full name is required"),
  username:    z.string().min(1, "Username is required"),
  role:        z.enum(["Cashier", "Inventory Clerk"], { error: "Role must be Cashier or Inventory Clerk" }),
  status:      z.enum(["Active", "Inactive"], { error: "Status must be Active or Inactive" }),
  employee_id: z.string().optional(),
});

const updateUserSchema = z.object({
  full_name:   z.string().min(1).optional(),
  role:        z.enum(["Cashier", "Inventory Clerk"]).optional(),
  status:      z.enum(["Active", "Inactive"]).optional(),
  employee_id: z.string().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword:     z.string().min(8, "New password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your new password"),
});

// ─── Password complexity check ────────────────────────────────────────────────
function validatePasswordComplexity(password: string): string[] {
  const errors: string[] = [];
  if (!/[A-Z]/.test(password)) errors.push("Password must contain at least one uppercase letter.");
  if (!/[a-z]/.test(password)) errors.push("Password must contain at least one lowercase letter.");
  if (!/[0-9]/.test(password)) errors.push("Password must contain at least one number.");
  return errors;
}

// ─── GET /api/users ───────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT ${USER_COLS} FROM users ORDER BY full_name ASC`
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error("[users/GET /] Unexpected error:", err);
    res.status(500).json({ message: "An unexpected error occurred. Please try again." });
  }
});

// ─── POST /api/users — create employee account ────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({
      field: String(i.path[0] ?? "general"),
      message: i.message,
    }));
    res.status(422).json({ errors });
    return;
  }

  const { full_name, username, role, status, employee_id } = parsed.data;

  try {
    // Check for duplicate username
    const [existing] = await pool.execute<any[]>(
      "SELECT id FROM users WHERE username = ? LIMIT 1",
      [username]
    );
    if ((existing as any[]).length > 0) {
      res.status(409).json({ message: "Username already exists." });
      return;
    }

    // Generate and hash temporary password — plain text is NEVER stored
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const [result] = await pool.execute<any>(
      `INSERT INTO users
         (full_name, username, password_hash, role, employee_id, status,
          must_change_password, password_changed_at)
       VALUES (?, ?, ?, ?, ?, ?, TRUE, NULL)`,
      [full_name, username, passwordHash, role, employee_id ?? null, status]
    );

    const newUserId: number = result.insertId;

    // Fetch full row (without password_hash) to return to client
    const [newRows] = await pool.execute<any[]>(
      `SELECT ${USER_COLS} FROM users WHERE id = ? LIMIT 1`,
      [newUserId]
    );

    // Audit log — never include tempPassword in metadata
    await logAuditEvent({
      action: "account_created",
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      targetUserId: newUserId,
      targetUsername: username,
    });

    // Return user row + one-time temp password
    // The plain-text tempPassword must NOT be persisted or logged
    res.status(201).json({
      user: newRows[0],
      tempPassword,
    });
  } catch (err) {
    console.error("[users/POST /] Unexpected error:", err);
    res.status(500).json({ message: "An unexpected error occurred. Please try again." });
  }
});

// ─── PUT /api/users/:id — edit user details ───────────────────────────────────
router.put("/:id", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ message: "Invalid user ID." });
    return;
  }

  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({
      field: String(i.path[0] ?? "general"),
      message: i.message,
    }));
    res.status(422).json({ errors });
    return;
  }

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    res.status(422).json({ errors: [{ field: "general", message: "No fields to update." }] });
    return;
  }

  try {
    // Build SET clause dynamically from provided fields
    const setClauses: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [];

    if (updates.full_name !== undefined) {
      setClauses.push("full_name = ?");
      values.push(updates.full_name);
    }
    if (updates.role !== undefined) {
      setClauses.push("role = ?");
      values.push(updates.role);
    }
    if (updates.status !== undefined) {
      setClauses.push("status = ?");
      values.push(updates.status);
    }
    if (updates.employee_id !== undefined) {
      setClauses.push("employee_id = ?");
      values.push(updates.employee_id);
    }

    values.push(userId);

    await pool.execute(
      `UPDATE users SET ${setClauses.join(", ")} WHERE id = ?`,
      values as any[]
    );

    const [rows] = await pool.execute<any[]>(
      `SELECT ${USER_COLS} FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );

    if ((rows as any[]).length === 0) {
      res.status(404).json({ message: "User not found." });
      return;
    }

    res.status(200).json(rows[0]);
  } catch (err) {
    console.error("[users/PUT /:id] Unexpected error:", err);
    res.status(500).json({ message: "An unexpected error occurred. Please try again." });
  }
});

// ─── POST /api/users/:id/reset-password ───────────────────────────────────────
router.post("/:id/reset-password", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ message: "Invalid user ID." });
    return;
  }

  try {
    // Fetch target user to get username for audit log
    const [targetRows] = await pool.execute<any[]>(
      "SELECT id, username FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    if ((targetRows as any[]).length === 0) {
      res.status(404).json({ message: "User not found." });
      return;
    }
    const targetUser = targetRows[0];

    // Generate and hash new temporary password
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await pool.execute(
      `UPDATE users
       SET password_hash = ?, must_change_password = TRUE,
           password_changed_at = NULL, updated_at = NOW()
       WHERE id = ?`,
      [passwordHash, userId]
    );

    await logAuditEvent({
      action: "password_reset",
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      targetUserId: userId,
      targetUsername: targetUser.username,
    });

    // Return one-time temp password — never logged or persisted
    res.status(200).json({ tempPassword });
  } catch (err) {
    console.error("[users/POST /:id/reset-password] Unexpected error:", err);
    res.status(500).json({ message: "An unexpected error occurred. Please try again." });
  }
});

// ─── POST /api/users/:id/deactivate ──────────────────────────────────────────
router.post("/:id/deactivate", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ message: "Invalid user ID." });
    return;
  }

  try {
    const [targetRows] = await pool.execute<any[]>(
      "SELECT id, username FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    if ((targetRows as any[]).length === 0) {
      res.status(404).json({ message: "User not found." });
      return;
    }
    const targetUser = targetRows[0];

    await pool.execute(
      "UPDATE users SET status = 'Inactive', updated_at = NOW() WHERE id = ?",
      [userId]
    );

    await logAuditEvent({
      action: "account_deactivated",
      performedById: req.user!.id,
      performedByUsername: req.user!.username,
      targetUserId: userId,
      targetUsername: targetUser.username,
    });

    const [rows] = await pool.execute<any[]>(
      `SELECT ${USER_COLS} FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );

    res.status(200).json(rows[0]);
  } catch (err) {
    console.error("[users/POST /:id/deactivate] Unexpected error:", err);
    res.status(500).json({ message: "An unexpected error occurred. Please try again." });
  }
});

// ─── POST /api/users/:id/change-password ─────────────────────────────────────
// Accessible by the employee themselves (restricted OR full-access token).
// Does NOT require Admin role — enforces self-only via req.user.id === param id.
router.post("/:id/change-password", async (req: Request, res: Response) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ message: "Invalid user ID." });
    return;
  }

  // Enforce self-only access
  if (req.user!.id !== userId) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({
      field: String(i.path[0] ?? "general"),
      message: i.message,
    }));
    res.status(422).json({ errors });
    return;
  }

  const { currentPassword, newPassword, confirmPassword } = parsed.data;

  // Confirm password match check
  if (newPassword !== confirmPassword) {
    res.status(422).json({
      errors: [{ field: "confirmPassword", message: "Passwords do not match." }],
    });
    return;
  }

  // New password complexity
  const complexityErrors = validatePasswordComplexity(newPassword);
  if (complexityErrors.length > 0) {
    res.status(422).json({
      errors: complexityErrors.map((msg) => ({ field: "newPassword", message: msg })),
    });
    return;
  }

  try {
    // Fetch current hash
    const [rows] = await pool.execute<any[]>(
      "SELECT password_hash, username FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    if ((rows as any[]).length === 0) {
      res.status(404).json({ message: "User not found." });
      return;
    }
    const user = rows[0];

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!passwordMatch) {
      res.status(422).json({
        errors: [{ field: "currentPassword", message: "Current password is incorrect." }],
      });
      return;
    }

    // Hash and persist new password
    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.execute(
      `UPDATE users
       SET password_hash = ?, must_change_password = FALSE,
           password_changed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [newHash, userId]
    );

    await logAuditEvent({
      action: "password_changed",
      performedById: userId,
      performedByUsername: user.username,
      targetUserId: userId,
      targetUsername: user.username,
    });

    // Issue a new full-access JWT — mustChangePassword claim is absent
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ message: "Server configuration error." });
      return;
    }

    const newPayload = {
      id: req.user!.id,
      full_name: req.user!.full_name,
      username: req.user!.username,
      role: req.user!.role,
      employee_id: req.user!.employee_id,
    };
    const newToken = jwt.sign(newPayload, secret, { expiresIn: "8h" });

    res.status(200).json({ token: newToken, user: newPayload });
  } catch (err) {
    console.error("[users/POST /:id/change-password] Unexpected error:", err);
    res.status(500).json({ message: "An unexpected error occurred. Please try again." });
  }
});

export default router;
