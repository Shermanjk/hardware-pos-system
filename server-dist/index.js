var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/db.ts
import mysql from "mysql2/promise";
var DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, pool;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    DB_HOST = process.env.DB_HOST;
    DB_PORT = process.env.DB_PORT;
    DB_USER = process.env.DB_USER;
    DB_PASSWORD = process.env.DB_PASSWORD;
    DB_NAME = process.env.DB_NAME;
    if (!DB_HOST || !DB_USER || DB_PASSWORD === void 0 || !DB_NAME) {
      throw new Error(
        "Missing required database environment variables: DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME must all be set in .env"
      );
    }
    pool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT ? Number(DB_PORT) : 3306,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }
});

// server/utils/auditLogger.ts
var auditLogger_exports = {};
__export(auditLogger_exports, {
  logAuditEvent: () => logAuditEvent
});
async function logAuditEvent(params) {
  const {
    action,
    performedById,
    performedByUsername,
    targetUserId = null,
    targetUsername = null,
    entityType = null,
    entityId = null,
    previousValues = null,
    newValues = null,
    reason = null,
    metadata = null
  } = params;
  try {
    await pool.execute(
      `INSERT INTO audit_logs
         (action, performed_by_id, performed_by_username,
          target_user_id, target_username,
          entity_type, entity_id,
          previous_values, new_values, reason, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        action,
        performedById,
        performedByUsername,
        targetUserId,
        targetUsername,
        entityType,
        entityId,
        previousValues !== null ? JSON.stringify(previousValues) : null,
        newValues !== null ? JSON.stringify(newValues) : null,
        reason,
        metadata !== null ? JSON.stringify(metadata) : null
      ]
    );
  } catch (err) {
    console.error("[auditLogger] Failed to write audit log:", err);
  }
}
var init_auditLogger = __esm({
  "server/utils/auditLogger.ts"() {
    "use strict";
    init_db();
  }
});

// server/index.ts
import "dotenv/config";
import express from "express";
import { createServer } from "http";

// server/ws.ts
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
var adminClients = /* @__PURE__ */ new Set();
var cashierClients = /* @__PURE__ */ new Map();
function initWebSocket(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const token = url.searchParams.get("token");
    const secret = process.env.JWT_SECRET;
    if (!token || !secret) {
      ws.close(1008, "Unauthorized");
      return;
    }
    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch {
      ws.close(1008, "Unauthorized");
      return;
    }
    if (payload.role === "Admin") {
      adminClients.add(ws);
      ws.on("close", () => adminClients.delete(ws));
    } else if (payload.role === "Cashier") {
      const uid = payload.id;
      if (!cashierClients.has(uid)) cashierClients.set(uid, /* @__PURE__ */ new Set());
      cashierClients.get(uid).add(ws);
      ws.on("close", () => {
        cashierClients.get(uid)?.delete(ws);
        if (cashierClients.get(uid)?.size === 0) cashierClients.delete(uid);
      });
    } else {
      ws.close(1008, "Forbidden");
    }
  });
}
function broadcastVoidRequest(notification) {
  const message = JSON.stringify(notification);
  for (const client of Array.from(adminClients)) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}
function broadcastReturnRequest(notification) {
  const message = JSON.stringify(notification);
  for (const client of Array.from(adminClients)) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}
function sendReturnDecision(notification) {
  const sockets = cashierClients.get(notification.cashier_user_id);
  if (!sockets) return;
  const message = JSON.stringify(notification);
  for (const client of Array.from(sockets)) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}
function sendVoidDecision(notification) {
  const sockets = cashierClients.get(notification.cashier_user_id);
  if (!sockets) return;
  const message = JSON.stringify(notification);
  for (const client of Array.from(sockets)) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

// server/index.ts
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// server/routes/auth.ts
init_db();
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt2 from "jsonwebtoken";
import { z } from "zod";
var router = Router();
var loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional().default(false)
});
router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request";
    res.status(400).json({ message });
    return;
  }
  const { username, password, rememberMe } = parsed.data;
  try {
    const [rows] = await pool.execute(
      `SELECT id, full_name, username, password_hash, role, employee_id,
              status, must_change_password
       FROM users
       WHERE username = ?
       LIMIT 1`,
      [username]
    );
    const user = rows[0];
    if (!user) {
      res.status(401).json({ message: "Invalid username or password." });
      return;
    }
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      res.status(401).json({ message: "Invalid username or password." });
      return;
    }
    if (user.status === "Inactive") {
      res.status(403).json({
        message: "Your account has been deactivated. Please contact your administrator."
      });
      return;
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("JWT_SECRET is not set");
      res.status(500).json({ message: "Server configuration error." });
      return;
    }
    const basePayload = {
      id: user.id,
      full_name: user.full_name,
      username: user.username,
      role: user.role,
      employee_id: user.employee_id ?? null
    };
    if (user.must_change_password) {
      const restrictedPayload = { ...basePayload, mustChangePassword: true };
      const restrictedToken = jwt2.sign(restrictedPayload, secret, {
        expiresIn: "15m"
      });
      res.status(200).json({
        token: restrictedToken,
        user: restrictedPayload
      });
      return;
    }
    const expiresIn = rememberMe ? "30d" : "12h";
    const token = jwt2.sign(basePayload, secret, { expiresIn });
    res.status(200).json({
      token,
      user: basePayload
    });
  } catch (err) {
    console.error("[auth/login] Unexpected error:", err);
    res.status(500).json({ message: "An unexpected error occurred. Please try again." });
  }
});
var auth_default = router;

// server/routes/users.ts
init_db();
import { Router as Router2 } from "express";
import bcrypt2 from "bcryptjs";
import jwt4 from "jsonwebtoken";
import { z as z2 } from "zod";

// server/middleware/authenticate.ts
import jwt3 from "jsonwebtoken";
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ message: "Server configuration error." });
    return;
  }
  try {
    const decoded = jwt3.verify(token, secret);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Unauthorized" });
  }
}

// server/utils/passwordGenerator.ts
import { randomBytes } from "crypto";
var UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
var LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
var DIGITS = "0123456789";
var ALL = UPPERCASE + LOWERCASE + DIGITS;
function secureRandInt(max) {
  const limit = 256 - 256 % max;
  let value;
  do {
    value = randomBytes(1)[0];
  } while (value >= limit);
  return value % max;
}
function secureShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function generateTempPassword() {
  const length = 10 + secureRandInt(3);
  const required = [
    UPPERCASE[secureRandInt(UPPERCASE.length)],
    LOWERCASE[secureRandInt(LOWERCASE.length)],
    DIGITS[secureRandInt(DIGITS.length)]
  ];
  const remaining = [];
  for (let i = required.length; i < length; i++) {
    remaining.push(ALL[secureRandInt(ALL.length)]);
  }
  return secureShuffle([...required, ...remaining]).join("");
}

// server/routes/users.ts
init_auditLogger();
var router2 = Router2();
router2.use(authenticate);
function requireAdmin(req, res) {
  if (req.user?.role !== "Admin") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}
var USER_COLS = `
  id, full_name, username, role, employee_id, status,
  must_change_password, password_changed_at, updated_at
`;
var createUserSchema = z2.object({
  full_name: z2.string().min(1, "Full name is required"),
  username: z2.string().min(1, "Username is required"),
  role: z2.enum(["Cashier", "Inventory Clerk"], { error: "Role must be Cashier or Inventory Clerk" }),
  status: z2.enum(["Active", "Inactive"], { error: "Status must be Active or Inactive" }),
  employee_id: z2.string().optional()
});
var updateUserSchema = z2.object({
  full_name: z2.string().min(1).optional(),
  role: z2.enum(["Cashier", "Inventory Clerk"]).optional(),
  status: z2.enum(["Active", "Inactive"]).optional(),
  employee_id: z2.string().optional()
});
var changePasswordSchema = z2.object({
  currentPassword: z2.string().min(1, "Current password is required"),
  newPassword: z2.string().min(8, "New password must be at least 8 characters"),
  confirmPassword: z2.string().min(1, "Please confirm your new password")
});
function validatePasswordComplexity(password) {
  const errors = [];
  if (!/[A-Z]/.test(password)) errors.push("Password must contain at least one uppercase letter.");
  if (!/[a-z]/.test(password)) errors.push("Password must contain at least one lowercase letter.");
  if (!/[0-9]/.test(password)) errors.push("Password must contain at least one number.");
  return errors;
}
router2.get("/", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const [rows] = await pool.execute(
      `SELECT ${USER_COLS} FROM users ORDER BY full_name ASC`
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error("[users/GET /] Unexpected error:", err);
    res.status(500).json({ message: "An unexpected error occurred. Please try again." });
  }
});
router2.post("/", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({
      field: String(i.path[0] ?? "general"),
      message: i.message
    }));
    res.status(422).json({ errors });
    return;
  }
  const { full_name, username, role, status, employee_id } = parsed.data;
  try {
    const [existing] = await pool.execute(
      "SELECT id FROM users WHERE username = ? LIMIT 1",
      [username]
    );
    if (existing.length > 0) {
      res.status(409).json({ message: "Username already exists." });
      return;
    }
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt2.hash(tempPassword, 10);
    const [result] = await pool.execute(
      `INSERT INTO users
         (full_name, username, password_hash, role, employee_id, status,
          must_change_password, password_changed_at)
       VALUES (?, ?, ?, ?, ?, ?, TRUE, NULL)`,
      [full_name, username, passwordHash, role, employee_id || null, status]
    );
    const newUserId = result.insertId;
    const [newRows] = await pool.execute(
      `SELECT ${USER_COLS} FROM users WHERE id = ? LIMIT 1`,
      [newUserId]
    );
    await logAuditEvent({
      action: "account_created",
      performedById: req.user.id,
      performedByUsername: req.user.username,
      targetUserId: newUserId,
      targetUsername: username
    });
    res.status(201).json({
      user: newRows[0],
      tempPassword
    });
  } catch (err) {
    console.error("[users/POST /] Unexpected error:", err);
    res.status(500).json({ message: "An unexpected error occurred. Please try again." });
  }
});
router2.put("/:id", async (req, res) => {
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
      message: i.message
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
    const setClauses = ["updated_at = NOW()"];
    const values = [];
    if (updates.full_name !== void 0) {
      setClauses.push("full_name = ?");
      values.push(updates.full_name);
    }
    if (updates.role !== void 0) {
      setClauses.push("role = ?");
      values.push(updates.role);
    }
    if (updates.status !== void 0) {
      setClauses.push("status = ?");
      values.push(updates.status);
    }
    if (updates.employee_id !== void 0) {
      setClauses.push("employee_id = ?");
      values.push(updates.employee_id);
    }
    values.push(userId);
    await pool.execute(
      `UPDATE users SET ${setClauses.join(", ")} WHERE id = ?`,
      values
    );
    const [rows] = await pool.execute(
      `SELECT ${USER_COLS} FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ message: "User not found." });
      return;
    }
    const updatedUser = rows[0];
    const isRoleChange = updates.role !== void 0;
    await logAuditEvent({
      action: isRoleChange ? "USER_ROLE_CHANGED" : "USER_UPDATED",
      performedById: req.user.id,
      performedByUsername: req.user.username,
      targetUserId: userId,
      targetUsername: updatedUser.username,
      newValues: updates
    });
    res.status(200).json(rows[0]);
  } catch (err) {
    console.error("[users/PUT /:id] Unexpected error:", err);
    res.status(500).json({ message: "An unexpected error occurred. Please try again." });
  }
});
router2.post("/:id/reset-password", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ message: "Invalid user ID." });
    return;
  }
  try {
    const [targetRows] = await pool.execute(
      "SELECT id, username FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    if (targetRows.length === 0) {
      res.status(404).json({ message: "User not found." });
      return;
    }
    const targetUser = targetRows[0];
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt2.hash(tempPassword, 10);
    await pool.execute(
      `UPDATE users
       SET password_hash = ?, must_change_password = TRUE,
           password_changed_at = NULL, updated_at = NOW()
       WHERE id = ?`,
      [passwordHash, userId]
    );
    await logAuditEvent({
      action: "password_reset",
      performedById: req.user.id,
      performedByUsername: req.user.username,
      targetUserId: userId,
      targetUsername: targetUser.username
    });
    res.status(200).json({ tempPassword });
  } catch (err) {
    console.error("[users/POST /:id/reset-password] Unexpected error:", err);
    res.status(500).json({ message: "An unexpected error occurred. Please try again." });
  }
});
router2.post("/:id/deactivate", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ message: "Invalid user ID." });
    return;
  }
  try {
    const [targetRows] = await pool.execute(
      "SELECT id, username FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    if (targetRows.length === 0) {
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
      performedById: req.user.id,
      performedByUsername: req.user.username,
      targetUserId: userId,
      targetUsername: targetUser.username
    });
    const [rows] = await pool.execute(
      `SELECT ${USER_COLS} FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    res.status(200).json(rows[0]);
  } catch (err) {
    console.error("[users/POST /:id/deactivate] Unexpected error:", err);
    res.status(500).json({ message: "An unexpected error occurred. Please try again." });
  }
});
router2.post("/:id/change-password", async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ message: "Invalid user ID." });
    return;
  }
  if (req.user.id !== userId) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({
      field: String(i.path[0] ?? "general"),
      message: i.message
    }));
    res.status(422).json({ errors });
    return;
  }
  const { currentPassword, newPassword, confirmPassword } = parsed.data;
  if (newPassword !== confirmPassword) {
    res.status(422).json({
      errors: [{ field: "confirmPassword", message: "Passwords do not match." }]
    });
    return;
  }
  const complexityErrors = validatePasswordComplexity(newPassword);
  if (complexityErrors.length > 0) {
    res.status(422).json({
      errors: complexityErrors.map((msg) => ({ field: "newPassword", message: msg }))
    });
    return;
  }
  try {
    const [rows] = await pool.execute(
      "SELECT password_hash, username FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ message: "User not found." });
      return;
    }
    const user = rows[0];
    const passwordMatch = await bcrypt2.compare(currentPassword, user.password_hash);
    if (!passwordMatch) {
      res.status(422).json({
        errors: [{ field: "currentPassword", message: "Current password is incorrect." }]
      });
      return;
    }
    const newHash = await bcrypt2.hash(newPassword, 10);
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
      targetUsername: user.username
    });
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ message: "Server configuration error." });
      return;
    }
    const newPayload = {
      id: req.user.id,
      full_name: req.user.full_name,
      username: req.user.username,
      role: req.user.role,
      employee_id: req.user.employee_id
    };
    const newToken = jwt4.sign(newPayload, secret, { expiresIn: "8h" });
    res.status(200).json({ token: newToken, user: newPayload });
  } catch (err) {
    console.error("[users/POST /:id/change-password] Unexpected error:", err);
    res.status(500).json({ message: "An unexpected error occurred. Please try again." });
  }
});
var users_default = router2;

// server/routes/auditLogs.ts
init_db();
import { Router as Router3 } from "express";
import { z as z3 } from "zod";
var router3 = Router3();
router3.use(authenticate);
function requireAdmin2(req, res) {
  if (req.user?.role !== "Admin") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}
var paginationSchema = z3.object({
  page: z3.coerce.number().int().min(1).optional().default(1),
  pageSize: z3.coerce.number().int().min(1).max(100).optional().default(20)
});
router3.get("/", async (req, res) => {
  if (!requireAdmin2(req, res)) return;
  const parsed = paginationSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid pagination parameters." });
    return;
  }
  const { page, pageSize } = parsed.data;
  const offset = (page - 1) * pageSize;
  try {
    const [countRows] = await pool.execute(
      "SELECT COUNT(*) AS total FROM audit_logs"
    );
    const total = countRows[0]?.total ?? 0;
    const [entries] = await pool.execute(
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
var auditLogs_default = router3;

// server/routes/sales.ts
init_db();
import { Router as Router4 } from "express";

// server/middleware/requireRole.ts
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    next();
  };
}

// server/utils/invoiceNumber.ts
async function generateInvoiceNumber(conn) {
  const [rows] = await conn.execute(
    `SELECT id, prefix, current_number FROM invoice_sequences WHERE prefix = 'INV' LIMIT 1 FOR UPDATE`
  );
  if (!rows[0]) {
    throw new Error("Invoice sequence row not found. Run migration 010.");
  }
  const next = rows[0].current_number + 1;
  const prefix = rows[0].prefix;
  await conn.execute(
    `UPDATE invoice_sequences SET current_number = ?, updated_at = NOW() WHERE id = ?`,
    [next, rows[0].id]
  );
  return `${prefix}-${String(next).padStart(6, "0")}`;
}
async function generateReturnNumber(conn) {
  const [rows] = await conn.execute(
    `SELECT id, prefix, current_number FROM invoice_sequences WHERE prefix = 'RTN' LIMIT 1 FOR UPDATE`
  );
  if (!rows[0]) {
    throw new Error("Return sequence row not found. Run migration 010.");
  }
  const next = rows[0].current_number + 1;
  const prefix = rows[0].prefix;
  await conn.execute(
    `UPDATE invoice_sequences SET current_number = ?, updated_at = NOW() WHERE id = ?`,
    [next, rows[0].id]
  );
  return `${prefix}-${String(next).padStart(6, "0")}`;
}

// server/routes/sales.ts
init_auditLogger();
import { z as z4 } from "zod";
var router4 = Router4();
var createSaleSchema = z4.object({
  customer_name: z4.string().min(1),
  customer_address: z4.string().optional(),
  customer_tin: z4.string().optional(),
  // Frontend totals accepted for schema validation but NOT used as stored values —
  // the backend recalculates all totals from DB product data.
  subtotal: z4.number().min(0),
  vat_amount: z4.number().min(0),
  total_amount: z4.number().min(0),
  cash_tendered: z4.number().positive(),
  change_amount: z4.number().min(0),
  // client_transaction_id provides idempotency — if the same key is sent twice,
  // the second request returns the existing sale instead of creating a duplicate.
  // This prevents duplicate sales after network retry, browser refresh, or power outage.
  client_transaction_id: z4.string().min(1).optional(),
  items: z4.array(z4.object({
    product_id: z4.number().int().positive(),
    quantity: z4.number().int().positive(),
    // unit_price / subtotal / tax_* from frontend are display hints only;
    // backend derives authoritative values from the products table.
    unit_price: z4.number().positive(),
    subtotal: z4.number().positive(),
    tax_type: z4.enum(["VATABLE", "VAT_EXEMPT", "ZERO_RATED", "NON_TAXABLE"]).optional(),
    tax_rate: z4.number().min(0).max(100).optional(),
    taxable_amount: z4.number().min(0).optional(),
    vat_amount: z4.number().min(0).optional()
  })).min(1)
});
var voidRequestSchema = z4.object({
  reason: z4.string().min(1, "Reason is required")
});
var voidDecisionSchema = z4.object({
  rejection_reason: z4.string().optional()
});
router4.post(
  "/",
  authenticate,
  requireRole("Cashier"),
  async (req, res) => {
    const parsed = createSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message
      }));
      res.status(400).json({ message: errors[0]?.message ?? "Invalid request", errors });
      return;
    }
    const {
      customer_name,
      customer_address,
      customer_tin,
      cash_tendered,
      items
    } = parsed.data;
    const clientTxnId = parsed.data.client_transaction_id;
    if (clientTxnId) {
      try {
        const [existing] = await pool.execute(
          `SELECT id, invoice_number, subtotal, vat_amount, total_amount, change_amount,
                  payment_status, receipt_printed
           FROM sales WHERE client_transaction_id = ? LIMIT 1`,
          [clientTxnId]
        );
        if (existing.length > 0) {
          const sale = existing[0];
          console.log(`[IDEMPOTENCY] Duplicate client_transaction_id: ${clientTxnId}, returning existing sale ${sale.invoice_number}`);
          const [itemRows] = await pool.execute(
            `SELECT product_id, tax_type, taxable_amount, vat_amount, subtotal AS line_subtotal
             FROM sale_items WHERE sale_id = ?`,
            [sale.id]
          );
          res.status(200).json({
            id: sale.id,
            invoice_number: sale.invoice_number,
            subtotal: Number(sale.subtotal),
            vat_amount: Number(sale.vat_amount),
            total_amount: Number(sale.total_amount),
            change_amount: Number(sale.change_amount),
            payment_status: sale.payment_status,
            receipt_printed: sale.receipt_printed === 1 || sale.receipt_printed === true,
            items: itemRows.map((r) => ({
              product_id: r.product_id,
              tax_type: r.tax_type,
              taxable_amount: Number(r.taxable_amount),
              vat_amount: Number(r.vat_amount),
              line_subtotal: Number(r.line_subtotal)
            })),
            // Flag to indicate this is a duplicate/idempotent response
            _idempotent: true
          });
          return;
        }
      } catch (err) {
        console.warn("[IDEMPOTENCY] Check failed (column may not exist yet):", err);
      }
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [settingsRows] = await conn.execute(
        `SELECT tax_rate, vat_registered FROM store_settings WHERE id = 1 LIMIT 1`
      );
      const dbTaxRate = Number(settingsRows[0]?.tax_rate ?? 12);
      const dbVatActive = settingsRows[0]?.vat_registered === true || settingsRows[0]?.vat_registered === 1;
      const productData = {};
      for (const item of items) {
        const [rows] = await conn.execute(
          `SELECT quantity, product_name AS name, tax_type, selling_price
           FROM products WHERE id = ? FOR UPDATE`,
          [item.product_id]
        );
        const product = rows[0];
        if (!product || product.quantity < item.quantity) {
          await conn.rollback();
          const name = product?.name ?? `ID ${item.product_id}`;
          res.status(409).json({ message: `Insufficient stock for product: ${name}.` });
          return;
        }
        productData[item.product_id] = {
          name: product.name,
          tax_type: product.tax_type ?? "VATABLE",
          selling_price: Number(product.selling_price)
        };
      }
      const calcItems = items.map((item) => {
        const p = productData[item.product_id];
        const unit_price = p.selling_price;
        const line_subtotal = Math.round(unit_price * item.quantity * 100) / 100;
        const taxType = p.tax_type;
        const isVatable = taxType === "VATABLE" && dbVatActive;
        const taxRate = isVatable ? dbTaxRate : 0;
        const taxDivisor = 1 + taxRate / 100;
        const taxableAmt = isVatable ? Math.round(line_subtotal / taxDivisor * 100) / 100 : line_subtotal;
        const vatAmt = isVatable ? Math.round((line_subtotal - taxableAmt) * 100) / 100 : 0;
        return {
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price,
          line_subtotal,
          tax_type: taxType,
          tax_rate: taxRate,
          taxable_amount: taxableAmt,
          vat_amount: vatAmt
        };
      });
      const calc_total_amount = Math.round(
        calcItems.reduce((s, i) => s + i.line_subtotal, 0) * 100
      ) / 100;
      const calc_vat_amount = Math.round(
        calcItems.reduce((s, i) => s + i.vat_amount, 0) * 100
      ) / 100;
      const calc_subtotal = Math.round((calc_total_amount - calc_vat_amount) * 100) / 100;
      const calc_change = Math.round((cash_tendered - calc_total_amount) * 100) / 100;
      const invoice_number = await generateInvoiceNumber(conn);
      const [saleResult] = await conn.execute(
        `INSERT INTO sales
           (invoice_number, customer_name, customer_address, customer_tin,
            cashier_id, subtotal, vat_amount, total_amount, cash_tendered, change_amount,
            payment_status, client_transaction_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [
          invoice_number,
          customer_name,
          customer_address ?? null,
          customer_tin ?? null,
          req.user.id,
          calc_subtotal,
          calc_vat_amount,
          calc_total_amount,
          cash_tendered,
          calc_change >= 0 ? calc_change : 0,
          clientTxnId ?? null
        ]
      );
      const sale_id = saleResult.insertId;
      for (const ci of calcItems) {
        await conn.execute(
          `INSERT INTO sale_items
             (sale_id, product_id, quantity, unit_price, subtotal,
              tax_type, tax_rate, taxable_amount, vat_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sale_id,
            ci.product_id,
            ci.quantity,
            ci.unit_price,
            ci.line_subtotal,
            ci.tax_type,
            ci.tax_rate,
            ci.taxable_amount,
            ci.vat_amount
          ]
        );
        await conn.execute(
          `UPDATE products SET quantity = quantity - ? WHERE id = ?`,
          [ci.quantity, ci.product_id]
        );
        await conn.execute(
          `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, reference, user_id)
           VALUES (?, 'Sale', 'sale', ?, ?, ?)`,
          [ci.product_id, -ci.quantity, invoice_number, req.user.id]
        );
      }
      await conn.commit();
      try {
        await pool.execute(
          `UPDATE sales SET payment_status = 'completed' WHERE id = ? AND payment_status = 'pending'`,
          [sale_id]
        );
      } catch (updateErr) {
        console.warn(`[SALES] Failed to update payment_status for sale ${sale_id}:`, updateErr);
      }
      await logAuditEvent({
        action: "SALE_COMPLETED",
        performedById: req.user.id,
        performedByUsername: req.user.username,
        entityType: "sales",
        entityId: sale_id,
        newValues: { invoice_number, total_amount: calc_total_amount, customer_name }
      });
      res.status(201).json({
        invoice_number,
        id: sale_id,
        subtotal: calc_subtotal,
        vat_amount: calc_vat_amount,
        total_amount: calc_total_amount,
        change_amount: calc_change >= 0 ? calc_change : 0,
        payment_status: "completed",
        receipt_printed: false,
        // Per-item tax snapshot — used by the receipt for authoritative VAT breakdown
        items: calcItems.map((ci) => ({
          product_id: ci.product_id,
          tax_type: ci.tax_type,
          taxable_amount: ci.taxable_amount,
          vat_amount: ci.vat_amount,
          line_subtotal: ci.line_subtotal
        }))
      });
    } catch (err) {
      await conn.rollback();
      console.error("[POST /api/sales] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);
router4.patch(
  "/:id/mark-receipt-printed",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req, res) => {
    const saleId = Number(req.params.id);
    if (!Number.isInteger(saleId) || saleId <= 0) {
      res.status(400).json({ message: "Invalid sale ID." });
      return;
    }
    try {
      const [result] = await pool.execute(
        `UPDATE sales SET receipt_printed = 1 WHERE id = ? AND receipt_printed = 0`,
        [saleId]
      );
      if (result.affectedRows === 0) {
        const [check] = await pool.execute(
          `SELECT id, receipt_printed FROM sales WHERE id = ? LIMIT 1`,
          [saleId]
        );
        if (check.length === 0) {
          res.status(404).json({ message: "Sale not found." });
          return;
        }
        res.status(200).json({ message: "Receipt already marked as printed.", receipt_printed: true });
        return;
      }
      res.status(200).json({ message: "Receipt marked as printed.", receipt_printed: true });
    } catch (err) {
      console.error("[PATCH /api/sales/:id/mark-receipt-printed] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);
router4.get(
  "/recovery/pending",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (_req, res) => {
    try {
      const [pendingSales] = await pool.execute(
        `SELECT s.id, s.invoice_number, s.customer_name, s.total_amount,
                s.cash_tendered, s.change_amount, s.payment_status, s.receipt_printed,
                s.created_at, u.full_name AS cashier_name
         FROM sales s
         JOIN users u ON u.id = s.cashier_id
         WHERE s.payment_status = 'pending'
         ORDER BY s.created_at DESC
         LIMIT 50`
      );
      const [unprintedSales] = await pool.execute(
        `SELECT s.id, s.invoice_number, s.customer_name, s.total_amount,
                s.cash_tendered, s.change_amount, s.payment_status, s.receipt_printed,
                s.created_at, u.full_name AS cashier_name
         FROM sales s
         JOIN users u ON u.id = s.cashier_id
         WHERE s.payment_status = 'completed' AND s.receipt_printed = 0
         ORDER BY s.created_at DESC
         LIMIT 50`
      );
      res.status(200).json({
        pending_payment: pendingSales.map((r) => ({
          ...r,
          total_amount: Number(r.total_amount),
          cash_tendered: Number(r.cash_tendered),
          change_amount: Number(r.change_amount)
        })),
        completed_unprinted: unprintedSales.map((r) => ({
          ...r,
          total_amount: Number(r.total_amount),
          cash_tendered: Number(r.cash_tendered),
          change_amount: Number(r.change_amount)
        }))
      });
    } catch (err) {
      console.error("[GET /api/sales/recovery/pending] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);
router4.patch(
  "/recovery/:id/fix-payment-status",
  authenticate,
  requireRole("Admin"),
  async (req, res) => {
    const saleId = Number(req.params.id);
    if (!Number.isInteger(saleId) || saleId <= 0) {
      res.status(400).json({ message: "Invalid sale ID." });
      return;
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [saleRows] = await conn.execute(
        `SELECT id, invoice_number, payment_status, total_amount
         FROM sales WHERE id = ? FOR UPDATE`,
        [saleId]
      );
      if (saleRows.length === 0) {
        await conn.rollback();
        res.status(404).json({ message: "Sale not found." });
        return;
      }
      const sale = saleRows[0];
      if (sale.payment_status !== "pending") {
        await conn.rollback();
        res.status(422).json({ message: `Sale ${sale.invoice_number} already has payment_status: ${sale.payment_status}` });
        return;
      }
      const [itemCheck] = await conn.execute(
        `SELECT COUNT(*) AS cnt FROM sale_items WHERE sale_id = ?`,
        [saleId]
      );
      if (itemCheck[0].cnt === 0) {
        await conn.rollback();
        res.status(422).json({ message: "Sale has no items. This sale was not fully committed. Consider deleting it." });
        return;
      }
      await conn.execute(
        `UPDATE sales SET payment_status = 'completed' WHERE id = ?`,
        [saleId]
      );
      await conn.commit();
      await logAuditEvent({
        action: "SALE_PAYMENT_STATUS_FIXED",
        performedById: req.user.id,
        performedByUsername: req.user.username,
        entityType: "sales",
        entityId: saleId,
        newValues: { invoice_number: sale.invoice_number, payment_status: "completed" }
      });
      res.status(200).json({
        message: `Sale ${sale.invoice_number} payment status fixed to 'completed'.`,
        invoice_number: sale.invoice_number
      });
    } catch (err) {
      await conn.rollback();
      console.error("[PATCH /api/sales/recovery/:id/fix-payment-status] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    } finally {
      conn.release();
    }
  }
);
router4.post(
  "/:id/void-request",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req, res) => {
    const saleId = Number(req.params.id);
    if (!Number.isInteger(saleId) || saleId <= 0) {
      res.status(400).json({ message: "Invalid sale ID." });
      return;
    }
    const parsed = voidRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      return;
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute(
        `SELECT id, invoice_number, void_status, customer_name, total_amount FROM sales WHERE id = ? FOR UPDATE`,
        [saleId]
      );
      const sale = rows[0];
      if (!sale) {
        await conn.rollback();
        res.status(404).json({ message: "Sale not found." });
        return;
      }
      if (sale.void_status !== "active") {
        await conn.rollback();
        res.status(422).json({ message: "This sale already has a void request or has been voided." });
        return;
      }
      await conn.execute(
        `UPDATE sales SET void_status = 'void_requested' WHERE id = ?`,
        [saleId]
      );
      const [voidResult] = await conn.execute(
        `INSERT INTO sale_voids (sale_id, requested_by, reason, status) VALUES (?, ?, ?, 'pending')`,
        [saleId, req.user.id, parsed.data.reason]
      );
      await conn.commit();
      await logAuditEvent({
        action: "SALE_VOID_REQUESTED",
        performedById: req.user.id,
        performedByUsername: req.user.username,
        entityType: "sales",
        entityId: saleId,
        reason: parsed.data.reason,
        newValues: { invoice_number: sale.invoice_number, void_request_id: voidResult.insertId }
      });
      res.status(201).json({ message: "Void request submitted.", void_id: voidResult.insertId });
      broadcastVoidRequest({
        type: "void_request",
        void_id: voidResult.insertId,
        sale_id: saleId,
        invoice_number: sale.invoice_number,
        cashier_name: req.user.full_name ?? req.user.username,
        cashier_user_id: req.user.id,
        customer_name: sale.customer_name,
        total_amount: Number(sale.total_amount),
        reason: parsed.data.reason,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (err) {
      await conn.rollback();
      console.error("[POST /api/sales/:id/void-request] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);
router4.patch(
  "/:id/void-approve",
  authenticate,
  requireRole("Admin"),
  async (req, res) => {
    const voidId = Number(req.params.id);
    if (!Number.isInteger(voidId) || voidId <= 0) {
      res.status(400).json({ message: "Invalid void request ID." });
      return;
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute(
        `SELECT sv.id, sv.sale_id, sv.status, sv.reason, s.invoice_number
         FROM sale_voids sv JOIN sales s ON s.id = sv.sale_id
         WHERE sv.id = ? FOR UPDATE`,
        [voidId]
      );
      const voidRow = rows[0];
      if (!voidRow) {
        await conn.rollback();
        res.status(404).json({ message: "Void request not found." });
        return;
      }
      if (voidRow.status !== "pending") {
        await conn.rollback();
        res.status(422).json({ message: "Only pending void requests can be approved." });
        return;
      }
      const [saleItems] = await conn.execute(
        `SELECT product_id, quantity FROM sale_items WHERE sale_id = ?`,
        [voidRow.sale_id]
      );
      for (const item of saleItems) {
        await conn.execute(
          `UPDATE products SET quantity = quantity + ? WHERE id = ?`,
          [item.quantity, item.product_id]
        );
        await conn.execute(
          `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, reference, user_id)
           VALUES (?, 'Void', 'void_restore', ?, ?, ?)`,
          [item.product_id, item.quantity, voidRow.invoice_number, req.user.id]
        );
      }
      await conn.execute(
        `UPDATE sale_voids SET status = 'approved', approved_by = ?, resolved_at = NOW() WHERE id = ?`,
        [req.user.id, voidId]
      );
      await conn.execute(
        `UPDATE sales SET void_status = 'voided' WHERE id = ?`,
        [voidRow.sale_id]
      );
      await conn.commit();
      await logAuditEvent({
        action: "SALE_VOIDED",
        performedById: req.user.id,
        performedByUsername: req.user.username,
        entityType: "sales",
        entityId: voidRow.sale_id,
        reason: voidRow.reason,
        newValues: { invoice_number: voidRow.invoice_number, void_request_id: voidId }
      });
      const [cashierRow] = await pool.execute(
        `SELECT s.cashier_id, s.total_amount FROM sales s WHERE s.id = ?`,
        [voidRow.sale_id]
      );
      if (cashierRow[0]) {
        const { cashier_id, total_amount } = cashierRow[0];
        sendVoidDecision({
          type: "void_decision",
          void_id: voidId,
          sale_id: voidRow.sale_id,
          invoice_number: voidRow.invoice_number,
          total_amount: Number(total_amount),
          decision: "approved",
          admin_name: req.user.full_name ?? req.user.username,
          rejection_reason: null,
          cashier_user_id: cashier_id
        });
      }
      res.status(200).json({ message: "Sale voided successfully." });
    } catch (err) {
      await conn.rollback();
      console.error("[PATCH /api/sales/:id/void-approve] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);
router4.patch(
  "/:id/void-reject",
  authenticate,
  requireRole("Admin"),
  async (req, res) => {
    const voidId = Number(req.params.id);
    if (!Number.isInteger(voidId) || voidId <= 0) {
      res.status(400).json({ message: "Invalid void request ID." });
      return;
    }
    const parsed = voidDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid request." });
      return;
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute(
        `SELECT sv.id, sv.sale_id, sv.status, s.invoice_number
         FROM sale_voids sv JOIN sales s ON s.id = sv.sale_id
         WHERE sv.id = ? FOR UPDATE`,
        [voidId]
      );
      const voidRow = rows[0];
      if (!voidRow) {
        await conn.rollback();
        res.status(404).json({ message: "Void request not found." });
        return;
      }
      if (voidRow.status !== "pending") {
        await conn.rollback();
        res.status(422).json({ message: "Only pending void requests can be rejected." });
        return;
      }
      await conn.execute(
        `UPDATE sale_voids SET status = 'rejected', approved_by = ?, resolved_at = NOW(), rejection_reason = ? WHERE id = ?`,
        [req.user.id, parsed.data.rejection_reason ?? null, voidId]
      );
      await conn.execute(
        `UPDATE sales SET void_status = 'active' WHERE id = ?`,
        [voidRow.sale_id]
      );
      await conn.commit();
      await logAuditEvent({
        action: "SALE_CANCELLATION_REJECTED",
        performedById: req.user.id,
        performedByUsername: req.user.username,
        entityType: "sales",
        entityId: voidRow.sale_id,
        reason: parsed.data.rejection_reason,
        newValues: { invoice_number: voidRow.invoice_number, void_request_id: voidId }
      });
      const [cashierRowR] = await pool.execute(
        `SELECT s.cashier_id, s.total_amount FROM sales s WHERE s.id = ?`,
        [voidRow.sale_id]
      );
      if (cashierRowR[0]) {
        const { cashier_id, total_amount } = cashierRowR[0];
        sendVoidDecision({
          type: "void_decision",
          void_id: voidId,
          sale_id: voidRow.sale_id,
          invoice_number: voidRow.invoice_number,
          total_amount: Number(total_amount),
          decision: "rejected",
          admin_name: req.user.full_name ?? req.user.username,
          rejection_reason: parsed.data.rejection_reason ?? null,
          cashier_user_id: cashier_id
        });
      }
      res.status(200).json({ message: "Void request rejected." });
    } catch (err) {
      await conn.rollback();
      console.error("[PATCH /api/sales/:id/void-reject] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);
router4.get(
  "/",
  authenticate,
  requireRole("Admin", "Cashier"),
  async (req, res) => {
    const {
      invoice_number,
      customer_name,
      date_from,
      date_to,
      cashier_id,
      void_status,
      payment_status
    } = req.query;
    try {
      const conditions = [];
      const params = [];
      if (invoice_number) {
        conditions.push("s.invoice_number LIKE ?");
        params.push(`%${invoice_number}%`);
      }
      if (customer_name) {
        conditions.push("s.customer_name LIKE ?");
        params.push(`%${customer_name}%`);
      }
      if (date_from) {
        conditions.push("DATE(s.created_at) >= ?");
        params.push(date_from);
      }
      if (date_to) {
        conditions.push("DATE(s.created_at) <= ?");
        params.push(date_to);
      }
      if (cashier_id && /^\d+$/.test(cashier_id)) {
        conditions.push("s.cashier_id = ?");
        params.push(parseInt(cashier_id, 10));
      }
      if (void_status && ["active", "void_requested", "voided"].includes(void_status)) {
        conditions.push("s.void_status = ?");
        params.push(void_status);
      }
      if (payment_status && ["pending", "completed"].includes(payment_status)) {
        conditions.push("s.payment_status = ?");
        params.push(payment_status);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const [rows] = await pool.execute(
        `SELECT s.id, s.invoice_number, s.customer_name, s.customer_address,
                s.customer_tin, s.cashier_id, u.full_name AS cashier_name,
                s.subtotal, s.vat_amount, s.total_amount, s.cash_tendered,
                s.change_amount, s.void_status, s.payment_status, s.receipt_printed, s.created_at
         FROM sales s
         JOIN users u ON u.id = s.cashier_id
         ${where}
         ORDER BY s.created_at DESC
         LIMIT 200`,
        params
      );
      res.status(200).json(rows);
    } catch (err) {
      console.error("[GET /api/sales] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    }
  }
);
router4.get(
  "/my-void-requests",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req, res) => {
    try {
      const [rows] = await pool.execute(
        `SELECT sv.id, sv.sale_id, s.invoice_number, s.customer_name,
                s.total_amount, sv.reason, sv.status, sv.rejection_reason,
                u2.full_name AS approved_by_name,
                sv.created_at, sv.resolved_at
         FROM sale_voids sv
         JOIN sales s  ON s.id  = sv.sale_id
         LEFT JOIN users u2 ON u2.id = sv.approved_by
         WHERE sv.requested_by = ?
         ORDER BY sv.created_at DESC
         LIMIT 50`,
        [req.user.id]
      );
      const saleIds = rows.map((r) => r.sale_id);
      const [allItems] = await pool.execute(
        `SELECT si.sale_id, si.quantity, si.unit_price, si.subtotal,
                p.product_name,
                COALESCE(u.abbreviation, '') AS unit
         FROM sale_items si
         JOIN products p ON p.id = si.product_id
         LEFT JOIN units u ON u.id = p.unit_id
         WHERE si.sale_id IN (${saleIds.length ? saleIds.map(() => "?").join(",") : "0"})`,
        saleIds
      );
      const itemsBySaleId = {};
      for (const item of allItems) {
        if (!itemsBySaleId[item.sale_id]) itemsBySaleId[item.sale_id] = [];
        itemsBySaleId[item.sale_id].push({
          product_name: item.product_name,
          unit: item.unit,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          subtotal: Number(item.subtotal)
        });
      }
      const result = rows.map((row) => ({
        ...row,
        total_amount: Number(row.total_amount),
        items: itemsBySaleId[row.sale_id] || []
      }));
      res.status(200).json(result);
    } catch (err) {
      console.error("[GET /api/sales/my-void-requests] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    }
  }
);
router4.get(
  "/void-requests",
  authenticate,
  requireRole("Admin"),
  async (req, res) => {
    try {
      const [rows] = await pool.execute(
        `SELECT sv.id, sv.sale_id, s.invoice_number, s.customer_name,
                s.total_amount, sv.reason, sv.status,
                u1.full_name AS requested_by_name,
                u2.full_name AS approved_by_name,
                sv.rejection_reason,
                sv.created_at, sv.resolved_at
         FROM sale_voids sv
         JOIN sales s  ON s.id  = sv.sale_id
         JOIN users u1 ON u1.id = sv.requested_by
         LEFT JOIN users u2 ON u2.id = sv.approved_by
         ORDER BY sv.created_at DESC
         LIMIT 100`
      );
      const saleIds = rows.map((r) => r.sale_id);
      const [allItems] = await pool.execute(
        `SELECT si.sale_id, si.quantity, si.unit_price, si.subtotal,
                p.product_name,
                COALESCE(u.abbreviation, '') AS unit
         FROM sale_items si
         JOIN products p ON p.id = si.product_id
         LEFT JOIN units u ON u.id = p.unit_id
         WHERE si.sale_id IN (${saleIds.length ? saleIds.map(() => "?").join(",") : "0"})`,
        saleIds
      );
      const itemsBySaleId = {};
      for (const item of allItems) {
        if (!itemsBySaleId[item.sale_id]) itemsBySaleId[item.sale_id] = [];
        itemsBySaleId[item.sale_id].push({
          product_name: item.product_name,
          unit: item.unit,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          subtotal: Number(item.subtotal)
        });
      }
      const result = rows.map((row) => ({
        ...row,
        total_amount: Number(row.total_amount),
        items: itemsBySaleId[row.sale_id] || []
      }));
      res.status(200).json(result);
    } catch (err) {
      console.error("[GET /api/sales/void-requests] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    }
  }
);
router4.get(
  "/:invoiceNumber",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req, res) => {
    const { invoiceNumber } = req.params;
    try {
      const [saleRows] = await pool.execute(
        `SELECT s.id, s.invoice_number, s.customer_name, s.customer_address,
                s.customer_tin, s.cashier_id, u.full_name AS cashier_name,
                s.subtotal, s.vat_amount, s.total_amount, s.cash_tendered,
                s.change_amount, s.void_status, s.payment_status, s.receipt_printed, s.created_at
         FROM sales s
         JOIN users u ON u.id = s.cashier_id
         WHERE s.invoice_number = ?
         LIMIT 1`,
        [invoiceNumber]
      );
      const sale = saleRows[0];
      if (!sale) {
        res.status(404).json({ message: "Invoice not found." });
        return;
      }
      const [itemRows] = await pool.execute(
        `SELECT
           si.id, si.sale_id, si.product_id,
           p.product_name, p.barcode, p.is_returnable,
           si.quantity, si.unit_price, si.subtotal,
           si.tax_type, si.tax_rate, si.taxable_amount, si.vat_amount AS item_vat_amount,
           (
             SELECT COALESCE(SUM(ri.quantity_returned), 0)
             FROM return_items ri
             JOIN returns r ON ri.return_id = r.id
             WHERE ri.sale_item_id = si.id
               AND r.status IN ('pending', 'approved')
           ) AS quantity_returned
         FROM sale_items si
         JOIN products p ON p.id = si.product_id
         WHERE si.sale_id = ?`,
        [sale.id]
      );
      res.status(200).json({
        ...sale,
        subtotal: Number(sale.subtotal),
        vat_amount: Number(sale.vat_amount),
        total_amount: Number(sale.total_amount),
        cash_tendered: Number(sale.cash_tendered),
        change_amount: Number(sale.change_amount),
        payment_status: sale.payment_status,
        receipt_printed: sale.receipt_printed === 1 || sale.receipt_printed === true,
        items: itemRows.map((r) => ({
          ...r,
          unit_price: Number(r.unit_price),
          subtotal: Number(r.subtotal),
          tax_rate: Number(r.tax_rate),
          taxable_amount: Number(r.taxable_amount),
          item_vat_amount: Number(r.item_vat_amount),
          quantity_returned: Number(r.quantity_returned)
        }))
      });
    } catch (err) {
      console.error("[GET /api/sales/:invoiceNumber] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    }
  }
);
var sales_default = router4;

// server/routes/returns.ts
init_db();
import { Router as Router5 } from "express";
import { z as z5 } from "zod";

// server/utils/validateReturn.ts
async function validateReturnItems(conn, saleId, items, currentDate) {
  const [saleRows] = await conn.execute(
    `SELECT id, created_at FROM sales WHERE id = ?`,
    [saleId]
  );
  if (!saleRows[0]) {
    return { valid: false, message: "Invoice not found.", status: 404 };
  }
  const saleDate = new Date(saleRows[0].created_at);
  const expiryDate = new Date(saleDate);
  expiryDate.setDate(expiryDate.getDate() + 7);
  if (currentDate > expiryDate) {
    const expStr = expiryDate.toLocaleDateString("en-PH");
    return {
      valid: false,
      message: `Return window has expired. Expiry: ${expStr}.`,
      status: 422
    };
  }
  for (const item of items) {
    const [siRows] = await conn.execute(
      `SELECT si.id, si.quantity, p.product_name AS name, p.is_returnable
       FROM sale_items si
       JOIN products p ON p.id = si.product_id
       WHERE si.id = ? AND si.sale_id = ?`,
      [item.sale_item_id, saleId]
    );
    const si = siRows[0];
    if (!si) {
      return {
        valid: false,
        message: `Item ID ${item.sale_item_id} does not belong to this invoice.`,
        status: 422
      };
    }
    if (!si.is_returnable) {
      return {
        valid: false,
        message: `This product is not eligible for return: ${si.name}.`,
        status: 422
      };
    }
    const [dupRows] = await conn.execute(
      `SELECT ri.id FROM return_items ri
       JOIN returns r ON ri.return_id = r.id
       WHERE ri.sale_item_id = ? AND r.status IN ('pending', 'approved')`,
      [item.sale_item_id]
    );
    if (dupRows.length > 0) {
      return {
        valid: false,
        message: `A return for this item is already in progress: ${si.name}.`,
        status: 409
      };
    }
    const [retRows] = await conn.execute(
      `SELECT COALESCE(SUM(ri.quantity_returned), 0) AS already_returned
       FROM return_items ri
       JOIN returns r ON ri.return_id = r.id
       WHERE ri.sale_item_id = ? AND r.status NOT IN ('rejected')`,
      [item.sale_item_id]
    );
    const alreadyReturned = Number(retRows[0]?.already_returned ?? 0);
    const remainingReturnable = si.quantity - alreadyReturned;
    if (item.quantity_returned < 1 || item.quantity_returned > remainingReturnable) {
      return {
        valid: false,
        message: `Return quantity exceeds the eligible quantity for: ${si.name}.`,
        status: 422
      };
    }
  }
  return { valid: true };
}

// server/routes/returns.ts
init_auditLogger();
var router5 = Router5();
var createReturnSchema = z5.object({
  sale_id: z5.number().int().positive(),
  return_reason: z5.string().min(1),
  items: z5.array(
    z5.object({
      sale_item_id: z5.number().int().positive(),
      product_id: z5.number().int().positive(),
      quantity_returned: z5.number().int().positive(),
      unit_price: z5.number().positive()
    })
  ).min(1)
});
var rejectSchema = z5.object({ return_reason: z5.string().min(1) });
var resolveSchema = z5.object({
  resolution: z5.enum(["refund", "replacement"]),
  item_condition: z5.enum(["good", "damaged"])
});
async function fetchReturnSummary(conn, id) {
  const [rows] = await conn.execute(
    `SELECT
       r.id,
       r.return_number,
       r.sale_id,
       s.invoice_number,
       s.customer_name,
       r.processed_by,
       u1.full_name  AS cashier_name,
       r.approved_by,
       u2.full_name  AS admin_name,
       r.status,
       r.resolution,
       r.item_condition,
       r.return_reason,
       r.refund_amount,
       r.created_at,
       r.resolved_at
     FROM returns r
     JOIN sales  s  ON s.id  = r.sale_id
     JOIN users  u1 ON u1.id = r.processed_by
     LEFT JOIN users u2 ON u2.id = r.approved_by
     WHERE r.id = ?
     LIMIT 1`,
    [id]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return { ...r, refund_amount: r.refund_amount != null ? Number(r.refund_amount) : null };
}
async function fetchReturnItems(conn, returnId) {
  const [rows] = await conn.execute(
    `SELECT
       ri.id,
       ri.return_id,
       ri.sale_item_id,
       ri.product_id,
       p.product_name   AS product_name,
       ri.quantity_returned,
       ri.unit_price
     FROM return_items ri
     JOIN products p ON p.id = ri.product_id
     WHERE ri.return_id = ?`,
    [returnId]
  );
  return rows.map((r) => ({ ...r, unit_price: Number(r.unit_price) }));
}
router5.post(
  "/",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req, res) => {
    const parsed = createReturnSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message
      }));
      res.status(400).json({ message: errors[0]?.message ?? "Invalid request", errors });
      return;
    }
    const { sale_id, return_reason, items } = parsed.data;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const validation = await validateReturnItems(
        conn,
        sale_id,
        items,
        /* @__PURE__ */ new Date()
      );
      if (!validation.valid) {
        await conn.rollback();
        res.status(validation.status).json({ message: validation.message });
        return;
      }
      const return_number = await generateReturnNumber(conn);
      const [returnResult] = await conn.execute(
        `INSERT INTO returns
           (return_number, sale_id, processed_by, return_reason, status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [return_number, sale_id, req.user.id, return_reason]
      );
      const return_id = returnResult.insertId;
      for (const item of items) {
        await conn.execute(
          `INSERT INTO return_items
             (return_id, sale_item_id, product_id, quantity_returned, unit_price)
           VALUES (?, ?, ?, ?, ?)`,
          [
            return_id,
            item.sale_item_id,
            item.product_id,
            item.quantity_returned,
            item.unit_price
          ]
        );
      }
      await conn.commit();
      await logAuditEvent({
        action: "RETURN_REQUESTED",
        performedById: req.user.id,
        performedByUsername: req.user.username,
        entityType: "returns",
        entityId: return_id,
        newValues: { return_number, sale_id, return_reason }
      });
      const [saleRows] = await conn.execute(
        `SELECT s.invoice_number, s.customer_name, u.full_name AS cashier_name
         FROM sales s
         JOIN users u ON u.id = s.cashier_id
         WHERE s.id = ? LIMIT 1`,
        [sale_id]
      );
      const saleRow = saleRows[0];
      broadcastReturnRequest({
        type: "return_request",
        id: return_id,
        return_number,
        cashier_name: saleRow?.cashier_name ?? "Cashier",
        customer_name: saleRow?.customer_name ?? "",
        invoice_number: saleRow?.invoice_number ?? "",
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      res.status(201).json({ return_number, id: return_id });
    } catch (err) {
      await conn.rollback();
      console.error("[POST /api/returns] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);
router5.get(
  "/search-approved",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req, res) => {
    const { customer_name } = req.query;
    if (!customer_name?.trim()) {
      res.status(400).json({ message: "customer_name is required." });
      return;
    }
    try {
      const [rows] = await pool.execute(
        `SELECT
           r.id,
           r.return_number,
           s.invoice_number,
           s.customer_name,
           r.return_reason,
           r.status,
           r.resolution,
           r.created_at
         FROM returns r
         JOIN sales s ON s.id = r.sale_id
         WHERE r.status = 'approved'
           AND r.resolution IS NULL
           AND s.customer_name LIKE ?
         ORDER BY r.created_at DESC`,
        [`%${customer_name.trim()}%`]
      );
      res.status(200).json(rows);
    } catch (err) {
      console.error("[GET /api/returns/search-approved] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);
router5.get(
  "/",
  authenticate,
  requireRole("Admin"),
  async (req, res) => {
    const {
      status,
      resolution,
      date_from,
      date_to,
      return_number,
      invoice_number,
      cashier_id
    } = req.query;
    try {
      const conditions = [];
      const params = [];
      if (status) {
        conditions.push("r.status = ?");
        params.push(status);
      }
      if (resolution && ["refund", "replacement"].includes(resolution)) {
        conditions.push("r.resolution = ?");
        params.push(resolution);
      }
      if (return_number) {
        conditions.push("r.return_number LIKE ?");
        params.push(`%${return_number}%`);
      }
      if (invoice_number) {
        conditions.push("s.invoice_number LIKE ?");
        params.push(`%${invoice_number}%`);
      }
      if (date_from) {
        conditions.push("DATE(r.created_at) >= ?");
        params.push(date_from);
      }
      if (date_to) {
        conditions.push("DATE(r.created_at) <= ?");
        params.push(date_to);
      }
      if (cashier_id && /^\d+$/.test(cashier_id)) {
        conditions.push("r.processed_by = ?");
        params.push(parseInt(cashier_id, 10));
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const [rows] = await pool.execute(
        `SELECT
           r.id,
           r.return_number,
           s.invoice_number,
           s.customer_name,
           u1.full_name  AS cashier_name,
           u2.full_name  AS admin_name,
           r.status,
           r.resolution,
           r.item_condition,
           r.refund_amount,
           r.created_at,
           r.resolved_at
         FROM returns r
         JOIN sales  s  ON s.id  = r.sale_id
         JOIN users  u1 ON u1.id = r.processed_by
         LEFT JOIN users u2 ON u2.id = r.approved_by
         ${where}
         ORDER BY r.created_at DESC`,
        params
      );
      res.status(200).json(rows);
    } catch (err) {
      console.error("[GET /api/returns] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    }
  }
);
router5.get(
  "/:id",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Invalid return ID." });
      return;
    }
    const conn = await pool.getConnection();
    try {
      const returnRow = await fetchReturnSummary(conn, id);
      if (!returnRow) {
        res.status(404).json({ message: "Return not found." });
        return;
      }
      const items = await fetchReturnItems(conn, id);
      res.status(200).json({ ...returnRow, items });
    } catch (err) {
      console.error("[GET /api/returns/:id] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);
router5.patch(
  "/:id/approve",
  authenticate,
  requireRole("Admin"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Invalid return ID." });
      return;
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute(
        `SELECT id, status FROM returns WHERE id = ? LIMIT 1 FOR UPDATE`,
        [id]
      );
      const returnRow = rows[0];
      if (!returnRow) {
        await conn.rollback();
        res.status(404).json({ message: "Return not found." });
        return;
      }
      if (returnRow.status !== "pending") {
        await conn.rollback();
        res.status(422).json({ message: "Only pending returns can be approved." });
        return;
      }
      await conn.execute(
        `UPDATE returns SET status = 'approved', approved_by = ?, resolved_at = NOW() WHERE id = ?`,
        [req.user.id, id]
      );
      await conn.commit();
      const updated = await fetchReturnSummary(conn, id);
      await logAuditEvent({
        action: "RETURN_APPROVED",
        performedById: req.user.id,
        performedByUsername: req.user.username,
        entityType: "returns",
        entityId: id,
        newValues: { return_number: updated.return_number, invoice_number: updated.invoice_number }
      });
      sendReturnDecision({
        type: "return_decision",
        id: updated.id,
        return_number: updated.return_number,
        invoice_number: updated.invoice_number,
        customer_name: updated.customer_name,
        decision: "approved",
        admin_name: updated.admin_name ?? "Admin",
        cashier_user_id: updated.processed_by
      });
      res.status(200).json(updated);
    } catch (err) {
      await conn.rollback();
      console.error("[PATCH /api/returns/:id/approve] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);
router5.patch(
  "/:id/reject",
  authenticate,
  requireRole("Admin"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Invalid return ID." });
      return;
    }
    const parsed = rejectSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message
      }));
      res.status(400).json({ message: errors[0]?.message ?? "Invalid request", errors });
      return;
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute(
        `SELECT id, status FROM returns WHERE id = ? LIMIT 1 FOR UPDATE`,
        [id]
      );
      const returnRow = rows[0];
      if (!returnRow) {
        await conn.rollback();
        res.status(404).json({ message: "Return not found." });
        return;
      }
      if (returnRow.status !== "pending") {
        await conn.rollback();
        res.status(422).json({ message: "Only pending returns can be rejected." });
        return;
      }
      await conn.execute(
        `UPDATE returns SET status = 'rejected', approved_by = ?, resolved_at = NOW(), return_reason = ? WHERE id = ?`,
        [req.user.id, parsed.data.return_reason, id]
      );
      await conn.commit();
      const updated = await fetchReturnSummary(conn, id);
      await logAuditEvent({
        action: "RETURN_REJECTED",
        performedById: req.user.id,
        performedByUsername: req.user.username,
        entityType: "returns",
        entityId: id,
        reason: parsed.data.return_reason,
        newValues: { return_number: updated.return_number, invoice_number: updated.invoice_number }
      });
      sendReturnDecision({
        type: "return_decision",
        id: updated.id,
        return_number: updated.return_number,
        invoice_number: updated.invoice_number,
        customer_name: updated.customer_name,
        decision: "rejected",
        admin_name: updated.admin_name ?? "Admin",
        cashier_user_id: updated.processed_by
      });
      res.status(200).json(updated);
    } catch (err) {
      await conn.rollback();
      console.error("[PATCH /api/returns/:id/reject] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);
router5.patch(
  "/:id/resolve",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Invalid return ID." });
      return;
    }
    const parsed = resolveSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message
      }));
      res.status(400).json({ message: errors[0]?.message ?? "Invalid request", errors });
      return;
    }
    const { resolution, item_condition } = parsed.data;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [returnRows] = await conn.execute(
        `SELECT r.id, r.return_number, r.status, r.resolution
         FROM returns r
         WHERE r.id = ? LIMIT 1 FOR UPDATE`,
        [id]
      );
      const returnRow = returnRows[0];
      if (!returnRow) {
        await conn.rollback();
        res.status(404).json({ message: "Return not found." });
        return;
      }
      if (returnRow.status !== "approved") {
        await conn.rollback();
        res.status(422).json({ message: "Return must be approved before resolution." });
        return;
      }
      if (returnRow.resolution !== null) {
        await conn.rollback();
        res.status(422).json({ message: "This return has already been resolved." });
        return;
      }
      const [itemRows] = await conn.execute(
        `SELECT ri.product_id, ri.quantity_returned, ri.unit_price, p.product_name AS product_name
         FROM return_items ri
         JOIN products p ON p.id = ri.product_id
         WHERE ri.return_id = ?`,
        [id]
      );
      let refund_amount = 0;
      if (resolution === "refund") {
        for (const item of itemRows) {
          refund_amount += Number(item.unit_price) * Number(item.quantity_returned);
          if (item_condition === "good") {
            await conn.execute(
              `UPDATE products SET quantity = quantity + ? WHERE id = ?`,
              [item.quantity_returned, item.product_id]
            );
          } else {
            await conn.execute(
              `UPDATE products SET damaged_stock = damaged_stock + ? WHERE id = ?`,
              [item.quantity_returned, item.product_id]
            );
          }
          await conn.execute(
            `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, reference, user_id)
             VALUES (?, 'Return', 'return_refund', ?, ?, ?)`,
            [item.product_id, item.quantity_returned, returnRow.return_number, req.user.id]
          );
        }
        await conn.execute(
          `UPDATE returns
           SET resolution = 'refund', item_condition = ?, refund_amount = ?, resolved_at = NOW()
           WHERE id = ?`,
          [item_condition, refund_amount.toFixed(2), id]
        );
      } else {
        for (const item of itemRows) {
          const [stockRows] = await conn.execute(
            `SELECT quantity FROM products WHERE id = ? FOR UPDATE`,
            [item.product_id]
          );
          const stock = stockRows[0];
          if (!stock || Number(stock.quantity) < Number(item.quantity_returned)) {
            await conn.rollback();
            res.status(409).json({
              message: `Replacement cannot be processed \u2014 insufficient stock for: ${item.product_name}. Available: ${stock ? Number(stock.quantity) : 0}, Required: ${item.quantity_returned}.`
            });
            return;
          }
        }
        for (const item of itemRows) {
          if (item_condition === "good") {
            await conn.execute(
              `UPDATE products SET quantity = quantity + ? WHERE id = ?`,
              [item.quantity_returned, item.product_id]
            );
          } else {
            await conn.execute(
              `UPDATE products SET damaged_stock = damaged_stock + ? WHERE id = ?`,
              [item.quantity_returned, item.product_id]
            );
          }
          await conn.execute(
            `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, reference, user_id)
             VALUES (?, 'Return', 'return_replacement_in', ?, ?, ?)`,
            [item.product_id, item.quantity_returned, returnRow.return_number, req.user.id]
          );
          await conn.execute(
            `UPDATE products SET quantity = quantity - ? WHERE id = ?`,
            [item.quantity_returned, item.product_id]
          );
          await conn.execute(
            `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, reference, user_id)
             VALUES (?, 'Return', 'return_replacement_out', ?, ?, ?)`,
            [item.product_id, -item.quantity_returned, returnRow.return_number, req.user.id]
          );
        }
        await conn.execute(
          `UPDATE returns
           SET resolution = 'replacement', item_condition = ?, resolved_at = NOW()
           WHERE id = ?`,
          [item_condition, id]
        );
      }
      await conn.commit();
      if (resolution === "refund") {
        await pool.execute(
          `INSERT INTO activity_logs (user_id, action, reference)
           VALUES (?, 'return_refund', ?)`,
          [req.user.id, returnRow.return_number]
        );
        await logAuditEvent({
          action: "REFUND_PROCESSED",
          performedById: req.user.id,
          performedByUsername: req.user.username,
          entityType: "returns",
          entityId: id,
          newValues: { return_number: returnRow.return_number, refund_amount: refund_amount.toFixed(2), item_condition }
        });
      } else {
        await pool.execute(
          `INSERT INTO activity_logs (user_id, action, reference)
           VALUES (?, 'return_replacement', ?)`,
          [req.user.id, returnRow.return_number]
        );
        await logAuditEvent({
          action: "EXCHANGE_COMPLETED",
          performedById: req.user.id,
          performedByUsername: req.user.username,
          entityType: "returns",
          entityId: id,
          newValues: { return_number: returnRow.return_number, item_condition }
        });
      }
      const finalReturn = await fetchReturnSummary(conn, id);
      const finalItems = await fetchReturnItems(conn, id);
      res.status(200).json({ ...finalReturn, items: finalItems });
    } catch (err) {
      await conn.rollback();
      console.error("[PATCH /api/returns/:id/resolve] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred. Please try again." });
    } finally {
      conn.release();
    }
  }
);
var returns_default = router5;

// server/routes/products.ts
init_db();
import { Router as Router6 } from "express";
import { z as z6 } from "zod";
init_auditLogger();
var router6 = Router6();
router6.use(authenticate);
function requireAdmin3(req, res) {
  if (req.user?.role !== "Admin") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}
var PRODUCT_COLS = `
  p.id,
  p.barcode,
  p.barcode_source,
  p.supplier_barcode,
  p.product_name,
  p.description,
  p.category_id,
  COALESCE(c.category_name, '')  AS category,
  p.supplier_id,
  COALESCE(s.supplier_name, '')  AS supplier,
  p.unit_id,
  COALESCE(u.unit_name, '')      AS unit,
  COALESCE(u.abbreviation, '')   AS unit_abbreviation,
  p.cost_price,
  p.selling_price,
  p.quantity,
  p.reorder_level,
  p.image,
  p.status,
  p.is_returnable,
  p.damaged_stock,
  p.tax_type,
  p.pricing_type,
  p.product_usage,
  p.created_at,
  p.updated_at
`;
var TAX_TYPES = ["VATABLE", "VAT_EXEMPT", "ZERO_RATED", "NON_TAXABLE"];
var productBaseSchema = z6.object({
  barcode: z6.string().min(1, "Barcode is required"),
  barcode_source: z6.enum(["manufacturer", "store"]),
  supplier_barcode: z6.string().optional().nullable(),
  product_name: z6.string().min(1, "Product name is required"),
  description: z6.string().optional().nullable(),
  category_id: z6.number().int().positive("Category is required"),
  supplier_id: z6.number().int().positive().optional().nullable(),
  unit_id: z6.number().int().positive("Unit is required"),
  cost_price: z6.number().min(0, "Cost price must be 0 or greater").optional(),
  selling_price: z6.number().min(0, "Selling price must be 0 or greater").optional(),
  reorder_level: z6.number().int().min(0, "Reorder level must be 0 or greater").optional().default(0),
  is_returnable: z6.boolean().optional().default(true),
  status: z6.enum(["Active", "Inactive"]).optional().default("Active"),
  tax_type: z6.enum(TAX_TYPES).optional().default("VATABLE"),
  pricing_type: z6.enum(["FIXED_PRICE", "MARKET_BASED"]).optional().default("FIXED_PRICE"),
  product_usage: z6.enum(["RETAIL_PRODUCT", "RAW_MATERIAL_COMMODITY", "BOTH"]).optional().default("RETAIL_PRODUCT")
});
function applyPricingRules(data, ctx) {
  if ((data.pricing_type ?? "FIXED_PRICE") === "FIXED_PRICE") {
    if (data.cost_price === void 0)
      ctx.addIssue({ code: z6.ZodIssueCode.custom, path: ["cost_price"], message: "Cost price is required for fixed-price products." });
    if (data.selling_price === void 0)
      ctx.addIssue({ code: z6.ZodIssueCode.custom, path: ["selling_price"], message: "Selling price is required for fixed-price products." });
  }
}
var productSchema = productBaseSchema.superRefine(applyPricingRules).transform((data) => ({
  ...data,
  cost_price: (data.pricing_type ?? "FIXED_PRICE") === "MARKET_BASED" ? 0 : data.cost_price ?? 0,
  selling_price: (data.pricing_type ?? "FIXED_PRICE") === "MARKET_BASED" ? 0 : data.selling_price ?? 0
}));
var updateProductSchema = productBaseSchema.partial().superRefine(applyPricingRules).transform((data) => ({
  ...data,
  ...data.pricing_type === "MARKET_BASED" ? { cost_price: 0, selling_price: 0 } : {}
}));
var STORE_BARCODE_START = 1;
var STORE_BARCODE_PAD = 4;
async function generateBarcode(conn) {
  const [rows] = await conn.execute(
    `SELECT barcode FROM products WHERE barcode_source = 'store' ORDER BY CAST(barcode AS UNSIGNED) DESC LIMIT 1`
  );
  if (rows.length === 0) return String(STORE_BARCODE_START).padStart(STORE_BARCODE_PAD, "0");
  const last = parseInt(rows[0].barcode, 10);
  return String(isNaN(last) ? STORE_BARCODE_START : last + 1).padStart(STORE_BARCODE_PAD, "0");
}
router6.get("/", async (req, res) => {
  try {
    const { search, category_id, supplier_id, status, product_status } = req.query;
    let where = "WHERE 1=1";
    const params = [];
    const productStatusVal = typeof product_status === "string" ? product_status.trim() : "";
    if (productStatusVal === "all") {
    } else if (productStatusVal === "Inactive" || productStatusVal === "Active") {
      where += " AND p.status = ?";
      params.push(productStatusVal);
    } else {
      where += " AND p.status = 'Active'";
    }
    if (search) {
      where += " AND (p.product_name LIKE ? OR p.barcode LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category_id) {
      where += " AND p.category_id = ?";
      params.push(Number(category_id));
    }
    if (supplier_id) {
      where += " AND p.supplier_id = ?";
      params.push(Number(supplier_id));
    }
    if (status && status !== "all") {
      switch (status) {
        case "In Stock":
          where += " AND p.quantity > p.reorder_level";
          break;
        case "Low Stock":
          where += " AND p.quantity > FLOOR(p.reorder_level * 0.5) AND p.quantity <= p.reorder_level";
          break;
        case "Critical":
          where += " AND p.quantity > 0 AND p.quantity <= FLOOR(p.reorder_level * 0.5)";
          break;
        case "Out of Stock":
          where += " AND p.quantity = 0";
          break;
      }
    }
    const [rows] = await pool.execute(
      `SELECT ${PRODUCT_COLS}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
       LEFT JOIN units      u ON u.id = p.unit_id
       ${where}
       ORDER BY p.product_name ASC`,
      params
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error("[products/GET /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router6.get("/lookup", async (req, res) => {
  const q = (req.query.q ?? "").trim();
  if (!q) {
    res.status(200).json([]);
    return;
  }
  try {
    const [rows] = await pool.execute(
      `SELECT
         p.id,
         p.barcode,
         p.product_name,
         p.selling_price,
         p.quantity,
         COALESCE(u.unit_name, '')      AS unit,
         COALESCE(u.abbreviation, '')   AS unit_abbreviation,
         p.is_returnable,
         p.tax_type,
         p.pricing_type
       FROM products p
       LEFT JOIN units u ON u.id = p.unit_id
       WHERE p.status = 'Active'
         AND (p.barcode = ? OR p.barcode LIKE ? OR p.product_name LIKE ?)
       ORDER BY
         CASE WHEN p.barcode = ? THEN 0 ELSE 1 END,
         p.product_name ASC
       LIMIT 10`,
      [q, `%${q}%`, `%${q}%`, q]
    );
    res.status(200).json(
      rows.map((r) => ({
        ...r,
        selling_price: Number(r.selling_price),
        quantity: Number(r.quantity)
      }))
    );
  } catch (err) {
    console.error("[products/GET /lookup]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router6.get("/next-barcode", async (_req, res) => {
  const conn = await pool.getConnection();
  try {
    const barcode = await generateBarcode(conn);
    res.status(200).json({ barcode });
  } catch (err) {
    console.error("[products/GET /next-barcode]", err);
    res.status(500).json({ message: "Could not generate barcode." });
  } finally {
    conn.release();
  }
});
router6.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid product ID." });
    return;
  }
  try {
    const [rows] = await pool.execute(
      `SELECT ${PRODUCT_COLS}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
       LEFT JOIN units      u ON u.id = p.unit_id
       WHERE p.id = ?`,
      [id]
    );
    if (rows.length === 0) {
      res.status(404).json({ message: "Product not found." });
      return;
    }
    res.status(200).json(rows[0]);
  } catch (err) {
    console.error("[products/GET /:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router6.post("/", async (req, res) => {
  if (!requireAdmin3(req, res)) return;
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }
  const {
    barcode,
    barcode_source,
    supplier_barcode,
    product_name,
    description,
    category_id,
    supplier_id,
    unit_id,
    cost_price,
    selling_price,
    reorder_level,
    is_returnable,
    status,
    tax_type,
    pricing_type,
    product_usage
  } = parsed.data;
  const conn = await pool.getConnection();
  try {
    const [existing] = await conn.execute(
      "SELECT id FROM products WHERE barcode = ? LIMIT 1",
      [barcode]
    );
    if (existing.length > 0) {
      res.status(409).json({ message: "Barcode already exists. Please scan or enter another barcode." });
      return;
    }
    const [result] = await conn.execute(
      `INSERT INTO products
         (barcode, barcode_source, supplier_barcode, product_name, description,
          category_id, supplier_id, unit_id,
          cost_price, selling_price, quantity, reorder_level,
          is_returnable, damaged_stock, status, tax_type, pricing_type, product_usage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, ?, ?, ?)`,
      [
        barcode,
        barcode_source,
        supplier_barcode ?? null,
        product_name,
        description ?? null,
        category_id,
        supplier_id ?? null,
        unit_id,
        cost_price,
        selling_price,
        reorder_level,
        is_returnable ? 1 : 0,
        status,
        tax_type ?? "VATABLE",
        pricing_type ?? "FIXED_PRICE",
        product_usage ?? "RETAIL_PRODUCT"
      ]
    );
    const newId = result.insertId;
    const [newRows] = await conn.execute(
      `SELECT ${PRODUCT_COLS}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
       LEFT JOIN units      u ON u.id = p.unit_id
       WHERE p.id = ?`,
      [newId]
    );
    await logAuditEvent({
      action: "PRODUCT_CREATED",
      performedById: req.user.id,
      performedByUsername: req.user.username,
      entityType: "products",
      entityId: newId,
      newValues: { barcode, product_name, selling_price, cost_price }
    });
    res.status(201).json(newRows[0]);
  } catch (err) {
    console.error("[products/POST /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});
router6.put("/:id", async (req, res) => {
  if (!requireAdmin3(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid product ID." });
    return;
  }
  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }
  const data = parsed.data;
  if (Object.keys(data).length === 0) {
    res.status(400).json({ message: "No fields provided to update." });
    return;
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.execute(
      `SELECT ${PRODUCT_COLS}, p.selling_price AS prev_selling_price, p.cost_price AS prev_cost_price
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
       LEFT JOIN units      u ON u.id = p.unit_id
       WHERE p.id = ? LIMIT 1 FOR UPDATE`,
      [id]
    );
    if (existing.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Product not found." });
      return;
    }
    const prevSnapshot = existing[0];
    const prevSellingPrice = prevSnapshot.prev_selling_price;
    const prevCostPrice = prevSnapshot.prev_cost_price;
    if (data.barcode) {
      const [barcodeCheck] = await conn.execute(
        "SELECT id FROM products WHERE barcode = ? AND id != ? LIMIT 1",
        [data.barcode, id]
      );
      if (barcodeCheck.length > 0) {
        await conn.rollback();
        res.status(409).json({ message: "A product with this barcode already exists." });
        return;
      }
    }
    const fields = [];
    const values = [];
    const fieldMap = {
      barcode: data.barcode,
      barcode_source: data.barcode_source,
      supplier_barcode: data.supplier_barcode,
      product_name: data.product_name,
      description: data.description,
      category_id: data.category_id,
      supplier_id: data.supplier_id,
      unit_id: data.unit_id,
      cost_price: data.cost_price,
      selling_price: data.selling_price,
      reorder_level: data.reorder_level,
      is_returnable: data.is_returnable !== void 0 ? data.is_returnable ? 1 : 0 : void 0,
      status: data.status,
      tax_type: data.tax_type,
      pricing_type: data.pricing_type,
      product_usage: data.product_usage
    };
    for (const [col, val] of Object.entries(fieldMap)) {
      if (val !== void 0) {
        fields.push(`${col} = ?`);
        values.push(val === null ? null : val);
      }
    }
    values.push(id);
    await conn.execute(
      `UPDATE products SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
    const [updated] = await conn.execute(
      `SELECT ${PRODUCT_COLS}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers  s ON s.id = p.supplier_id
       LEFT JOIN units      u ON u.id = p.unit_id
       WHERE p.id = ?`,
      [id]
    );
    await conn.commit();
    const newSellingPrice = data.selling_price !== void 0 ? data.selling_price : prevSellingPrice;
    const newCostPrice = data.cost_price !== void 0 ? data.cost_price : prevCostPrice;
    const isPriceChange = data.selling_price !== void 0 && Number(data.selling_price) !== Number(prevSellingPrice) || data.cost_price !== void 0 && Number(data.cost_price) !== Number(prevCostPrice);
    logAuditEvent({
      action: isPriceChange ? "PRODUCT_PRICE_CHANGED" : "PRODUCT_UPDATED",
      performedById: req.user.id,
      performedByUsername: req.user.username,
      entityType: "products",
      entityId: id,
      previousValues: {
        ...isPriceChange ? {
          selling_price: prevSellingPrice,
          cost_price: prevCostPrice
        } : {}
      },
      newValues: isPriceChange ? { ...data, selling_price: newSellingPrice, cost_price: newCostPrice } : data
    }).catch((e) => console.error("[products/PUT /:id] auditLogger failed:", e));
    res.status(200).json(updated[0]);
  } catch (err) {
    await conn.rollback();
    console.error("[products/PUT /:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});
router6.delete("/:id", async (req, res) => {
  if (!requireAdmin3(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid product ID." });
    return;
  }
  try {
    const [existing] = await pool.execute(
      "SELECT id FROM products WHERE id = ? LIMIT 1",
      [id]
    );
    if (existing.length === 0) {
      res.status(404).json({ message: "Product not found." });
      return;
    }
    const [salesCheck] = await pool.execute(
      "SELECT id FROM sale_items WHERE product_id = ? LIMIT 1",
      [id]
    );
    if (salesCheck.length > 0) {
      await pool.execute(
        "UPDATE products SET status = 'Inactive' WHERE id = ?",
        [id]
      );
      res.status(200).json({ message: "Product deactivated (has sales history).", soft: true });
      return;
    }
    await pool.execute("DELETE FROM products WHERE id = ?", [id]);
    res.status(200).json({ message: "Product deleted successfully.", soft: false });
  } catch (err) {
    console.error("[products/DELETE /:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
var products_default = router6;

// server/routes/categories.ts
init_db();
import { Router as Router7 } from "express";
import { z as z7 } from "zod";
var router7 = Router7();
router7.use(authenticate);
function requireAdmin4(req, res) {
  if (req.user?.role !== "Admin") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}
var categorySchema = z7.object({
  category_name: z7.string().min(1, "Category name is required").max(100),
  description: z7.string().optional().nullable()
});
router7.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, category_name, description FROM categories ORDER BY category_name ASC"
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error("[categories/GET /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router7.post("/", async (req, res) => {
  if (!requireAdmin4(req, res)) return;
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "category_name"), message: i.message })) });
    return;
  }
  const { category_name, description } = parsed.data;
  try {
    const [existing] = await pool.execute(
      "SELECT id FROM categories WHERE category_name = ? LIMIT 1",
      [category_name]
    );
    if (existing.length > 0) {
      res.status(409).json({ message: "Category already exists." });
      return;
    }
    const [result] = await pool.execute(
      "INSERT INTO categories (category_name, description) VALUES (?, ?)",
      [category_name, description ?? null]
    );
    res.status(201).json({ id: result.insertId, category_name, description });
  } catch (err) {
    console.error("[categories/POST /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router7.put("/:id", async (req, res) => {
  if (!requireAdmin4(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid ID." });
    return;
  }
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "category_name"), message: i.message })) });
    return;
  }
  try {
    const [result] = await pool.execute(
      "UPDATE categories SET category_name = ?, description = ? WHERE id = ?",
      [parsed.data.category_name, parsed.data.description ?? null, id]
    );
    if (result.affectedRows === 0) {
      res.status(404).json({ message: "Category not found." });
      return;
    }
    res.status(200).json({ id, ...parsed.data });
  } catch (err) {
    console.error("[categories/PUT /:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router7.delete("/:id", async (req, res) => {
  if (!requireAdmin4(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid ID." });
    return;
  }
  try {
    const [inUse] = await pool.execute(
      "SELECT id FROM products WHERE category_id = ? LIMIT 1",
      [id]
    );
    if (inUse.length > 0) {
      res.status(409).json({ message: "Cannot delete \u2014 category is in use by products." });
      return;
    }
    const [result] = await pool.execute("DELETE FROM categories WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ message: "Category not found." });
      return;
    }
    res.status(200).json({ message: "Category deleted." });
  } catch (err) {
    console.error("[categories/DELETE /:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
var categories_default = router7;

// server/routes/suppliers.ts
init_db();
import { Router as Router8 } from "express";
import { z as z8 } from "zod";
var router8 = Router8();
router8.use(authenticate);
function requireAdmin5(req, res) {
  if (req.user?.role !== "Admin") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}
var supplierSchema = z8.object({
  supplier_name: z8.string().min(1, "Supplier name is required").max(150),
  contact_person: z8.string().optional().nullable(),
  contact_number: z8.string().optional().nullable(),
  email: z8.string().email("Invalid email").optional().nullable().or(z8.literal("")),
  address: z8.string().optional().nullable(),
  status: z8.enum(["Active", "Inactive"]).optional().default("Active")
});
router8.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.execute(`
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
router8.post("/", async (req, res) => {
  if (!requireAdmin5(req, res)) return;
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "supplier_name"), message: i.message })) });
    return;
  }
  const { supplier_name, contact_person, contact_number, email, address, status } = parsed.data;
  try {
    const [existing] = await pool.execute(
      "SELECT id FROM suppliers WHERE supplier_name = ? LIMIT 1",
      [supplier_name]
    );
    if (existing.length > 0) {
      res.status(409).json({ message: "Supplier already exists." });
      return;
    }
    const [result] = await pool.execute(
      "INSERT INTO suppliers (supplier_name, contact_person, contact_number, email, address, status) VALUES (?, ?, ?, ?, ?, ?)",
      [supplier_name, contact_person ?? null, contact_number ?? null, email || null, address ?? null, status]
    );
    res.status(201).json({ id: result.insertId, supplier_name, contact_person, contact_number, email, address, status });
  } catch (err) {
    console.error("[suppliers/POST /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router8.put("/:id", async (req, res) => {
  if (!requireAdmin5(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid ID." });
    return;
  }
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "supplier_name"), message: i.message })) });
    return;
  }
  const { supplier_name, contact_person, contact_number, email, address, status } = parsed.data;
  try {
    const [result] = await pool.execute(
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
router8.delete("/:id", async (req, res) => {
  if (!requireAdmin5(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid ID." });
    return;
  }
  try {
    const [inUse] = await pool.execute(
      "SELECT id FROM products WHERE supplier_id = ? LIMIT 1",
      [id]
    );
    if (inUse.length > 0) {
      res.status(409).json({ message: "Cannot delete \u2014 supplier is in use by products." });
      return;
    }
    const [result] = await pool.execute("DELETE FROM suppliers WHERE id = ?", [id]);
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
var suppliers_default = router8;

// server/routes/units.ts
init_db();
import { Router as Router9 } from "express";
var router9 = Router9();
router9.use(authenticate);
router9.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, unit_name, abbreviation, description FROM units ORDER BY unit_name ASC"
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error("[units/GET /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
var units_default = router9;

// server/routes/inventory.ts
init_db();
import { Router as Router10 } from "express";
import { z as z9 } from "zod";
init_auditLogger();
var router10 = Router10();
router10.use(authenticate);
function requireAdminOrClerk(req, res) {
  if (req.user?.role !== "Admin" && req.user?.role !== "Inventory Clerk") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}
router10.get("/summary", async (req, res) => {
  if (!requireAdminOrClerk(req, res)) return;
  try {
    const [rows] = await pool.execute(`
      SELECT
        COUNT(*)                                                   AS total_products,
        SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END)             AS out_of_stock,
        SUM(CASE WHEN quantity > 0
                  AND quantity <= FLOOR(reorder_level * 0.5)
                 THEN 1 ELSE 0 END)                               AS critical,
        SUM(CASE WHEN quantity > FLOOR(reorder_level * 0.5)
                  AND quantity <= reorder_level
                 THEN 1 ELSE 0 END)                               AS low_stock,
        SUM(CASE WHEN quantity > reorder_level THEN 1 ELSE 0 END) AS in_stock,
        SUM(quantity)                                              AS total_units
      FROM products
      WHERE status = 'Active'
    `);
    res.status(200).json(rows[0]);
  } catch (err) {
    console.error("[inventory/GET /summary]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router10.get("/", async (req, res) => {
  if (!requireAdminOrClerk(req, res)) return;
  try {
    const { search, category_id, status, product_status } = req.query;
    let where = "";
    const params = [];
    const productStatusVal = typeof product_status === "string" ? product_status.trim() : "";
    if (productStatusVal === "all") {
      where = "WHERE 1=1";
    } else if (productStatusVal === "Inactive" || productStatusVal === "Active") {
      where = "WHERE p.status = ?";
      params.push(productStatusVal);
    } else {
      where = "WHERE p.status = 'Active'";
    }
    if (search) {
      where += " AND (p.product_name LIKE ? OR p.barcode LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category_id) {
      where += " AND p.category_id = ?";
      params.push(Number(category_id));
    }
    if (status && status !== "all") {
      switch (status) {
        case "In Stock":
          where += " AND p.quantity > p.reorder_level";
          break;
        case "Low Stock":
          where += " AND p.quantity > FLOOR(p.reorder_level * 0.5) AND p.quantity <= p.reorder_level";
          break;
        case "Critical":
          where += " AND p.quantity > 0 AND p.quantity <= FLOOR(p.reorder_level * 0.5)";
          break;
        case "Out of Stock":
          where += " AND p.quantity = 0";
          break;
      }
    }
    const [rows] = await pool.execute(`
      SELECT
        p.id,
        p.barcode,
        p.product_name,
        COALESCE(c.category_name, '\u2014')  AS category,
        COALESCE(s.supplier_name, '\u2014')  AS supplier,
        COALESCE(u.unit_name, '')        AS unit,
        COALESCE(u.abbreviation, '')     AS unit_abbreviation,
        p.quantity,
        p.reorder_level,
        p.damaged_stock,
        p.cost_price,
        p.selling_price,
        p.updated_at
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN suppliers  s ON s.id = p.supplier_id
      LEFT JOIN units      u ON u.id = p.unit_id
      ${where}
      ORDER BY
        CASE
          WHEN p.quantity = 0 THEN 0
          WHEN p.quantity <= FLOOR(p.reorder_level * 0.5) THEN 1
          WHEN p.quantity <= p.reorder_level THEN 2
          ELSE 3
        END,
        p.product_name ASC
    `, params);
    res.status(200).json(rows);
  } catch (err) {
    console.error("[inventory/GET /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router10.get("/logs", async (req, res) => {
  if (!requireAdminOrClerk(req, res)) return;
  try {
    const limit = Math.min(1e3, Math.max(1, parseInt(req.query.limit || "50", 10)));
    const offset = Math.max(0, parseInt(req.query.offset || "0", 10));
    const { product_id } = req.query;
    let where = "WHERE 1=1";
    const params = [];
    if (product_id) {
      where += " AND il.product_id = ?";
      params.push(parseInt(product_id, 10));
    }
    params.push(limit, offset);
    const [rows] = await pool.execute(`
      SELECT
        il.id,
        il.product_id,
        p.product_name,
        p.barcode,
        il.transaction_type,
        il.action,
        il.quantity_change,
        il.quantity,
        il.remaining_stock,
        il.reference,
        il.created_at,
        COALESCE(u.full_name, '\u2014') AS performed_by
      FROM inventory_logs il
      LEFT JOIN products p ON p.id = il.product_id
      LEFT JOIN users    u ON u.id = il.user_id
      ${where}
      ORDER BY il.created_at DESC
      LIMIT ? OFFSET ?
    `, params);
    res.status(200).json(rows);
  } catch (err) {
    console.error("[inventory/GET /logs]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
var stockInItemSchema = z9.object({
  product_id: z9.number().int().positive(),
  // Accept decimals for commodity products (e.g. 100.5 kg).
  // Whole-number products continue to work unchanged.
  quantity_received: z9.number().positive("Quantity must be greater than 0"),
  unit_cost: z9.number().min(0).optional().nullable()
});
var STOCK_IN_SOURCES = [
  "Supplier Delivery",
  "Direct Purchase"
];
var stockInSchema = z9.object({
  source: z9.enum(STOCK_IN_SOURCES),
  supplier_id: z9.number().int().positive().optional().nullable(),
  invoice_number: z9.string().optional().nullable(),
  delivery_date: z9.string().min(1, "Delivery date is required"),
  remarks: z9.string().optional().nullable(),
  items: z9.array(stockInItemSchema).min(1, "At least one item is required")
});
var stockAdjustmentSchema = z9.object({
  product_id: z9.number().int().positive(),
  type: z9.enum(["Damaged", "Lost", "Expired", "Correction"]),
  quantity: z9.number().min(0),
  reason: z9.string().min(1, "Reason is required")
});
router10.post("/stock-in", async (req, res) => {
  if (!requireAdminOrClerk(req, res)) return;
  const parsed = stockInSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }
  const { source, supplier_id, invoice_number, delivery_date, remarks, items } = parsed.data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const dateStr = delivery_date.replace(/-/g, "").slice(0, 8);
    const [seqRows] = await conn.execute(
      `SELECT id, current_number FROM invoice_sequences WHERE prefix = 'SI' LIMIT 1 FOR UPDATE`
    );
    if (!seqRows[0]) {
      await conn.rollback();
      res.status(500).json({ message: "Stock-in sequence not found. Run migration 011." });
      return;
    }
    const nextSeq = seqRows[0].current_number + 1;
    await conn.execute(
      `UPDATE invoice_sequences SET current_number = ?, updated_at = NOW() WHERE id = ?`,
      [nextSeq, seqRows[0].id]
    );
    const stockInId = `SI-${dateStr}-${String(nextSeq).padStart(6, "0")}`;
    const reference = invoice_number?.trim() || stockInId;
    for (const item of items) {
      const [productRows] = await conn.execute("SELECT id, quantity, product_name FROM products WHERE id = ? FOR UPDATE", [item.product_id]);
      if (productRows.length === 0) {
        await conn.rollback();
        res.status(404).json({ message: `Product ID ${item.product_id} not found` });
        return;
      }
      const product = productRows[0];
      const newQuantity = product.quantity + item.quantity_received;
      await conn.execute("UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?", [newQuantity, product.id]);
      await conn.execute(`
        INSERT INTO inventory_logs
          (product_id, transaction_type, action, quantity_change, quantity, remaining_stock, reference, user_id)
        VALUES (?, 'Stock In', 'Received Stock', ?, ?, ?, ?, ?)
      `, [
        item.product_id,
        item.quantity_received,
        product.quantity,
        newQuantity,
        reference,
        req.user?.id
      ]);
    }
    await conn.commit();
    await logAuditEvent({
      action: "STOCK_RECEIVED",
      performedById: req.user.id,
      performedByUsername: req.user.username ?? "unknown",
      entityType: "inventory",
      newValues: { stock_in_id: stockInId, reference, source, item_count: items.length }
    });
    res.status(201).json({ message: "Stock in successful", stock_in_id: stockInId, reference });
  } catch (err) {
    await conn.rollback();
    console.error("[inventory/POST /stock-in]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});
router10.post("/stock-adjustment", async (req, res) => {
  if (!requireAdminOrClerk(req, res)) return;
  const parsed = stockAdjustmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }
  const { product_id, type, quantity, reason } = parsed.data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [productRows] = await conn.execute("SELECT id, quantity, product_name FROM products WHERE id = ? FOR UPDATE", [product_id]);
    if (productRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: `Product ID ${product_id} not found` });
      return;
    }
    const product = productRows[0];
    let newQuantity;
    let quantityChange;
    if (type === "Correction") {
      quantityChange = quantity - product.quantity;
      newQuantity = quantity;
    } else {
      if (quantity > product.quantity) {
        await conn.rollback();
        res.status(422).json({ message: "Insufficient stock for this adjustment" });
        return;
      }
      quantityChange = -quantity;
      newQuantity = product.quantity - quantity;
    }
    await conn.execute("UPDATE products SET quantity = ? WHERE id = ?", [newQuantity, product_id]);
    await conn.execute(`
      INSERT INTO inventory_logs 
        (product_id, transaction_type, action, quantity_change, quantity, remaining_stock, reference, user_id)
      VALUES (?, 'Adjustment', ?, ?, ?, ?, ?, ?)
    `, [product_id, type, quantityChange, product.quantity, newQuantity, reason, req.user?.id]);
    await conn.commit();
    await logAuditEvent({
      action: type === "Damaged" ? "DAMAGED_ITEM_RECORDED" : "STOCK_ADJUSTED",
      performedById: req.user.id,
      performedByUsername: req.user.username ?? "unknown",
      entityType: "products",
      entityId: product_id,
      reason,
      previousValues: { quantity: product.quantity },
      newValues: { quantity: newQuantity, adjustment_type: type }
    });
    res.status(201).json({ message: "Stock adjustment successful", product_id, type, new_quantity: newQuantity });
  } catch (err) {
    await conn.rollback();
    console.error("[inventory/POST /stock-adjustment]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});
var inventory_default = router10;

// server/routes/reorderAlerts.ts
init_db();
import { Router as Router11 } from "express";
var router11 = Router11();
router11.use(authenticate);
router11.use(requireRole("Admin"));
router11.get("/", async (req, res) => {
  try {
    const { category_id } = req.query;
    let where = `WHERE p.status = 'Active' AND p.quantity <= p.reorder_level`;
    const params = [];
    if (category_id) {
      where += " AND p.category_id = ?";
      params.push(Number(category_id));
    }
    const [rows] = await pool.execute(`
      SELECT
        p.id,
        p.barcode,
        p.product_name,
        COALESCE(c.category_name, '\u2014')  AS category,
        COALESCE(s.supplier_name, '\u2014')  AS supplier,
        s.contact_number                AS supplier_contact,
        COALESCE(u.unit_name, '')        AS unit,
        COALESCE(u.abbreviation, '')     AS unit_abbreviation,
        p.quantity,
        p.reorder_level,
        p.cost_price,
        p.selling_price,
        -- urgency level: 0 = out of stock, 1 = critical, 2 = low stock
        CASE
          WHEN p.quantity = 0                               THEN 'Out of Stock'
          WHEN p.quantity <= FLOOR(p.reorder_level * 0.5)  THEN 'Critical'
          ELSE                                                   'Low Stock'
        END AS urgency,
        -- units needed to reach reorder level
        (p.reorder_level - p.quantity)  AS units_needed
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN suppliers  s ON s.id = p.supplier_id
      LEFT JOIN units      u ON u.id = p.unit_id
      ${where}
      ORDER BY
        CASE
          WHEN p.quantity = 0                               THEN 0
          WHEN p.quantity <= FLOOR(p.reorder_level * 0.5)  THEN 1
          ELSE                                                   2
        END,
        p.product_name ASC
    `, params);
    res.status(200).json(rows);
  } catch (err) {
    console.error("[reorder-alerts/GET /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router11.get("/summary", async (_req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        COUNT(*)                                                                  AS total_alerts,
        SUM(CASE WHEN p.quantity = 0 THEN 1 ELSE 0 END)                          AS out_of_stock,
        SUM(CASE WHEN p.quantity > 0
                  AND p.quantity <= FLOOR(p.reorder_level * 0.5) THEN 1 ELSE 0 END) AS critical,
        SUM(CASE WHEN p.quantity > FLOOR(p.reorder_level * 0.5)
                  AND p.quantity <= p.reorder_level THEN 1 ELSE 0 END)            AS low_stock
      FROM products p
      WHERE p.status = 'Active' AND p.quantity <= p.reorder_level
    `);
    res.status(200).json(rows[0]);
  } catch (err) {
    console.error("[reorder-alerts/GET /summary]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
var reorderAlerts_default = router11;

// server/routes/dashboard.ts
init_db();
import { Router as Router12 } from "express";
var router12 = Router12();
router12.use(authenticate);
router12.use(requireRole("Admin"));
router12.get("/pending-counts", async (_req, res) => {
  try {
    const [commodityPending] = await pool.execute(
      "SELECT COUNT(*) as count FROM commodity_purchases WHERE status = 'PENDING_APPROVAL'"
    );
    const [returnsPending] = await pool.execute(
      "SELECT COUNT(*) as count FROM returns WHERE status = 'pending'"
    );
    const [voidsPending] = await pool.execute(
      "SELECT COUNT(*) as count FROM sale_voids WHERE status = 'pending'"
    );
    res.status(200).json({
      pending_commodity_approvals: Number(commodityPending[0]?.count || 0),
      pending_returns: Number(returnsPending[0]?.count || 0),
      pending_voids: Number(voidsPending[0]?.count || 0)
    });
  } catch (err) {
    console.error("[dashboard/GET /pending-counts]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router12.get("/", async (_req, res) => {
  try {
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + "-01";
    const [todayRows] = await pool.execute(`
      SELECT
        COUNT(*)            AS today_transactions,
        COALESCE(SUM(total_amount), 0) AS today_revenue
      FROM sales
      WHERE DATE(created_at) = ?
        AND void_status != 'voided'
    `, [today]);
    const [monthRows] = await pool.execute(`
      SELECT COALESCE(SUM(total_amount), 0) AS monthly_revenue
      FROM sales
      WHERE DATE(created_at) >= ?
        AND void_status != 'voided'
    `, [monthStart]);
    const [productRows] = await pool.execute(`
      SELECT
        COUNT(*)                                                                AS total_products,
        SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END)                          AS out_of_stock,
        SUM(CASE WHEN quantity > 0 AND quantity <= FLOOR(reorder_level * 0.5) THEN 1 ELSE 0 END) AS critical,
        SUM(CASE WHEN quantity > FLOOR(reorder_level * 0.5) AND quantity <= reorder_level THEN 1 ELSE 0 END) AS low_stock
      FROM products
      WHERE status = 'Active'
    `);
    const [supplierRows] = await pool.execute(`
      SELECT COUNT(*) AS total_suppliers FROM suppliers WHERE status = 'Active'
    `);
    const [returnsRows] = await pool.execute(`
      SELECT COUNT(*) AS pending_returns FROM returns WHERE status = 'pending'
    `);
    const [weeklyRows] = await pool.execute(`
      SELECT
        DATE(created_at)               AS sale_date,
        COUNT(*)                        AS transactions,
        COALESCE(SUM(total_amount), 0)  AS revenue
      FROM sales
      WHERE DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        AND void_status != 'voided'
      GROUP BY DATE(created_at)
      ORDER BY sale_date ASC
    `);
    const [monthlyRows] = await pool.execute(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m') AS month,
        COALESCE(SUM(total_amount), 0)   AS revenue
      FROM sales
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH)
        AND void_status != 'voided'
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month ASC
    `);
    const [topProductRows] = await pool.execute(`
      SELECT
        p.product_name AS name,
        SUM(si.quantity) AS units_sold,
        SUM(si.subtotal) AS revenue
      FROM sale_items si
      JOIN products p ON p.id = si.product_id
      JOIN sales s ON s.id = si.sale_id
      WHERE s.void_status != 'voided'
      GROUP BY si.product_id, p.product_name
      ORDER BY units_sold DESC
      LIMIT 5
    `);
    const [recentSalesRows] = await pool.execute(`
      SELECT
        s.invoice_number,
        s.customer_name,
        s.total_amount,
        u.full_name AS cashier_name,
        s.created_at
      FROM sales s
      JOIN users u ON u.id = s.cashier_id
      WHERE s.void_status != 'voided'
      ORDER BY s.created_at DESC
      LIMIT 8
    `);
    const [lowStockRows] = await pool.execute(`
      SELECT
        p.product_name,
        p.barcode,
        p.quantity,
        p.reorder_level,
        CASE
          WHEN p.quantity = 0 THEN 'Out of Stock'
          WHEN p.quantity <= FLOOR(p.reorder_level * 0.5) THEN 'Critical'
          ELSE 'Low Stock'
        END AS urgency
      FROM products p
      WHERE p.status = 'Active' AND p.quantity <= p.reorder_level
      ORDER BY p.quantity ASC
      LIMIT 5
    `);
    res.status(200).json({
      kpis: {
        today_transactions: Number(todayRows[0].today_transactions),
        today_revenue: Number(todayRows[0].today_revenue),
        monthly_revenue: Number(monthRows[0].monthly_revenue),
        total_products: Number(productRows[0].total_products),
        out_of_stock: Number(productRows[0].out_of_stock),
        critical: Number(productRows[0].critical),
        low_stock: Number(productRows[0].low_stock),
        total_suppliers: Number(supplierRows[0].total_suppliers),
        pending_returns: Number(returnsRows[0].pending_returns)
      },
      weekly_sales: weeklyRows,
      monthly_sales: monthlyRows,
      top_products: topProductRows,
      recent_sales: recentSalesRows,
      low_stock_items: lowStockRows
    });
  } catch (err) {
    console.error("[dashboard/GET /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
var dashboard_default = router12;

// server/routes/reports.ts
init_db();
import { Router as Router13 } from "express";
var router13 = Router13();
router13.use(authenticate);
router13.use(requireRole("Admin"));
router13.get("/", async (req, res) => {
  try {
    const {
      date_from = new Date((/* @__PURE__ */ new Date()).getFullYear(), (/* @__PURE__ */ new Date()).getMonth(), 1).toISOString().slice(0, 10),
      date_to = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
      report_type = "full",
      category_id,
      cashier_id
    } = req.query;
    const categoryFilter = category_id ? "AND p.category_id = ?" : "";
    const categoryParams = category_id ? [Number(category_id)] : [];
    const cashierFilter = cashier_id ? "AND s.cashier_id = ?" : "";
    const cashierParams = cashier_id ? [Number(cashier_id)] : [];
    const [summaryRows] = await pool.execute(`
      SELECT
        COUNT(*)                          AS total_transactions,
        COALESCE(SUM(total_amount), 0)    AS total_revenue,
        COALESCE(SUM(vat_amount), 0)      AS total_vat,
        COALESCE(SUM(subtotal), 0)        AS total_subtotal,
        COALESCE(AVG(total_amount), 0)    AS avg_order_value,
        COALESCE(MAX(total_amount), 0)    AS largest_sale,
        COALESCE(MIN(total_amount), 0)    AS smallest_sale
      FROM sales
      WHERE DATE(created_at) BETWEEN ? AND ?
        AND void_status != 'voided'
        ${cashierFilter}
    `, [date_from, date_to, ...cashierParams]);
    const [dailyRows] = await pool.execute(`
      SELECT
        DATE(created_at)                  AS sale_date,
        COUNT(*)                          AS transactions,
        COALESCE(SUM(subtotal), 0)        AS subtotal,
        COALESCE(SUM(vat_amount), 0)      AS vat,
        COALESCE(SUM(total_amount), 0)    AS total
      FROM sales
      WHERE DATE(created_at) BETWEEN ? AND ?
        AND void_status != 'voided'
        ${cashierFilter}
      GROUP BY DATE(created_at)
      ORDER BY sale_date ASC
    `, [date_from, date_to, ...cashierParams]);
    const [topProductRows] = await pool.execute(`
      SELECT
        p.barcode,
        p.product_name,
        COALESCE(c.category_name, '\u2014')  AS category,
        SUM(si.quantity)                AS units_sold,
        COALESCE(SUM(si.subtotal), 0)   AS revenue,
        CASE
          WHEN SUM(si.quantity) > 0 THEN COALESCE(SUM(si.subtotal), 0) / SUM(si.quantity)
          ELSE 0
        END                             AS unit_price
      FROM sale_items si
      JOIN products  p ON p.id = si.product_id
      JOIN sales     s ON s.id = si.sale_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
        AND s.void_status != 'voided'
        ${categoryFilter}
        ${cashierFilter.replace("s.", "s.")}
      GROUP BY si.product_id, p.product_name, p.barcode, c.category_name
      ORDER BY units_sold DESC
      LIMIT 20
    `, [date_from, date_to, ...categoryParams, ...cashierParams]);
    const [cashierRows] = await pool.execute(`
      SELECT
        u.full_name                       AS cashier,
        u.id                              AS cashier_id,
        COUNT(s.id)                       AS transactions,
        COALESCE(SUM(s.total_amount), 0)  AS revenue
      FROM sales s
      JOIN users u ON u.id = s.cashier_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
        AND s.void_status != 'voided'
        ${cashierFilter}
      GROUP BY s.cashier_id, u.full_name
      ORDER BY revenue DESC
    `, [date_from, date_to, ...cashierParams]);
    const [vatSummaryRows] = await pool.execute(`
      SELECT
        si.tax_type,
        COALESCE(SUM(si.taxable_amount), 0) AS taxable_sales,
        COALESCE(SUM(si.vat_amount), 0)     AS vat_amount,
        COALESCE(SUM(si.subtotal), 0)       AS gross_amount
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
        AND s.void_status != 'voided'
        ${cashierFilter.replace("s.", "s.")}
      GROUP BY si.tax_type
    `, [date_from, date_to, ...cashierParams]);
    const vatMap = {
      VATABLE: { taxable_sales: 0, vat_amount: 0, gross_amount: 0 },
      VAT_EXEMPT: { taxable_sales: 0, vat_amount: 0, gross_amount: 0 },
      ZERO_RATED: { taxable_sales: 0, vat_amount: 0, gross_amount: 0 },
      NON_TAXABLE: { taxable_sales: 0, vat_amount: 0, gross_amount: 0 }
    };
    for (const row of vatSummaryRows) {
      if (vatMap[row.tax_type]) {
        vatMap[row.tax_type] = {
          taxable_sales: Number(row.taxable_sales),
          vat_amount: Number(row.vat_amount),
          gross_amount: Number(row.gross_amount)
        };
      }
    }
    const totalVatAmount = Object.values(vatMap).reduce((s, v) => s + v.vat_amount, 0);
    const totalSales = Object.values(vatMap).reduce((s, v) => s + v.gross_amount, 0);
    const vat_summary = {
      vatable_sales: vatMap.VATABLE.taxable_sales,
      vat_exempt_sales: vatMap.VAT_EXEMPT.gross_amount,
      zero_rated_sales: vatMap.ZERO_RATED.gross_amount,
      non_taxable_sales: vatMap.NON_TAXABLE.gross_amount,
      total_vat_amount: totalVatAmount,
      total_sales: totalSales,
      by_type: vatMap
    };
    const [inventoryRows] = await pool.execute(`
      SELECT
        p.barcode,
        p.product_name,
        COALESCE(c.category_name, '\u2014')  AS category,
        COALESCE(s.supplier_name, '\u2014')  AS supplier,
        COALESCE(u.abbreviation, '')     AS unit,
        p.quantity,
        p.quantity_type,
        p.reorder_level,
        p.damaged_stock,
        p.cost_price,
        p.selling_price,
        CASE
          WHEN p.quantity = 0                              THEN 'Out of Stock'
          WHEN p.quantity <= FLOOR(p.reorder_level * 0.5) THEN 'Critical'
          WHEN p.quantity <= p.reorder_level               THEN 'Low Stock'
          ELSE                                                  'In Stock'
        END AS stock_status
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN suppliers  s ON s.id = p.supplier_id
      LEFT JOIN units      u ON u.id = p.unit_id
      WHERE p.status = 'Active'
        ${categoryFilter.replace("p.", "p.")}
      ORDER BY p.product_name ASC
    `, [...categoryParams]);
    const lowStockRows = inventoryRows.filter(
      (r) => r.stock_status !== "In Stock"
    );
    const [cashierListRows] = await pool.execute(`
      SELECT DISTINCT u.id, u.full_name
      FROM sales s
      JOIN users u ON u.id = s.cashier_id
      WHERE DATE(s.created_at) BETWEEN ? AND ?
        AND s.void_status != 'voided'
      ORDER BY u.full_name ASC
    `, [date_from, date_to]);
    const [categoryListRows] = await pool.execute(`
      SELECT DISTINCT c.id, c.category_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'Active'
      ORDER BY c.category_name ASC
    `);
    res.status(200).json({
      period: { date_from, date_to },
      summary: summaryRows[0],
      daily_sales: dailyRows,
      top_products: topProductRows,
      by_cashier: cashierRows,
      vat_summary,
      inventory: inventoryRows,
      low_stock: lowStockRows,
      filters: {
        cashiers: cashierListRows,
        categories: categoryListRows
      },
      generated_at: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    console.error("[reports/GET /]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
var reports_default = router13;

// server/routes/settings.ts
init_db();
import { Router as Router14 } from "express";
import { z as z10 } from "zod";
init_auditLogger();
var router14 = Router14();
router14.use(authenticate);
function requireAdmin6(req, res) {
  if (req.user?.role !== "Admin") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}
var settingsSchema = z10.object({
  // General
  store_name: z10.string().max(150).optional(),
  store_fb: z10.string().max(150).optional(),
  store_phone: z10.string().max(50).optional(),
  store_address: z10.string().max(255).optional(),
  currency: z10.string().max(10).optional(),
  // Business / taxpayer
  registered_taxpayer_name: z10.string().max(200).optional(),
  tin: z10.string().max(30).optional(),
  business_license: z10.string().max(100).optional(),
  // kept for backward compat
  document_type: z10.string().max(60).optional(),
  tax_rate: z10.number().min(0, "Tax rate cannot be negative").max(100, "Tax rate cannot exceed 100").optional(),
  vat_registered: z10.boolean().optional(),
  // POS machine
  pos_min: z10.string().max(30).optional(),
  pos_serial: z10.string().max(30).optional()
});
router14.get("/", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM store_settings WHERE id = 1 LIMIT 1");
    const row = rows[0] ?? {};
    res.set("Cache-Control", "no-store");
    res.status(200).json({
      ...row,
      tax_rate: Number(row.tax_rate ?? 0),
      vat_registered: Boolean(row.vat_registered)
    });
  } catch (err) {
    console.error("[settings/GET] Unexpected error:", err);
    res.status(500).json({ message: "An unexpected error occurred. Please try again." });
  }
});
router14.put("/", async (req, res) => {
  if (!requireAdmin6(req, res)) return;
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({
      field: String(i.path[0] ?? "general"),
      message: i.message
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
    const [prevRows] = await pool.execute("SELECT * FROM store_settings WHERE id = 1 LIMIT 1");
    const previous = prevRows[0] ?? {};
    const setClauses = ["updated_at = NOW()"];
    const values = [];
    const fieldMap = {
      store_name: "store_name",
      store_fb: "store_fb",
      store_phone: "store_phone",
      store_address: "store_address",
      currency: "currency",
      tax_rate: "tax_rate",
      business_license: "business_license",
      registered_taxpayer_name: "registered_taxpayer_name",
      tin: "tin",
      document_type: "document_type",
      pos_min: "pos_min",
      pos_serial: "pos_serial",
      vat_registered: "vat_registered"
    };
    for (const [key, col] of Object.entries(fieldMap)) {
      if (data[key] !== void 0) {
        setClauses.push(`${col} = ?`);
        values.push(data[key]);
      }
    }
    values.push(1);
    await pool.execute(`UPDATE store_settings SET ${setClauses.join(", ")} WHERE id = ?`, values);
    const [rows] = await pool.execute("SELECT * FROM store_settings WHERE id = 1 LIMIT 1");
    const row = rows[0] ?? {};
    const isTaxChange = data.tax_rate !== void 0 || data.vat_registered !== void 0;
    const isBusinessInfoChange = data.registered_taxpayer_name !== void 0 || data.tin !== void 0 || data.document_type !== void 0 || data.store_address !== void 0;
    const auditAction = isTaxChange ? "TAX_CONFIGURATION_UPDATED" : isBusinessInfoChange ? "BUSINESS_INFORMATION_UPDATED" : "SYSTEM_SETTINGS_UPDATED";
    await logAuditEvent({
      action: auditAction,
      performedById: req.user.id,
      performedByUsername: req.user.username,
      entityType: "store_settings",
      entityId: 1,
      previousValues: Object.fromEntries(
        Object.keys(data).map((k) => [k, previous[k]])
      ),
      newValues: data
    });
    res.status(200).json({
      ...row,
      tax_rate: Number(row.tax_rate ?? 0),
      vat_registered: Boolean(row.vat_registered)
    });
  } catch (err) {
    console.error("[settings/PUT] Unexpected error:", err);
    res.status(500).json({ message: "An unexpected error occurred. Please try again." });
  }
});
var settings_default = router14;

// server/routes/commodityPrices.ts
init_db();
import { Router as Router15 } from "express";
import { z as z11 } from "zod";
init_auditLogger();
var router15 = Router15();
router15.use(authenticate);
function requireAdmin7(req, res) {
  if (req.user?.role !== "Admin") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}
function requireAdminOrClerk2(req, res) {
  if (req.user?.role !== "Admin" && req.user?.role !== "Inventory Clerk") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}
function requireCashierOrAdmin(req, res) {
  if (req.user?.role !== "Cashier" && req.user?.role !== "Admin") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}
var setPriceSchema = z11.object({
  price_per_unit: z11.number().positive("Price must be greater than 0"),
  reason: z11.string().optional().nullable()
});
var purchaseSchema = z11.object({
  product_id: z11.number().int().positive(),
  supplier_id: z11.number().int().positive().optional().nullable(),
  seller_name: z11.string().max(150).optional().nullable(),
  quantity: z11.number().positive("Quantity must be greater than 0"),
  // NEW: deducted_quantity replaces deduction_per_unit
  // This is the physical quantity to deduct (e.g., 3 kg)
  deducted_quantity: z11.number().min(0).default(0),
  // Keep deduction_per_unit for backwards compatibility with old API calls
  // but it will be ignored in favor of deducted_quantity for new transactions
  deduction_per_unit: z11.number().min(0).optional().default(0),
  transaction_date: z11.string().min(1, "Transaction date is required"),
  remarks: z11.string().max(500).optional().nullable(),
  // Payment fields — recorded at purchase time
  payment_status: z11.enum(["UNPAID", "PARTIALLY_PAID", "PAID"]).default("UNPAID"),
  amount_paid: z11.number().min(0).default(0),
  payment_method: z11.string().max(50).optional().nullable(),
  payment_reference: z11.string().max(100).optional().nullable(),
  // Frontend-submitted calculated totals are accepted for schema validation only.
  // The backend recalculates all monetary values from DB data and ignores these.
  submitted_reference_price: z11.number().min(0).optional(),
  submitted_gross_amount: z11.number().min(0).optional(),
  submitted_total_deduction: z11.number().min(0).optional(),
  submitted_final_amount: z11.number().min(0).optional()
});
var recordPaymentSchema = z11.object({
  amount: z11.number().positive("Payment amount must be greater than 0"),
  payment_method: z11.string().max(50).optional().nullable(),
  payment_reference: z11.string().max(100).optional().nullable(),
  notes: z11.string().max(500).optional().nullable()
});
router15.get("/products", async (req, res) => {
  if (!requireAdminOrClerk2(req, res)) return;
  try {
    const [rows] = await pool.execute(`
      SELECT
        p.id,
        p.product_name,
        p.barcode,
        p.pricing_type,
        COALESCE(u.unit_name, '')        AS unit,
        COALESCE(u.abbreviation, '')     AS unit_abbreviation,
        u.id                             AS unit_id,
        p.quantity,
        lp.price_per_unit                AS current_price,
        lp.effective_from                AS price_effective_from
      FROM products p
      LEFT JOIN units u ON u.id = p.unit_id
      LEFT JOIN (
        SELECT cp1.product_id, cp1.price_per_unit, cp1.effective_from
        FROM commodity_prices cp1
        INNER JOIN (
          SELECT product_id, MAX(effective_from) AS max_ef
          FROM commodity_prices
          GROUP BY product_id
        ) cp2 ON cp1.product_id = cp2.product_id AND cp1.effective_from = cp2.max_ef
      ) lp ON lp.product_id = p.id
      WHERE p.pricing_type = 'MARKET_BASED'
        AND p.status = 'Active'
      ORDER BY p.product_name ASC
    `);
    res.status(200).json(rows);
  } catch (err) {
    console.error("[commodity/GET /products]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router15.get("/:productId/current", async (req, res) => {
  if (!requireAdminOrClerk2(req, res)) return;
  const productId = parseInt(req.params.productId, 10);
  if (isNaN(productId)) {
    res.status(400).json({ message: "Invalid product ID." });
    return;
  }
  try {
    const [rows] = await pool.execute(`
      SELECT
        cp.id,
        cp.product_id,
        p.product_name,
        COALESCE(u.unit_name, '')    AS unit,
        COALESCE(u.abbreviation, '') AS unit_abbreviation,
        cp.price_per_unit,
        cp.effective_from,
        cp.reason,
        COALESCE(usr.full_name, '\u2014') AS changed_by_name
      FROM commodity_prices cp
      JOIN products p   ON p.id   = cp.product_id
      LEFT JOIN units u ON u.id   = p.unit_id
      LEFT JOIN users usr ON usr.id = cp.changed_by
      WHERE cp.product_id = ?
      ORDER BY cp.effective_from DESC
      LIMIT 1
    `, [productId]);
    if (rows.length === 0) {
      res.status(404).json({ message: "No price has been set for this product yet." });
      return;
    }
    res.status(200).json({ ...rows[0], price_per_unit: Number(rows[0].price_per_unit) });
  } catch (err) {
    console.error("[commodity/GET /:productId/current]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router15.get("/:productId/history", async (req, res) => {
  if (!requireAdminOrClerk2(req, res)) return;
  const productId = parseInt(req.params.productId, 10);
  if (isNaN(productId)) {
    res.status(400).json({ message: "Invalid product ID." });
    return;
  }
  try {
    const [rows] = await pool.execute(`
      SELECT
        cp.id,
        cp.price_per_unit,
        cp.effective_from,
        cp.reason,
        COALESCE(usr.full_name, '\u2014') AS changed_by_name
      FROM commodity_prices cp
      LEFT JOIN users usr ON usr.id = cp.changed_by
      WHERE cp.product_id = ?
      ORDER BY cp.effective_from DESC
    `, [productId]);
    res.status(200).json(rows.map((r) => ({ ...r, price_per_unit: Number(r.price_per_unit) })));
  } catch (err) {
    console.error("[commodity/GET /:productId/history]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router15.post("/:productId/set-price", async (req, res) => {
  if (!requireAdmin7(req, res)) return;
  const productId = parseInt(req.params.productId, 10);
  if (isNaN(productId)) {
    res.status(400).json({ message: "Invalid product ID." });
    return;
  }
  const parsed = setPriceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }
  const { price_per_unit, reason } = parsed.data;
  try {
    const [productRows] = await pool.execute(
      "SELECT id, product_name, pricing_type FROM products WHERE id = ? LIMIT 1",
      [productId]
    );
    if (productRows.length === 0) {
      res.status(404).json({ message: "Product not found." });
      return;
    }
    if (productRows[0].pricing_type !== "MARKET_BASED") {
      res.status(422).json({ message: "This product is not configured as MARKET_BASED. Update the product's pricing type first." });
      return;
    }
    const [prevRows] = await pool.execute(
      "SELECT price_per_unit FROM commodity_prices WHERE product_id = ? ORDER BY effective_from DESC LIMIT 1",
      [productId]
    );
    const previousPrice = prevRows[0]?.price_per_unit ?? null;
    const [result] = await pool.execute(
      `INSERT INTO commodity_prices (product_id, price_per_unit, changed_by, reason)
       VALUES (?, ?, ?, ?)`,
      [productId, price_per_unit, req.user.id, reason ?? null]
    );
    await logAuditEvent({
      action: "COMMODITY_PRICE_CHANGED",
      performedById: req.user.id,
      performedByUsername: req.user.username,
      entityType: "commodity_prices",
      entityId: result.insertId,
      previousValues: previousPrice !== null ? { price_per_unit: Number(previousPrice) } : void 0,
      newValues: { price_per_unit, product_id: productId, product_name: productRows[0].product_name },
      reason: reason ?? void 0
    });
    res.status(201).json({
      message: "Price updated successfully.",
      id: result.insertId,
      product_id: productId,
      price_per_unit,
      previous_price: previousPrice !== null ? Number(previousPrice) : null
    });
  } catch (err) {
    console.error("[commodity/POST /:productId/set-price]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router15.post("/purchase", async (req, res) => {
  if (!requireAdminOrClerk2(req, res)) return;
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }
  const {
    product_id,
    supplier_id,
    seller_name,
    quantity,
    deducted_quantity,
    deduction_per_unit,
    transaction_date,
    remarks
  } = parsed.data;
  const useNewModel = deducted_quantity > 0;
  const effectiveDeductedQty = useNewModel ? deducted_quantity : 0;
  const legacyDeductionPerUnit = deduction_per_unit || 0;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [productRows] = await conn.execute(
      "SELECT id, product_name, pricing_type, unit_id, quantity AS current_qty FROM products WHERE id = ? FOR UPDATE",
      [product_id]
    );
    if (productRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Product not found." });
      return;
    }
    const product = productRows[0];
    if (product.pricing_type !== "MARKET_BASED") {
      await conn.rollback();
      res.status(422).json({ message: "This product is not configured as MARKET_BASED." });
      return;
    }
    const [priceRows] = await conn.execute(
      "SELECT price_per_unit FROM commodity_prices WHERE product_id = ? ORDER BY effective_from DESC LIMIT 1",
      [product_id]
    );
    if (priceRows.length === 0) {
      await conn.rollback();
      res.status(422).json({ message: "No reference price has been set for this product. Please set a current buying price first." });
      return;
    }
    const reference_price = Number(priceRows[0].price_per_unit);
    const [unitRows] = await conn.execute(
      "SELECT id, unit_name, abbreviation FROM units WHERE id = ? LIMIT 1",
      [product.unit_id]
    );
    const unit = unitRows[0] ?? { id: product.unit_id, unit_name: "unit", abbreviation: "unit" };
    const qtyReceived = Math.max(0, Number(quantity));
    let payable_quantity;
    let deduction_amount;
    let total_deduction;
    let gross_amount;
    let final_amount;
    let final_unit_price;
    if (useNewModel) {
      const deductedQty = Math.max(0, effectiveDeductedQty);
      if (deductedQty > qtyReceived) {
        await conn.rollback();
        res.status(422).json({
          message: `Deducted quantity (${deductedQty}) cannot exceed the quantity received (${qtyReceived}).`
        });
        return;
      }
      payable_quantity = Math.round((qtyReceived - deductedQty) * 1e4) / 1e4;
      deduction_amount = Math.round(deductedQty * reference_price * 1e4) / 1e4;
      gross_amount = Math.round(qtyReceived * reference_price * 1e4) / 1e4;
      final_amount = Math.round(payable_quantity * reference_price * 1e4) / 1e4;
      final_unit_price = reference_price;
      total_deduction = deduction_amount;
    } else {
      const deduction = Math.max(0, legacyDeductionPerUnit);
      if (deduction > reference_price) {
        await conn.rollback();
        res.status(422).json({ message: "Deduction per unit cannot exceed the reference price." });
        return;
      }
      payable_quantity = qtyReceived;
      deduction_amount = 0;
      final_unit_price = Math.round((reference_price - deduction) * 1e4) / 1e4;
      gross_amount = Math.round(qtyReceived * reference_price * 1e4) / 1e4;
      total_deduction = Math.round(qtyReceived * deduction * 1e4) / 1e4;
      final_amount = Math.round(qtyReceived * final_unit_price * 1e4) / 1e4;
    }
    const purchaseStatus = "PENDING_APPROVAL";
    const [purchaseResult] = await conn.execute(`
      INSERT INTO commodity_purchases
        (product_id, supplier_id, seller_name, quantity, unit_id, unit_name,
         reference_price, 
         deducted_quantity, payable_quantity, deduction_amount,
         deduction_per_unit, final_unit_price,
         gross_amount, total_deduction, final_amount,
         payment_status,
         status, prepared_by,
         remarks, recorded_by, transaction_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      product_id,
      supplier_id ?? null,
      seller_name?.trim() || null,
      quantity,
      unit.id,
      unit.unit_name,
      reference_price,
      // New columns for physical quantity deduction
      effectiveDeductedQty,
      payable_quantity,
      deduction_amount,
      // Legacy columns for backwards compatibility
      useNewModel ? 0 : legacyDeductionPerUnit,
      final_unit_price,
      gross_amount,
      total_deduction,
      final_amount,
      "UNPAID",
      // payment_status starts as UNPAID
      purchaseStatus,
      // PENDING_APPROVAL
      req.user.id,
      // prepared_by = Clerk who submitted
      remarks?.trim() || null,
      req.user.id,
      // recorded_by
      transaction_date
    ]);
    const purchaseId = purchaseResult.insertId;
    await conn.commit();
    await logAuditEvent({
      action: "COMMODITY_PURCHASE_SUBMITTED",
      performedById: req.user.id,
      performedByUsername: req.user.username,
      entityType: "commodity_purchases",
      entityId: purchaseId,
      newValues: {
        product_id,
        product_name: product.product_name,
        quantity,
        unit: unit.unit_name,
        reference_price,
        // New fields for physical quantity deduction
        deducted_quantity: effectiveDeductedQty,
        payable_quantity,
        deduction_amount,
        // Legacy field (for backwards compatibility)
        deduction_per_unit: useNewModel ? 0 : legacyDeductionPerUnit,
        final_unit_price,
        final_amount,
        status: purchaseStatus
      }
    });
    res.status(201).json({
      message: "Commodity purchase submitted for approval.",
      id: purchaseId,
      product_id,
      quantity,
      // New response fields
      deducted_quantity: effectiveDeductedQty,
      payable_quantity,
      deduction_amount,
      reference_price,
      // Legacy fields for backwards compatibility
      deduction_per_unit: useNewModel ? 0 : legacyDeductionPerUnit,
      final_unit_price,
      gross_amount,
      total_deduction,
      final_amount,
      status: purchaseStatus,
      payment_status: "UNPAID",
      amount_paid: 0,
      balance_due: final_amount
    });
  } catch (err) {
    await conn.rollback();
    console.error("[commodity/POST /purchase]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});
router15.get("/purchases/pending", async (req, res) => {
  if (!requireAdmin7(req, res)) return;
  try {
    const [countCheck] = await pool.execute(`
      SELECT status, COUNT(*) as cnt FROM commodity_purchases GROUP BY status
    `);
    const [rows] = await pool.execute(`
      SELECT
        cp.id,
        cp.product_id,
        p.product_name,
        p.barcode,
        cp.seller_name,
        cp.quantity,
        cp.unit_name,
        cp.reference_price,
        -- New columns for physical quantity deduction
        cp.deducted_quantity,
        cp.payable_quantity,
        cp.deduction_amount,
        -- Legacy columns for backwards compatibility
        cp.deduction_per_unit,
        cp.final_unit_price,
        cp.gross_amount,
        cp.total_deduction,
        cp.final_amount,
        cp.remarks,
        cp.transaction_date,
        cp.created_at,
        cp.status AS approval_status,
        cp.prepared_by,
        COALESCE(u.full_name, '\u2014') AS prepared_by_name
      FROM commodity_purchases cp
      JOIN products p ON p.id = cp.product_id
      LEFT JOIN users u ON u.id = cp.prepared_by
      WHERE cp.status = 'PENDING_APPROVAL'
      ORDER BY cp.created_at ASC
    `);
    res.status(200).json(rows.map((r) => ({
      ...r,
      quantity: Number(r.quantity),
      // New fields
      deducted_quantity: Number(r.deducted_quantity),
      payable_quantity: Number(r.payable_quantity),
      deduction_amount: Number(r.deduction_amount),
      reference_price: Number(r.reference_price),
      // Legacy fields
      deduction_per_unit: Number(r.deduction_per_unit),
      final_unit_price: Number(r.final_unit_price),
      gross_amount: Number(r.gross_amount),
      total_deduction: Number(r.total_deduction),
      final_amount: Number(r.final_amount)
    })));
  } catch (err) {
    console.error("[commodity/GET /purchases/pending]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router15.get("/purchases/approved", async (req, res) => {
  if (!requireCashierOrAdmin(req, res)) return;
  const { payment_status } = req.query;
  let where = "WHERE cp.status = 'APPROVED'";
  const params = [];
  if (payment_status) {
    where += " AND cp.payment_status = ?";
    params.push(payment_status);
  }
  try {
    const [rows] = await pool.execute(`
      SELECT
        cp.id,
        cp.product_id,
        p.product_name,
        p.barcode,
        cp.seller_name,
        cp.quantity,
        cp.unit_name,
        cp.reference_price,
        -- New columns for physical quantity deduction
        cp.deducted_quantity,
        cp.payable_quantity,
        cp.deduction_amount,
        -- Legacy columns for backwards compatibility
        cp.deduction_per_unit,
        cp.final_unit_price,
        cp.gross_amount,
        cp.total_deduction,
        cp.final_amount,
        cp.payment_status,
        cp.amount_paid,
        cp.payment_method,
        cp.payment_reference,
        cp.paid_at,
        cp.remarks,
        cp.transaction_date,
        cp.created_at,
        cp.status AS approval_status,
        cp.approved_by,
        cp.approved_at,
        COALESCE(u.full_name, '\u2014') AS approved_by_name
      FROM commodity_purchases cp
      JOIN products p ON p.id = cp.product_id
      LEFT JOIN users u ON u.id = cp.approved_by
      ${where}
      ORDER BY cp.approved_at DESC
    `, params);
    res.status(200).json(rows.map((r) => ({
      ...r,
      quantity: Number(r.quantity),
      // New fields
      deducted_quantity: Number(r.deducted_quantity),
      payable_quantity: Number(r.payable_quantity),
      deduction_amount: Number(r.deduction_amount),
      reference_price: Number(r.reference_price),
      // Legacy fields
      deduction_per_unit: Number(r.deduction_per_unit),
      final_unit_price: Number(r.final_unit_price),
      gross_amount: Number(r.gross_amount),
      total_deduction: Number(r.total_deduction),
      final_amount: Number(r.final_amount),
      amount_paid: Number(r.amount_paid),
      balance_due: Math.round((Number(r.final_amount) - Number(r.amount_paid)) * 1e4) / 1e4
    })));
  } catch (err) {
    console.error("[commodity/GET /purchases/approved]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router15.post("/purchases/:id/payment", async (req, res) => {
  if (!requireCashierOrAdmin(req, res)) return;
  const purchaseId = parseInt(req.params.id, 10);
  if (isNaN(purchaseId)) {
    res.status(400).json({ message: "Invalid purchase ID." });
    return;
  }
  const parsed = recordPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }
  const { amount, payment_method, payment_reference, notes } = parsed.data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [purchaseRows] = await conn.execute(
      "SELECT id, status, final_amount, amount_paid, payment_status, product_id FROM commodity_purchases WHERE id = ? FOR UPDATE",
      [purchaseId]
    );
    if (purchaseRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Purchase not found." });
      return;
    }
    const purchase = purchaseRows[0];
    if (purchase.status !== "APPROVED") {
      await conn.rollback();
      res.status(422).json({ message: `Cannot record payment. Purchase status: ${purchase.status}` });
      return;
    }
    if (purchase.payment_status === "PAID") {
      await conn.rollback();
      res.status(422).json({ message: "This purchase has already been fully paid." });
      return;
    }
    const final_amount = Number(purchase.final_amount);
    const prev_paid = Number(purchase.amount_paid);
    const new_total = Math.round((prev_paid + amount) * 1e4) / 1e4;
    if (new_total > final_amount) {
      await conn.rollback();
      res.status(422).json({
        message: `Payment of \u20B1${amount.toFixed(2)} would exceed the final amount. Balance due: \u20B1${(final_amount - prev_paid).toFixed(2)}.`
      });
      return;
    }
    let new_status;
    if (new_total <= 0) {
      new_status = "UNPAID";
    } else if (new_total >= final_amount) {
      new_status = "PAID";
    } else {
      new_status = "PARTIALLY_PAID";
    }
    const prev_status = purchase.payment_status;
    const [paymentResult] = await conn.execute(`
      INSERT INTO commodity_purchase_payments
        (commodity_purchase_id, amount, payment_method, payment_reference, notes, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      purchaseId,
      amount,
      payment_method?.trim() || null,
      payment_reference?.trim() || null,
      notes?.trim() || null,
      req.user.id
    ]);
    await conn.execute(`
      UPDATE commodity_purchases
      SET amount_paid = ?,
          payment_status = ?,
          payment_method = COALESCE(?, payment_method),
          payment_reference = COALESCE(?, payment_reference),
          paid_at = NOW(),
          paid_by = ?
      WHERE id = ?
    `, [
      new_total,
      new_status,
      payment_method?.trim() || null,
      payment_reference?.trim() || null,
      req.user.id,
      purchaseId
    ]);
    await conn.commit();
    const [prodRows] = await pool.execute(
      "SELECT product_name FROM products WHERE id = ? LIMIT 1",
      [purchase.product_id]
    );
    const product_name = prodRows[0]?.product_name ?? "";
    await logAuditEvent({
      action: "PAYMENT_RECORDED",
      performedById: req.user.id,
      performedByUsername: req.user.username,
      entityType: "commodity_purchases",
      entityId: purchaseId,
      newValues: {
        payment_event_id: paymentResult.insertId,
        amount_this_payment: amount,
        total_amount_paid: new_total,
        payment_status: new_status,
        payment_method: payment_method ?? null,
        product_name
      }
    });
    if (prev_status !== new_status) {
      await logAuditEvent({
        action: "PAYMENT_STATUS_CHANGED",
        performedById: req.user.id,
        performedByUsername: req.user.username,
        entityType: "commodity_purchases",
        entityId: purchaseId,
        previousValues: { payment_status: prev_status, amount_paid: prev_paid },
        newValues: { payment_status: new_status, amount_paid: new_total, product_name }
      });
    }
    res.status(201).json({
      message: "Payment recorded successfully.",
      purchase_id: purchaseId,
      payment_event_id: paymentResult.insertId,
      amount_this_payment: amount,
      total_amount_paid: new_total,
      balance_due: Math.round((final_amount - new_total) * 1e4) / 1e4,
      payment_status: new_status
    });
  } catch (err) {
    await conn.rollback();
    console.error("[commodity/POST /purchases/:id/payment]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});
router15.get("/purchases/:id/payments", async (req, res) => {
  if (!requireAdminOrClerk2(req, res)) return;
  const purchaseId = parseInt(req.params.id, 10);
  if (isNaN(purchaseId)) {
    res.status(400).json({ message: "Invalid purchase ID." });
    return;
  }
  try {
    const [rows] = await pool.execute(`
      SELECT
        cpp.id,
        cpp.commodity_purchase_id,
        cpp.amount,
        cpp.payment_method,
        cpp.payment_reference,
        cpp.notes,
        cpp.created_at,
        COALESCE(u.full_name, '\u2014') AS recorded_by_name
      FROM commodity_purchase_payments cpp
      LEFT JOIN users u ON u.id = cpp.recorded_by
      WHERE cpp.commodity_purchase_id = ?
      ORDER BY cpp.created_at ASC
    `, [purchaseId]);
    res.status(200).json(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
  } catch (err) {
    console.error("[commodity/GET /purchases/:id/payments]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router15.get("/purchases", async (req, res) => {
  if (!requireAdminOrClerk2(req, res)) return;
  const limit = Math.min(1e3, Math.max(1, parseInt(req.query.limit || "50", 10)));
  const offset = Math.max(0, parseInt(req.query.offset || "0", 10));
  const { product_id, date_from, date_to, payment_status, status } = req.query;
  let where = "WHERE 1=1";
  const params = [];
  if (product_id) {
    where += " AND cp.product_id = ?";
    params.push(parseInt(product_id, 10));
  }
  if (date_from) {
    where += " AND cp.transaction_date >= ?";
    params.push(date_from);
  }
  if (date_to) {
    where += " AND cp.transaction_date <= ?";
    params.push(date_to);
  }
  if (payment_status) {
    where += " AND cp.payment_status = ?";
    params.push(payment_status);
  }
  if (status) {
    where += " AND cp.status = ?";
    params.push(status);
  }
  params.push(limit, offset);
  try {
    const [rows] = await pool.execute(`
      SELECT
        cp.id,
        cp.product_id,
        p.product_name,
        p.barcode,
        COALESCE(s.supplier_name, cp.seller_name, '\u2014') AS seller,
        cp.quantity,
        cp.unit_name,
        cp.reference_price,
        -- New columns for physical quantity deduction
        cp.deducted_quantity,
        cp.payable_quantity,
        cp.deduction_amount,
        -- Legacy columns for backwards compatibility
        cp.deduction_per_unit,
        cp.final_unit_price,
        cp.gross_amount,
        cp.total_deduction,
        cp.final_amount,
        cp.payment_status,
        cp.status AS approval_status,
        cp.amount_paid,
        cp.payment_method,
        cp.payment_reference,
        cp.paid_at,
        cp.remarks,
        cp.transaction_date,
        cp.created_at,
        cp.prepared_by,
        COALESCE(u.full_name, '\u2014') AS recorded_by_name,
        COALESCE(prep.full_name, '\u2014') AS prepared_by_name,
        cp.approved_by,
        cp.approved_at,
        cp.rejected_by,
        cp.rejected_at,
        cp.rejection_reason
      FROM commodity_purchases cp
      JOIN products p ON p.id = cp.product_id
      LEFT JOIN suppliers s ON s.id = cp.supplier_id
      LEFT JOIN users u ON u.id = cp.recorded_by
      LEFT JOIN users prep ON prep.id = cp.prepared_by
      ${where}
      ORDER BY cp.transaction_date DESC, cp.created_at DESC
      LIMIT ? OFFSET ?
    `, params);
    res.status(200).json(rows.map((r) => ({
      ...r,
      quantity: Number(r.quantity),
      // New fields
      deducted_quantity: Number(r.deducted_quantity),
      payable_quantity: Number(r.payable_quantity),
      deduction_amount: Number(r.deduction_amount),
      reference_price: Number(r.reference_price),
      // Legacy fields
      deduction_per_unit: Number(r.deduction_per_unit),
      final_unit_price: Number(r.final_unit_price),
      gross_amount: Number(r.gross_amount),
      total_deduction: Number(r.total_deduction),
      final_amount: Number(r.final_amount),
      amount_paid: Number(r.amount_paid),
      balance_due: Math.round((Number(r.final_amount) - Number(r.amount_paid)) * 1e4) / 1e4
    })));
  } catch (err) {
    console.error("[commodity/GET /purchases]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router15.post("/purchases/:id/approve", async (req, res) => {
  if (!requireAdmin7(req, res)) return;
  const purchaseId = parseInt(req.params.id, 10);
  if (isNaN(purchaseId)) {
    res.status(400).json({ message: "Invalid purchase ID." });
    return;
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [purchaseRows] = await conn.execute(
      "SELECT id, status, product_id, quantity, payable_quantity, deducted_quantity, prepared_by FROM commodity_purchases WHERE id = ? FOR UPDATE",
      [purchaseId]
    );
    if (purchaseRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Purchase not found." });
      return;
    }
    const purchase = purchaseRows[0];
    if (purchase.status !== "PENDING_APPROVAL") {
      await conn.rollback();
      res.status(422).json({ message: `Cannot approve. Current status: ${purchase.status}` });
      return;
    }
    if (purchase.prepared_by === req.user.id) {
      await conn.rollback();
      res.status(403).json({ message: "You cannot approve your own purchase request." });
      return;
    }
    const [productRows] = await conn.execute(
      "SELECT id, product_name, quantity AS current_qty FROM products WHERE id = ? FOR UPDATE",
      [purchase.product_id]
    );
    if (productRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Product not found." });
      return;
    }
    const product = productRows[0];
    await conn.execute(`
      UPDATE commodity_purchases
      SET status = 'APPROVED',
          approved_by = ?,
          approved_at = NOW()
      WHERE id = ?
    `, [req.user.id, purchaseId]);
    const payableQty = Number(purchase.payable_quantity ?? null) > 0 && Number(purchase.payable_quantity) <= Number(purchase.quantity) ? Number(purchase.payable_quantity) : Number(purchase.quantity);
    const newQty = Math.round((Number(product.current_qty) + payableQty) * 1e3) / 1e3;
    await conn.execute(
      "UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?",
      [newQty, purchase.product_id]
    );
    await conn.execute(`
      INSERT INTO inventory_logs
        (product_id, transaction_type, action, quantity_change, quantity, remaining_stock,
         reference, commodity_purchase_id, user_id)
      VALUES (?, 'Stock In', 'Commodity Purchase Approved', ?, ?, ?, ?, ?, ?)
    `, [
      purchase.product_id,
      payableQty,
      product.current_qty,
      newQty,
      `CP-${purchaseId}`,
      purchaseId,
      req.user.id
    ]);
    await conn.commit();
    await logAuditEvent({
      action: "COMMODITY_PURCHASE_APPROVED",
      performedById: req.user.id,
      performedByUsername: req.user.username,
      entityType: "commodity_purchases",
      entityId: purchaseId,
      newValues: {
        product_id: purchase.product_id,
        product_name: product.product_name,
        quantity_received_gross: Number(purchase.quantity),
        deducted_quantity: Number(purchase.deducted_quantity ?? 0),
        quantity_added: payableQty,
        new_stock_quantity: newQty
      }
    });
    res.status(200).json({
      message: "Purchase approved. Inventory updated.",
      id: purchaseId,
      status: "APPROVED",
      new_stock_quantity: newQty,
      payable_quantity: payableQty,
      deducted_quantity: Number(purchase.deducted_quantity ?? 0)
    });
  } catch (err) {
    await conn.rollback();
    console.error("[commodity/POST /purchases/:id/approve]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});
var rejectSchema2 = z11.object({
  rejection_reason: z11.string().min(1, "Rejection reason is required").max(500)
});
router15.post("/purchases/:id/reject", async (req, res) => {
  if (!requireAdmin7(req, res)) return;
  const purchaseId = parseInt(req.params.id, 10);
  if (isNaN(purchaseId)) {
    res.status(400).json({ message: "Invalid purchase ID." });
    return;
  }
  const parsed = rejectSchema2.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }
  const { rejection_reason } = parsed.data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [purchaseRows] = await conn.execute(
      "SELECT id, status, product_id, prepared_by FROM commodity_purchases WHERE id = ? FOR UPDATE",
      [purchaseId]
    );
    if (purchaseRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Purchase not found." });
      return;
    }
    const purchase = purchaseRows[0];
    if (purchase.status !== "PENDING_APPROVAL") {
      await conn.rollback();
      res.status(422).json({ message: `Cannot reject. Current status: ${purchase.status}` });
      return;
    }
    if (purchase.prepared_by === req.user.id) {
      await conn.rollback();
      res.status(403).json({ message: "You cannot reject your own purchase request." });
      return;
    }
    await conn.execute(`
      UPDATE commodity_purchases
      SET status = 'REJECTED',
          rejected_by = ?,
          rejected_at = NOW(),
          rejection_reason = ?
      WHERE id = ?
    `, [req.user.id, rejection_reason.trim(), purchaseId]);
    await conn.commit();
    await logAuditEvent({
      action: "COMMODITY_PURCHASE_REJECTED",
      performedById: req.user.id,
      performedByUsername: req.user.username,
      entityType: "commodity_purchases",
      entityId: purchaseId,
      newValues: {
        product_id: purchase.product_id,
        rejection_reason: rejection_reason.trim()
      }
    });
    res.status(200).json({
      message: "Purchase rejected.",
      id: purchaseId,
      status: "REJECTED"
    });
  } catch (err) {
    await conn.rollback();
    console.error("[commodity/POST /purchases/:id/reject]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});
var commodityPrices_default = router15;

// server/routes/externalProcessing.ts
init_db();
import { Router as Router16 } from "express";
import { z as z12 } from "zod";
init_auditLogger();
var router16 = Router16();
router16.use(authenticate);
function requireAdmin8(req, res) {
  if (req.user?.role !== "Admin") {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}
var createCompanySchema = z12.object({
  name: z12.string().min(1, "Company name is required").max(200),
  address: z12.string().max(500).optional().nullable(),
  contact: z12.string().max(100).optional().nullable()
});
var recordDeliverySchema = z12.object({
  product_id: z12.number().int().positive("Product is required"),
  quantity: z12.number().positive("Quantity must be greater than 0"),
  company_id: z12.number().int().positive().optional().nullable().default(null),
  company_name: z12.string().min(1).max(200).optional(),
  delivery_date: z12.string().min(1, "Delivery date is required"),
  delivered_by: z12.string().max(200).optional().nullable(),
  remarks: z12.string().max(500).optional().nullable()
}).refine((d) => d.company_id || d.company_name?.trim(), {
  message: "Processing company is required",
  path: ["company_name"]
});
router16.get("/companies", async (req, res) => {
  if (!requireAdmin8(req, res)) return;
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, address, contact, is_active, created_at
       FROM external_processing_companies
       WHERE is_active = 1
       ORDER BY name ASC`
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error("[externalProcessing/GET /companies]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router16.get("/companies/all", async (req, res) => {
  if (!requireAdmin8(req, res)) return;
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, address, contact, is_active, created_at
       FROM external_processing_companies
       ORDER BY is_active DESC, name ASC`
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error("[externalProcessing/GET /companies/all]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router16.post("/companies", async (req, res) => {
  if (!requireAdmin8(req, res)) return;
  const parsed = createCompanySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }
  const { name, address, contact } = parsed.data;
  try {
    const [existing] = await pool.execute(
      "SELECT id FROM external_processing_companies WHERE name = ? LIMIT 1",
      [name.trim()]
    );
    if (existing.length > 0) {
      res.status(409).json({ message: "A company with this name already exists." });
      return;
    }
    const [result] = await pool.execute(
      `INSERT INTO external_processing_companies (name, address, contact)
       VALUES (?, ?, ?)`,
      [name.trim(), address?.trim() || null, contact?.trim() || null]
    );
    await logAuditEvent({
      action: "EP_COMPANY_CREATED",
      performedById: req.user.id,
      performedByUsername: req.user.username,
      entityType: "external_processing_companies",
      entityId: result.insertId,
      newValues: { name, address, contact }
    });
    res.status(201).json({
      id: result.insertId,
      name: name.trim(),
      address: address?.trim() || null,
      contact: contact?.trim() || null,
      is_active: 1,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    console.error("[externalProcessing/POST /companies]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router16.put("/companies/:id", async (req, res) => {
  if (!requireAdmin8(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid company ID." });
    return;
  }
  const parsed = createCompanySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }
  const { name, address, contact } = parsed.data;
  try {
    const [existing] = await pool.execute(
      "SELECT id FROM external_processing_companies WHERE id = ? LIMIT 1",
      [id]
    );
    if (existing.length === 0) {
      res.status(404).json({ message: "Company not found." });
      return;
    }
    const [dup] = await pool.execute(
      "SELECT id FROM external_processing_companies WHERE name = ? AND id != ? LIMIT 1",
      [name.trim(), id]
    );
    if (dup.length > 0) {
      res.status(409).json({ message: "Another company with this name already exists." });
      return;
    }
    await pool.execute(
      "UPDATE external_processing_companies SET name = ?, address = ?, contact = ? WHERE id = ?",
      [name.trim(), address?.trim() || null, contact?.trim() || null, id]
    );
    await logAuditEvent({
      action: "EP_COMPANY_UPDATED",
      performedById: req.user.id,
      performedByUsername: req.user.username,
      entityType: "external_processing_companies",
      entityId: id,
      newValues: { name, address, contact }
    });
    res.status(200).json({ id, name: name.trim(), address: address?.trim() || null, contact: contact?.trim() || null });
  } catch (err) {
    console.error("[externalProcessing/PUT /companies/:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router16.delete("/companies/:id", async (req, res) => {
  if (!requireAdmin8(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid company ID." });
    return;
  }
  try {
    const [existing] = await pool.execute(
      "SELECT id, name FROM external_processing_companies WHERE id = ? LIMIT 1",
      [id]
    );
    if (existing.length === 0) {
      res.status(404).json({ message: "Company not found." });
      return;
    }
    const [deliveries] = await pool.execute(
      "SELECT COUNT(*) AS cnt FROM external_processing_deliveries WHERE company_id = ?",
      [id]
    );
    if (deliveries[0].cnt > 0) {
      await pool.execute(
        "UPDATE external_processing_companies SET is_active = 0 WHERE id = ?",
        [id]
      );
      await logAuditEvent({
        action: "EP_COMPANY_DEACTIVATED",
        performedById: req.user.id,
        performedByUsername: req.user.username,
        entityType: "external_processing_companies",
        entityId: id,
        newValues: { is_active: 0 }
      });
      res.status(200).json({ message: "Company deactivated (has existing deliveries, cannot be permanently deleted)." });
    } else {
      await pool.execute("DELETE FROM external_processing_companies WHERE id = ?", [id]);
      await logAuditEvent({
        action: "EP_COMPANY_DELETED",
        performedById: req.user.id,
        performedByUsername: req.user.username,
        entityType: "external_processing_companies",
        entityId: id,
        newValues: { deleted: true }
      });
      res.status(200).json({ message: "Company deleted." });
    }
  } catch (err) {
    console.error("[externalProcessing/DELETE /companies/:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router16.post("/deliveries", async (req, res) => {
  if (!requireAdmin8(req, res)) return;
  const parsed = recordDeliverySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "general"), message: i.message })) });
    return;
  }
  const { product_id, quantity, delivery_date, delivered_by, remarks } = parsed.data;
  let { company_id } = parsed.data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (!company_id && parsed.data.company_name) {
      const name = parsed.data.company_name.trim();
      const [existing] = await conn.execute(
        "SELECT id FROM external_processing_companies WHERE name = ? LIMIT 1",
        [name]
      );
      if (existing.length > 0) {
        company_id = existing[0].id;
      } else {
        const [ins] = await conn.execute(
          "INSERT INTO external_processing_companies (name) VALUES (?)",
          [name]
        );
        company_id = ins.insertId;
      }
    }
    const [productRows] = await conn.execute(
      `SELECT id, product_name, pricing_type, product_usage, quantity AS available_stock
       FROM products WHERE id = ? FOR UPDATE`,
      [product_id]
    );
    if (productRows.length === 0) {
      await conn.rollback();
      res.status(404).json({ message: "Product not found." });
      return;
    }
    const product = productRows[0];
    const [statusCheck] = await conn.execute(
      "SELECT status FROM products WHERE id = ?",
      [product_id]
    );
    if (statusCheck[0]?.status !== "Active") {
      await conn.rollback();
      res.status(422).json({ message: "Product is not active." });
      return;
    }
    if (product.pricing_type !== "MARKET_BASED") {
      await conn.rollback();
      res.status(422).json({ message: "Only market-based products are eligible for external processing delivery." });
      return;
    }
    if (product.product_usage === "RETAIL_PRODUCT") {
      await conn.rollback();
      res.status(422).json({ message: "This product is not configured as a raw material / commodity and is not eligible for external processing delivery." });
      return;
    }
    const [companyRows] = await conn.execute(
      "SELECT id, name FROM external_processing_companies WHERE id = ?",
      [company_id]
    );
    if (companyRows.length === 0) {
      await conn.rollback();
      res.status(422).json({ message: "Processing company not found." });
      return;
    }
    const company = companyRows[0];
    if (quantity <= 0) {
      await conn.rollback();
      res.status(422).json({ message: "Quantity must be greater than zero." });
      return;
    }
    const availableStock = Number(product.available_stock);
    if (quantity > availableStock) {
      await conn.rollback();
      res.status(422).json({
        message: `Insufficient stock. Available: ${availableStock} ${product.product_name}. Requested: ${quantity}.`,
        available_stock: availableStock,
        requested: quantity
      });
      return;
    }
    const year = delivery_date.slice(0, 4);
    const [seqRows] = await conn.execute(
      `SELECT id, current_number FROM invoice_sequences WHERE prefix = 'EPD' LIMIT 1 FOR UPDATE`
    );
    let deliveryRef;
    if (seqRows[0]) {
      const nextSeq = seqRows[0].current_number + 1;
      await conn.execute(
        `UPDATE invoice_sequences SET current_number = ?, updated_at = NOW() WHERE id = ?`,
        [nextSeq, seqRows[0].id]
      );
      deliveryRef = `EPD-${year}-${String(nextSeq).padStart(6, "0")}`;
    } else {
      deliveryRef = `EPD-${year}-${String(Date.now()).slice(-6)}`;
    }
    const newQuantity = Math.round((availableStock - quantity) * 1e3) / 1e3;
    await conn.execute(
      "UPDATE products SET quantity = ?, updated_at = NOW() WHERE id = ?",
      [newQuantity, product_id]
    );
    const [deliveryResult] = await conn.execute(
      `INSERT INTO external_processing_deliveries
         (delivery_reference, product_id, quantity, company_id, delivery_date, delivered_by, remarks, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        deliveryRef,
        product_id,
        quantity,
        company_id,
        delivery_date,
        delivered_by?.trim() || null,
        remarks?.trim() || null,
        req.user.id
      ]
    );
    const deliveryId = deliveryResult.insertId;
    await conn.execute(`
      INSERT INTO inventory_logs
        (product_id, transaction_type, action, quantity_change, quantity, remaining_stock, reference, user_id)
      VALUES (?, 'Adjustment', 'External Processing Delivery', ?, ?, ?, ?, ?)
    `, [
      product_id,
      -quantity,
      // quantity_change (negative = deduction)
      availableStock,
      // quantity (previous stock)
      newQuantity,
      // remaining_stock
      deliveryRef,
      // reference
      req.user.id
    ]);
    await conn.commit();
    await logAuditEvent({
      action: "EP_DELIVERY_RECORDED",
      performedById: req.user.id,
      performedByUsername: req.user.username,
      entityType: "external_processing_deliveries",
      entityId: deliveryId,
      newValues: {
        delivery_reference: deliveryRef,
        product_id,
        product_name: product.product_name,
        quantity,
        company: company.name,
        delivery_date,
        previous_stock: availableStock,
        new_stock: newQuantity
      }
    });
    res.status(201).json({
      message: "External processing delivery recorded successfully.",
      id: deliveryId,
      delivery_reference: deliveryRef,
      product_id,
      product_name: product.product_name,
      quantity,
      company: company.name,
      delivery_date,
      delivered_by: delivered_by?.trim() || null,
      remarks: remarks?.trim() || null,
      previous_stock: availableStock,
      remaining_stock: newQuantity
    });
  } catch (err) {
    await conn.rollback();
    console.error("[externalProcessing/POST /deliveries]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  } finally {
    conn.release();
  }
});
router16.get("/deliveries", async (req, res) => {
  if (!requireAdmin8(req, res)) return;
  const limit = Math.min(1e3, Math.max(1, parseInt(req.query.limit || "50", 10)));
  const offset = Math.max(0, parseInt(req.query.offset || "0", 10));
  const { product_id, company_id, date_from, date_to, search } = req.query;
  let where = "WHERE 1=1";
  const params = [];
  if (product_id) {
    where += " AND epd.product_id = ?";
    params.push(parseInt(product_id, 10));
  }
  if (company_id) {
    where += " AND epd.company_id = ?";
    params.push(parseInt(company_id, 10));
  }
  if (date_from) {
    where += " AND epd.delivery_date >= ?";
    params.push(date_from);
  }
  if (date_to) {
    where += " AND epd.delivery_date <= ?";
    params.push(date_to);
  }
  if (search) {
    where += " AND (epd.delivery_reference LIKE ? OR epc.name LIKE ? OR p.product_name LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  params.push(limit, offset);
  try {
    const [rows] = await pool.execute(`
      SELECT
        epd.id,
        epd.delivery_reference,
        epd.product_id,
        p.product_name,
        COALESCE(u.unit_name, '')      AS unit,
        COALESCE(u.abbreviation, '')   AS unit_abbreviation,
        epd.quantity,
        epd.company_id,
        epc.name                       AS company_name,
        epd.delivery_date,
        epd.delivered_by,
        epd.remarks,
        epd.created_at,
        COALESCE(usr.full_name, '\u2014')   AS recorded_by_name
      FROM external_processing_deliveries epd
      JOIN products p  ON p.id  = epd.product_id
      JOIN external_processing_companies epc ON epc.id = epd.company_id
      LEFT JOIN units u ON u.id = p.unit_id
      LEFT JOIN users usr ON usr.id = epd.recorded_by
      ${where}
      ORDER BY epd.delivery_date DESC, epd.created_at DESC
      LIMIT ? OFFSET ?
    `, params);
    res.status(200).json(rows.map((r) => ({
      ...r,
      quantity: Number(r.quantity)
    })));
  } catch (err) {
    console.error("[externalProcessing/GET /deliveries]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
router16.get("/deliveries/:id", async (req, res) => {
  if (!requireAdmin8(req, res)) return;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid delivery ID." });
    return;
  }
  try {
    const [rows] = await pool.execute(`
      SELECT
        epd.id,
        epd.delivery_reference,
        epd.product_id,
        p.product_name,
        COALESCE(u.unit_name, '')      AS unit,
        COALESCE(u.abbreviation, '')   AS unit_abbreviation,
        epd.quantity,
        epd.company_id,
        epc.name                       AS company_name,
        epc.address                    AS company_address,
        epd.delivery_date,
        epd.delivered_by,
        epd.remarks,
        epd.created_at,
        COALESCE(usr.full_name, '\u2014')   AS recorded_by_name
      FROM external_processing_deliveries epd
      JOIN products p  ON p.id  = epd.product_id
      JOIN external_processing_companies epc ON epc.id = epd.company_id
      LEFT JOIN units u ON u.id = p.unit_id
      LEFT JOIN users usr ON usr.id = epd.recorded_by
      WHERE epd.id = ?
    `, [id]);
    if (rows.length === 0) {
      res.status(404).json({ message: "Delivery record not found." });
      return;
    }
    res.status(200).json({
      ...rows[0],
      quantity: Number(rows[0].quantity)
    });
  } catch (err) {
    console.error("[externalProcessing/GET /deliveries/:id]", err);
    res.status(500).json({ message: "An unexpected error occurred." });
  }
});
var externalProcessing_default = router16;

// server/routes/suspendedSales.ts
init_db();
import { Router as Router17 } from "express";
import { z as z13 } from "zod";
var router17 = Router17();
var suspendedItemSchema = z13.object({
  product_id: z13.number().int().positive(),
  name: z13.string(),
  barcode: z13.string(),
  quantity: z13.number().positive(),
  unitPrice: z13.number().positive(),
  subtotal: z13.number().positive(),
  tax_type: z13.enum(["VATABLE", "VAT_EXEMPT", "ZERO_RATED", "NON_TAXABLE"]).optional(),
  tax_rate: z13.number().min(0).max(100).optional(),
  taxable_amount: z13.number().min(0).optional(),
  vat_amount: z13.number().min(0).optional()
});
var suspendSaleSchema = z13.object({
  customer_name: z13.string().min(0).default(""),
  customer_address: z13.string().optional(),
  customer_tin: z13.string().optional(),
  cart_items: z13.array(suspendedItemSchema).min(1),
  label: z13.string().optional()
});
router17.get(
  "/",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req, res) => {
    try {
      const [rows] = await pool.execute(
        `SELECT 
           id,
           suspended_order_id,
           cashier_id,
           customer_name,
           customer_address,
           customer_tin,
           cart_data,
           status,
           label,
           created_at,
           updated_at
         FROM suspended_sales
         WHERE cashier_id = ? AND status = 'SUSPENDED'
         ORDER BY updated_at DESC`,
        [req.user.id]
      );
      const suspended = rows.map((row) => ({
        id: row.id,
        suspended_order_id: row.suspended_order_id,
        customer_name: row.customer_name,
        customer_address: row.customer_address,
        customer_tin: row.customer_tin,
        cart_data: typeof row.cart_data === "string" ? JSON.parse(row.cart_data) : row.cart_data,
        status: row.status,
        label: row.label,
        created_at: row.created_at,
        updated_at: row.updated_at
      }));
      res.status(200).json(suspended);
    } catch (err) {
      console.error("[GET /api/suspended-sales] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);
router17.post(
  "/",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req, res) => {
    const parsed = suspendSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: "Invalid request",
        errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
      });
      return;
    }
    const { customer_name, customer_address, customer_tin, cart_items, label } = parsed.data;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [seqRows] = await conn.execute(
        `SELECT id, current_number FROM invoice_sequences WHERE prefix = 'SUSP' LIMIT 1 FOR UPDATE`
      );
      let suspendedOrderId;
      if (!seqRows[0]) {
        await conn.execute(
          `INSERT INTO invoice_sequences (prefix, current_number, updated_at) VALUES ('SUSP', 0, NOW())`
        );
        const [newSeq] = await conn.execute(
          `SELECT id, current_number FROM invoice_sequences WHERE prefix = 'SUSP' LIMIT 1`
        );
        const nextNum = newSeq[0].current_number + 1;
        await conn.execute(
          `UPDATE invoice_sequences SET current_number = ?, updated_at = NOW() WHERE id = ?`,
          [nextNum, newSeq[0].id]
        );
        suspendedOrderId = `SUSP-${String(nextNum).padStart(6, "0")}`;
      } else {
        const nextNum = seqRows[0].current_number + 1;
        await conn.execute(
          `UPDATE invoice_sequences SET current_number = ?, updated_at = NOW() WHERE id = ?`,
          [nextNum, seqRows[0].id]
        );
        suspendedOrderId = `SUSP-${String(nextNum).padStart(6, "0")}`;
      }
      await conn.execute(
        `INSERT INTO suspended_sales 
           (suspended_order_id, cashier_id, customer_name, customer_address, customer_tin, cart_data, label)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          suspendedOrderId,
          req.user.id,
          customer_name || "",
          customer_address || null,
          customer_tin || null,
          JSON.stringify(cart_items),
          label || null
        ]
      );
      await conn.commit();
      res.status(201).json({
        id: suspendedOrderId,
        message: "Sale suspended successfully."
      });
    } catch (err) {
      await conn.rollback();
      console.error("[POST /api/suspended-sales] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    } finally {
      conn.release();
    }
  }
);
router17.get(
  "/:id",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req, res) => {
    const { id } = req.params;
    try {
      const [rows] = await pool.execute(
        `SELECT 
           id,
           suspended_order_id,
           cashier_id,
           customer_name,
           customer_address,
           customer_tin,
           cart_data,
           status,
           label,
           created_at,
           updated_at
         FROM suspended_sales
         WHERE suspended_order_id = ? AND cashier_id = ? AND status = 'SUSPENDED'
         LIMIT 1`,
        [id, req.user.id]
      );
      if (rows.length === 0) {
        res.status(404).json({ message: "Suspended sale not found." });
        return;
      }
      const row = rows[0];
      res.status(200).json({
        id: row.id,
        suspended_order_id: row.suspended_order_id,
        customer_name: row.customer_name,
        customer_address: row.customer_address,
        customer_tin: row.customer_tin,
        cart_data: typeof row.cart_data === "string" ? JSON.parse(row.cart_data) : row.cart_data,
        status: row.status,
        label: row.label,
        created_at: row.created_at,
        updated_at: row.updated_at
      });
    } catch (err) {
      console.error("[GET /api/suspended-sales/:id] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    }
  }
);
router17.put(
  "/:id",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req, res) => {
    const { id } = req.params;
    const parsed = suspendSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: "Invalid request",
        errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
      });
      return;
    }
    const { customer_name, customer_address, customer_tin, cart_items, label } = parsed.data;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute(
        `SELECT id FROM suspended_sales
         WHERE suspended_order_id = ? AND cashier_id = ? AND status = 'SUSPENDED'
         FOR UPDATE`,
        [id, req.user.id]
      );
      if (rows.length === 0) {
        await conn.rollback();
        res.status(404).json({ message: "Suspended sale not found or already completed." });
        return;
      }
      const [result] = await conn.execute(
        `UPDATE suspended_sales 
         SET customer_name = ?, customer_address = ?, customer_tin = ?, cart_data = ?, label = ?, updated_at = NOW()
         WHERE suspended_order_id = ? AND cashier_id = ? AND status = 'SUSPENDED'`,
        [
          customer_name || "",
          customer_address || null,
          customer_tin || null,
          JSON.stringify(cart_items),
          label || null,
          id,
          req.user.id
        ]
      );
      if (result.affectedRows === 0) {
        await conn.rollback();
        res.status(404).json({ message: "Suspended sale not found or already completed." });
        return;
      }
      await conn.commit();
      res.status(200).json({ message: "Suspended sale updated." });
    } catch (err) {
      await conn.rollback();
      console.error("[PUT /api/suspended-sales/:id] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    } finally {
      conn.release();
    }
  }
);
router17.delete(
  "/:id",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req, res) => {
    const { id } = req.params;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute(
        `SELECT id FROM suspended_sales
         WHERE suspended_order_id = ? AND cashier_id = ? AND status = 'SUSPENDED'
         FOR UPDATE`,
        [id, req.user.id]
      );
      if (rows.length === 0) {
        await conn.rollback();
        res.status(404).json({ message: "Suspended sale not found or already completed." });
        return;
      }
      const [result] = await conn.execute(
        `UPDATE suspended_sales 
         SET status = 'CANCELLED', updated_at = NOW()
         WHERE suspended_order_id = ? AND cashier_id = ? AND status = 'SUSPENDED'`,
        [id, req.user.id]
      );
      if (result.affectedRows === 0) {
        await conn.rollback();
        res.status(404).json({ message: "Suspended sale not found or already completed." });
        return;
      }
      await conn.commit();
      res.status(200).json({ message: "Suspended sale discarded." });
    } catch (err) {
      await conn.rollback();
      console.error("[DELETE /api/suspended-sales/:id] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    } finally {
      conn.release();
    }
  }
);
router17.post(
  "/:id/complete",
  authenticate,
  requireRole("Cashier", "Admin"),
  async (req, res) => {
    const { id } = req.params;
    const cash_tendered = Number(req.body.cash_tendered ?? 0);
    const change_amount = req.body.change_amount !== void 0 ? Number(req.body.change_amount) : void 0;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute(
        `SELECT id, cart_data, customer_name, customer_address, customer_tin
         FROM suspended_sales
         WHERE suspended_order_id = ? AND cashier_id = ? AND status = 'SUSPENDED'
         FOR UPDATE`,
        [id, req.user.id]
      );
      if (rows.length === 0) {
        await conn.rollback();
        res.status(404).json({ message: "Suspended sale not found." });
        return;
      }
      const suspended = rows[0];
      const cartItems = typeof suspended.cart_data === "string" ? JSON.parse(suspended.cart_data) : suspended.cart_data;
      const [settingsRows] = await conn.execute(
        `SELECT tax_rate, vat_registered FROM store_settings WHERE id = 1 LIMIT 1`
      );
      const dbTaxRate = Number(settingsRows[0]?.tax_rate ?? 12);
      const dbVatActive = settingsRows[0]?.vat_registered === true || settingsRows[0]?.vat_registered === 1;
      const productData = {};
      for (const item of cartItems) {
        const pid = Number(item.product_id);
        if (!Number.isInteger(pid) || pid <= 0) {
          await conn.rollback();
          res.status(400).json({ message: `Invalid product ID in suspended cart.` });
          return;
        }
        const qty = Number(item.quantity);
        const [prodRows] = await conn.execute(
          `SELECT quantity, product_name AS name, tax_type, selling_price
           FROM products WHERE id = ? FOR UPDATE`,
          [pid]
        );
        const product = prodRows[0];
        if (!product) {
          await conn.rollback();
          res.status(404).json({ message: `Product ID ${pid} no longer exists.` });
          return;
        }
        if (Number(product.quantity) < qty) {
          await conn.rollback();
          res.status(409).json({
            message: `Insufficient stock for product: ${product.name}.`
          });
          return;
        }
        productData[pid] = {
          name: product.name,
          tax_type: product.tax_type ?? "VATABLE",
          selling_price: Number(product.selling_price),
          quantity: Number(product.quantity)
        };
      }
      const calcItems = cartItems.map((item) => {
        const p = productData[item.product_id];
        const unit_price = p.selling_price;
        const quantity = Number(item.quantity);
        const line_subtotal = Math.round(unit_price * quantity * 100) / 100;
        const taxType = p.tax_type;
        const isVatable = taxType === "VATABLE" && dbVatActive;
        const taxRate = isVatable ? dbTaxRate : 0;
        const taxDivisor = 1 + taxRate / 100;
        const taxableAmt = isVatable ? Math.round(line_subtotal / taxDivisor * 100) / 100 : line_subtotal;
        const vatAmt = isVatable ? Math.round((line_subtotal - taxableAmt) * 100) / 100 : 0;
        return {
          product_id: item.product_id,
          quantity,
          unit_price,
          line_subtotal,
          tax_type: taxType,
          tax_rate: taxRate,
          taxable_amount: taxableAmt,
          vat_amount: vatAmt
        };
      });
      const calc_total_amount = Math.round(
        calcItems.reduce((s, i) => s + i.line_subtotal, 0) * 100
      ) / 100;
      const calc_vat_amount = Math.round(
        calcItems.reduce((s, i) => s + i.vat_amount, 0) * 100
      ) / 100;
      const calc_subtotal = Math.round((calc_total_amount - calc_vat_amount) * 100) / 100;
      const calc_change = change_amount !== void 0 ? change_amount : Math.round((cash_tendered - calc_total_amount) * 100) / 100;
      const [invSeqRows] = await conn.execute(
        `SELECT id, prefix, current_number FROM invoice_sequences WHERE prefix = 'INV' LIMIT 1 FOR UPDATE`
      );
      if (!invSeqRows[0]) {
        await conn.rollback();
        res.status(500).json({ message: "Invoice sequence not found. Run migration 010." });
        return;
      }
      const nextInvNum = Number(invSeqRows[0].current_number) + 1;
      await conn.execute(
        `UPDATE invoice_sequences SET current_number = ?, updated_at = NOW() WHERE id = ?`,
        [nextInvNum, invSeqRows[0].id]
      );
      const invoice_number = `${invSeqRows[0].prefix}-${String(nextInvNum).padStart(6, "0")}`;
      const [saleHeaderResult] = await conn.execute(
        `INSERT INTO sales
           (invoice_number, customer_name, customer_address, customer_tin,
            cashier_id, subtotal, vat_amount, total_amount, cash_tendered, change_amount,
            payment_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          invoice_number,
          suspended.customer_name || "Walk-in Customer",
          suspended.customer_address || null,
          suspended.customer_tin || null,
          req.user.id,
          calc_subtotal,
          calc_vat_amount,
          calc_total_amount,
          cash_tendered,
          calc_change >= 0 ? calc_change : 0
        ]
      );
      const sale_id = saleHeaderResult.insertId;
      for (const ci of calcItems) {
        await conn.execute(
          `INSERT INTO sale_items
             (sale_id, product_id, quantity, unit_price, subtotal,
              tax_type, tax_rate, taxable_amount, vat_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sale_id,
            ci.product_id,
            ci.quantity,
            ci.unit_price,
            ci.line_subtotal,
            ci.tax_type,
            ci.tax_rate,
            ci.taxable_amount,
            ci.vat_amount
          ]
        );
        await conn.execute(
          `UPDATE products SET quantity = quantity - ? WHERE id = ?`,
          [ci.quantity, ci.product_id]
        );
        await conn.execute(
          `INSERT INTO inventory_logs (product_id, transaction_type, action, quantity_change, reference, user_id)
           VALUES (?, 'Sale', 'sale', ?, ?, ?)`,
          [ci.product_id, -ci.quantity, invoice_number, req.user.id]
        );
      }
      await conn.execute(
        `UPDATE suspended_sales SET status = 'COMPLETED', updated_at = NOW() WHERE id = ?`,
        [suspended.id]
      );
      await conn.commit();
      try {
        await pool.execute(
          `UPDATE sales SET payment_status = 'completed' WHERE id = ? AND payment_status = 'pending'`,
          [sale_id]
        );
      } catch (updateErr) {
        console.warn(`[SUSPENDED-COMPLETE] Failed to update payment_status for sale ${sale_id}:`, updateErr);
      }
      Promise.resolve().then(() => (init_auditLogger(), auditLogger_exports)).then(({ logAuditEvent: logAuditEvent2 }) => logAuditEvent2({
        action: "SALE_COMPLETED",
        performedById: req.user.id,
        performedByUsername: req.user.username,
        entityType: "sales",
        entityId: sale_id,
        newValues: { invoice_number, total_amount: calc_total_amount, customer_name: suspended.customer_name || "Walk-in Customer", source: "suspended_sale" }
      })).catch((e) => console.error("[auditLogger] import failed:", e));
      res.status(201).json({
        invoice_number,
        id: sale_id,
        subtotal: calc_subtotal,
        vat_amount: calc_vat_amount,
        total_amount: calc_total_amount,
        change_amount: calc_change >= 0 ? calc_change : 0,
        payment_status: "completed",
        receipt_printed: false,
        suspended_order_id: id,
        items: calcItems.map((ci) => ({
          product_id: ci.product_id,
          tax_type: ci.tax_type,
          taxable_amount: ci.taxable_amount,
          vat_amount: ci.vat_amount,
          line_subtotal: ci.line_subtotal
        }))
      });
    } catch (err) {
      await conn.rollback();
      console.error("[POST /api/suspended-sales/:id/complete] Error:", err);
      res.status(500).json({ message: "An unexpected error occurred." });
    } finally {
      conn.release();
    }
  }
);
var suspendedSales_default = router17;

// server/index.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "100kb" }));
  app.use("/api/auth", auth_default);
  app.use("/api/users", users_default);
  app.use("/api/audit-logs", auditLogs_default);
  app.use("/api/sales", sales_default);
  app.use("/api/returns", returns_default);
  app.use("/api/products", products_default);
  app.use("/api/categories", categories_default);
  app.use("/api/suppliers", suppliers_default);
  app.use("/api/units", units_default);
  app.use("/api/inventory", inventory_default);
  app.use("/api/reorder-alerts", reorderAlerts_default);
  app.use("/api/dashboard", dashboard_default);
  app.use("/api/reports", reports_default);
  app.use("/api/settings", settings_default);
  app.use("/api/commodity-prices", commodityPrices_default);
  app.use("/api/external-processing", externalProcessing_default);
  app.use("/api/suspended-sales", suspendedSales_default);
  const staticPath = fs.existsSync(path.resolve(__dirname, "../dist/public")) ? path.resolve(__dirname, "../dist/public") : path.resolve(__dirname, "public");
  if (fs.existsSync(staticPath)) {
    app.use(express.static(staticPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
  }
  const port = process.env.PORT || 3001;
  initWebSocket(server);
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
