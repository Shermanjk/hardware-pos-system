import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "../db.js";

const router = Router();

// ─── Request validation schema ────────────────────────────────────────────────
const loginSchema = z.object({
  username:   z.string().min(1, "Username is required"),
  password:   z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional().default(false),
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post("/login", async (req: Request, res: Response) => {
  // 1. Validate request body
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request";
    res.status(400).json({ message });
    return;
  }

  const { username, password, rememberMe } = parsed.data;

  try {
    // 2. Look up user by username — include must_change_password
    const [rows] = await pool.execute<any[]>(
      `SELECT id, full_name, username, password_hash, role, employee_id,
              status, must_change_password
       FROM users
       WHERE username = ?
       LIMIT 1`,
      [username]
    );

    const user = rows[0];

    // 3. Check user existence + password (same message to prevent user enumeration)
    if (!user) {
      res.status(401).json({ message: "Invalid username or password." });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      res.status(401).json({ message: "Invalid username or password." });
      return;
    }

    // 4. Check account status
    if (user.status === "Inactive") {
      res.status(403).json({
        message:
          "Your account has been deactivated. Please contact your administrator.",
      });
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("JWT_SECRET is not set");
      res.status(500).json({ message: "Server configuration error." });
      return;
    }

    // 6. Base JWT payload — never includes password_hash
    const basePayload = {
      id: user.id,
      full_name: user.full_name,
      username: user.username,
      role: user.role,
      employee_id: user.employee_id ?? null,
    };

    // 7. If the account requires a password change, issue a restricted 15-min
    //    token with mustChangePassword: true and return early.
    //    The employee cannot reach any dashboard until they change their password.
    if (user.must_change_password) {
      const restrictedPayload = { ...basePayload, mustChangePassword: true };
      const restrictedToken = jwt.sign(restrictedPayload, secret, {
        expiresIn: "15m",
      });
      res.status(200).json({
        token: restrictedToken,
        user: restrictedPayload,
      });
      return;
    }

    // 8. Normal login — full-access token
    const expiresIn = rememberMe ? "30d" : "12h";
    const token = jwt.sign(basePayload, secret, { expiresIn });

    // 9. Respond — never include password_hash
    res.status(200).json({
      token,
      user: basePayload,
    });
  } catch (err) {
    console.error("[auth/login] Unexpected error:", err);
    res
      .status(500)
      .json({ message: "An unexpected error occurred. Please try again." });
  }
});

export default router;
