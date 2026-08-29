import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { z } from "zod";
import { pool } from "../db.js";
import { logAuditEvent } from "../utils/auditLogger.js";
import { authenticate } from "../middleware/authenticate.js";
import { isUserSocketConnected, terminateUserSockets } from "../ws.js";

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
    // 2. Look up user by username — include session tracking and password lifecycle
    const [rows] = await pool.execute<any[]>(
      `SELECT id, full_name, username, password_hash, role, employee_id,
              status, must_change_password, is_logged_in, last_activity_at,
              logged_in_ip, current_session_id
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
      await logAuditEvent({
        action: "USER_LOGIN_FAILED",
        performedById: user.id,
        performedByUsername: user.username,
        reason: "Invalid password entered",
        metadata: { ip: req.ip },
      });
      res.status(401).json({ message: "Invalid username or password." });
      return;
    }

    // 4. Check account status
    if (user.status === "Inactive") {
      await logAuditEvent({
        action: "USER_LOGIN_FAILED",
        performedById: user.id,
        performedByUsername: user.username,
        reason: "Attempted login to deactivated account",
        metadata: { ip: req.ip },
      });
      res.status(403).json({
        message:
          "Your account has been deactivated. Please contact your administrator.",
      });
      return;
    }

    // 5. Check for active concurrent session on another PC / device
    const socketActive = isUserSocketConnected(user.id);
    let isSessionActive = false;

    if (user.is_logged_in === 1) {
      if (socketActive) {
        isSessionActive = true;
      } else if (user.last_activity_at) {
        const lastActiveMs = new Date(user.last_activity_at).getTime();
        // Active within last 90 seconds (grace window before dropped sockets time out)
        if (Date.now() - lastActiveMs < 90_000) {
          isSessionActive = true;
        }
      }
    }

    if (isSessionActive) {
      await logAuditEvent({
        action: "USER_LOGIN_BLOCKED_CONCURRENT",
        performedById: user.id,
        performedByUsername: user.username,
        reason: "Attempted duplicate login while account is actively logged in on another device",
        metadata: { ip: req.ip, previousIp: user.logged_in_ip, lastActive: user.last_activity_at },
      });
      res.status(409).json({
        message:
          "Your account is already logged in on another PC or device. Please log out from that device first or contact an administrator to release your session.",
        code: "ALREADY_LOGGED_IN",
        sessionInfo: {
          lastActive: user.last_activity_at,
        },
      });
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("JWT_SECRET is not set");
      res.status(500).json({ message: "Server configuration error." });
      return;
    }

    // 6. Generate unique session ID and record login in DB
    const sessionId = randomUUID();
    await pool.execute(
      `UPDATE users
       SET is_logged_in = 1, current_session_id = ?, last_login_at = NOW(),
           last_activity_at = NOW(), logged_in_ip = ?, logged_in_device = ?
       WHERE id = ?`,
      [sessionId, req.ip, req.headers["user-agent"]?.slice(0, 255) || null, user.id]
    );

    // 7. Base JWT payload — never includes password_hash
    const basePayload = {
      id: user.id,
      full_name: user.full_name,
      username: user.username,
      role: user.role,
      employee_id: user.employee_id ?? null,
      sessionId,
    };

    // Log successful login
    await logAuditEvent({
      action: "USER_LOGIN",
      performedById: user.id,
      performedByUsername: user.username,
      newValues: {
        role: user.role,
        employee_id: user.employee_id,
        sessionId,
        login_time: new Date().toISOString(),
      },
      metadata: { ip: req.ip, rememberMe },
    });

    // 8. If the account requires a password change, issue a restricted 15-min
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

    // 9. Normal login — full-access token
    const expiresIn = rememberMe ? "30d" : "12h";
    const token = jwt.sign(basePayload, secret, { expiresIn });

    // 10. Respond — never include password_hash
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

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post("/logout", async (req: Request, res: Response) => {
  try {
    let userId: number | null = null;
    let username: string | null = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const secret = process.env.JWT_SECRET;
      if (secret) {
        try {
          const decoded = jwt.verify(token, secret) as any;
          userId = decoded.id;
          username = decoded.username;
        } catch {
          // If token expired, decode payload to extract userId and release DB session
          const unverified = jwt.decode(token) as any;
          if (unverified?.id) {
            userId = unverified.id;
            username = unverified.username;
          }
        }
      }
    }

    if (!userId && req.body?.userId) {
      userId = Number(req.body.userId);
    }
    if (!username && req.body?.username) {
      username = String(req.body.username);
    }

    if (userId) {
      await pool.execute(
        `UPDATE users
         SET is_logged_in = 0, current_session_id = NULL, last_activity_at = NULL
         WHERE id = ?`,
        [userId]
      );

      terminateUserSockets(userId, "Logged out successfully.");

      await logAuditEvent({
        action: "USER_LOGOUT",
        performedById: userId,
        performedByUsername: username || "user",
        newValues: { logout_time: new Date().toISOString() },
        metadata: { ip: req.ip },
      });
    } else if (username) {
      await pool.execute(
        `UPDATE users
         SET is_logged_in = 0, current_session_id = NULL, last_activity_at = NULL
         WHERE username = ?`,
        [username]
      );
    }

    res.status(200).json({ message: "Logged out successfully." });
  } catch (err) {
    console.error("[auth/logout] Error:", err);
    res.status(200).json({ message: "Logged out." });
  }
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
// Silently renew a valid, non-expired JWT. Called by the client ~10 min before
// expiry so cashiers and admins never get force-logged-out mid-shift.
//
// The `authenticate` middleware already rejects expired tokens with 401, so no
// additional expiry check is needed here.
router.post("/refresh", authenticate, async (req: Request, res: Response) => {
  const user = req.user!;

  // mustChangePassword tokens are restricted 15-min tokens used only during
  // first-login password setup. They must not be refreshed into normal tokens.
  if ((user as any).mustChangePassword) {
    res.status(403).json({ message: "Password change required before token refresh." });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ message: "Server configuration error." });
    return;
  }

  // Update last_activity_at in DB
  pool.execute("UPDATE users SET is_logged_in = 1, last_activity_at = NOW() WHERE id = ?", [user.id]).catch(() => {});

  const newToken = jwt.sign(
    {
      id:          user.id,
      full_name:   user.full_name,
      username:    user.username,
      role:        user.role,
      employee_id: user.employee_id ?? null,
    },
    secret,
    { expiresIn: "12h" }
  );

  res.status(200).json({ token: newToken });
});

export default router;
