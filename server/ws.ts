import { IncomingMessage, Server } from "http";
import jwt from "jsonwebtoken";
import { WebSocket, WebSocketServer } from "ws";
import type { AuthPayload } from "./middleware/authenticate.js";

export interface ReturnRequestNotification {
  type: "return_request";
  id: number;
  return_number: string;
  cashier_name: string;
  customer_name: string;
  invoice_number: string;
  created_at: string;
}

export interface ReturnDecisionNotification {
  type: "return_decision";
  id: number;
  return_number: string;
  invoice_number: string;
  customer_name: string;
  decision: "approved" | "rejected";
  admin_name: string;
  cashier_user_id: number;
}

export interface VoidRequestNotification {
  type: "void_request";
  void_id: number;
  sale_id: number;
  invoice_number: string;
  cashier_name: string;
  cashier_user_id: number;
  customer_name: string;
  total_amount: number;
  reason: string;
  created_at: string;
}

export interface VoidDecisionNotification {
  type: "void_decision";
  void_id: number;
  sale_id: number;
  invoice_number: string;
  total_amount: number;
  decision: "approved" | "rejected";
  admin_name: string;
  rejection_reason: string | null;
  cashier_user_id: number;
}

export interface DiscountRequestNotification {
  type: "discount_request";
  request_id: number;
  discount_id: number;
  discount_name: string;
  requested_percentage: number;
  discount_amount: number;
  reason: string;
  cashier_name: string;
  cashier_user_id: number;
  created_at: string;
}

export interface DiscountDecisionNotification {
  type: "discount_decision";
  request_id: number;
  discount_id: number;
  discount_name: string;
  requested_percentage: number;
  discount_amount: number;
  decision: "approved" | "rejected";
  admin_name: string;
  rejection_reason: string | null;
  cashier_user_id: number;
}

export interface DiscountCancellationNotification {
  type: "discount_cancelled";
  request_id: number;
  discount_id: number;
  discount_name: string;
  cashier_name: string;
  cashier_user_id: number;
  cancelled_at: string;
}

export interface CreditLimitOverrideRequestNotification {
  type: "credit_limit_override_request";
  override_id: number;
  customer_id: number;
  customer_name: string;
  requested_amount: number;
  current_limit: number;
  current_balance: number;
  cashier_name: string;
  cashier_user_id: number;
  reason: string | null;
  created_at: string;
}

export interface CreditLimitOverrideDecisionNotification {
  type: "credit_limit_override_decision";
  override_id: number;
  customer_id: number;
  customer_name: string;
  decision: "approved" | "rejected";
  admin_name: string;
  rejection_reason: string | null;
  cashier_user_id: number;
}

export type EntityType =
  | "sales"
  | "customers"
  | "credit_ledger"
  | "inventory"
  | "products"
  | "categories"
  | "discounts"
  | "requests"
  | "dashboard"
  | "commodity"
  | "returns"
  | "settings"
  | "cash_reconciliation";

export interface EntityUpdateNotification {
  type: "entity_updated";
  entity: EntityType;
  action?: "created" | "updated" | "deleted" | "voided" | "paid" | "adjusted" | "approved" | "rejected";
  id?: number;
  customerId?: number;
  timestamp: string;
}

export interface RequestDecisionNotification {
  type: "request_decision";
  request_type: "stock_count_standard" | "stock_count_market" | "commodity_purchase" | "market_adjustment" | "void" | "return";
  id: number;
  reference?: string;
  decision: "approved" | "rejected";
  admin_name: string;
  rejection_reason?: string | null;
  clerk_user_id?: number;
}

// Keep the old name as an alias so existing callers don't break
export type ReturnNotification = ReturnRequestNotification;

import { pool } from "./db.js";

// ─── Heartbeat constants ──────────────────────────────────────────────────────
// Every 5 s we ping each connected socket. If no pong arrives within 3 s we
// terminate the connection. This prevents zombie sockets from accumulating in
// adminClients / cashierClients over a long business day.
const HEARTBEAT_INTERVAL_MS = 5_000;  // how often we ping (5 s)
const PONG_TIMEOUT_MS        = 3_000;  // how long we wait for pong before terminating (3 s)

// Track all connected authenticated sockets for system-wide sync
const allClients = new Set<WebSocket>();
// Track connected Admin sockets
const adminClients = new Set<WebSocket>();
// Track cashier sockets keyed by userId so we can route decisions back
const cashierClients = new Map<number, Set<WebSocket>>();
// Track clerk sockets
const clerkClients = new Set<WebSocket>();
// Track all active sockets keyed by userId (for all roles: Admin, Cashier, Inventory Clerk)
const userSockets = new Map<number, Set<WebSocket>>();

/**
 * Check if a user currently has an active open WebSocket connection.
 */
export function isUserSocketConnected(userId: number): boolean {
  const sockets = userSockets.get(userId);
  if (!sockets || sockets.size === 0) return false;
  for (const ws of Array.from(sockets)) {
    if (ws.readyState === WebSocket.OPEN) {
      return true;
    }
  }
  return false;
}

/**
 * Terminate all active WebSocket connections for a user and notify their client.
 */
export function terminateUserSockets(userId: number, reason = "Session ended."): void {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  const payload = JSON.stringify({ type: "force_logout", message: reason });
  for (const ws of Array.from(sockets)) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(payload); } catch { /* silent */ }
      try { ws.close(4001, reason); } catch { /* silent */ }
    }
  }
  userSockets.delete(userId);
}

// ─── Per-socket heartbeat setup ───────────────────────────────────────────────
// Attach a ping/pong heartbeat to a freshly opened WebSocket. Returns a
// cleanup function that clears both timers — call it from the "close" handler.
function attachHeartbeat(ws: WebSocket, userId?: number): () => void {
  let pongTimer: ReturnType<typeof setTimeout> | null = null;
  let lastDbUpdate = Date.now();

  // Instant response to client-initiated heartbeat pulses
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg && msg.type === "heartbeat") {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "heartbeat_ack", timestamp: Date.now() }));
        }
      }
    } catch {
      /* ignore non-json messages */
    }
  });

  // Kick off a recurring ping every HEARTBEAT_INTERVAL_MS.
  const heartbeatInterval = setInterval(() => {
    // If the socket is no longer open, clear everything and bail.
    if (ws.readyState !== WebSocket.OPEN) {
      cleanup();
      return;
    }

    ws.ping();

    // If the client doesn't respond with a pong within PONG_TIMEOUT_MS,
    // terminate the connection so it is removed from the client Sets.
    pongTimer = setTimeout(() => {
      ws.terminate(); // triggers "close" event → removes from client tracking
    }, PONG_TIMEOUT_MS);
  }, HEARTBEAT_INTERVAL_MS);

  // Reset the pong timer whenever the client responds.
  ws.on("pong", () => {
    if (pongTimer) {
      clearTimeout(pongTimer);
      pongTimer = null;
    }
    // Update last_activity_at in DB throttled to at most once per 60s
    if (userId && Date.now() - lastDbUpdate > 60_000) {
      lastDbUpdate = Date.now();
      pool.execute("UPDATE users SET last_activity_at = NOW() WHERE id = ?", [userId]).catch(() => {});
    }
  });

  function cleanup() {
    clearInterval(heartbeatInterval);
    if (pongTimer) {
      clearTimeout(pongTimer);
      pongTimer = null;
    }
  }

  return cleanup;
}

export function initWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const token = url.searchParams.get("token");
    const secret = process.env.JWT_SECRET;

    if (!token || !secret) { ws.close(1008, "Unauthorized"); return; }

    let payload: AuthPayload;
    try {
      payload = jwt.verify(token, secret) as AuthPayload;
    } catch {
      ws.close(1008, "Unauthorized");
      return;
    }

    const userId = payload.id;

    // ── Start heartbeat immediately on connection ────────────────────────────
    const stopHeartbeat = attachHeartbeat(ws, userId);
    allClients.add(ws);

    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId)!.add(ws);

    // Update DB status on successful connection
    pool.execute("UPDATE users SET is_logged_in = 1, last_activity_at = NOW() WHERE id = ?", [userId]).catch(() => {});

    const handleClose = () => {
      stopHeartbeat();
      allClients.delete(ws);

      const uSockets = userSockets.get(userId);
      if (uSockets) {
        uSockets.delete(ws);
        if (uSockets.size === 0) {
          userSockets.delete(userId);
          pool.execute("UPDATE users SET last_activity_at = NOW() WHERE id = ?", [userId]).catch(() => {});
        }
      }
    };

    if (payload.role === "Admin") {
      adminClients.add(ws);
      ws.on("close", () => {
        handleClose();
        adminClients.delete(ws);
      });
    } else if (payload.role === "Cashier") {
      const uid = payload.id;
      if (!cashierClients.has(uid)) cashierClients.set(uid, new Set());
      cashierClients.get(uid)!.add(ws);
      ws.on("close", () => {
        handleClose();
        cashierClients.get(uid)?.delete(ws);
        if (cashierClients.get(uid)?.size === 0) cashierClients.delete(uid);
      });
    } else if (payload.role === "Inventory Clerk") {
      clerkClients.add(ws);
      ws.on("close", () => {
        handleClose();
        clerkClients.delete(ws);
      });
    } else {
      handleClose();
      ws.close(1008, "Forbidden");
    }
  });
}

export function broadcastEntityUpdate(
  notification: Omit<EntityUpdateNotification, "type" | "timestamp">
): void {
  const message = JSON.stringify({
    type: "entity_updated",
    ...notification,
    timestamp: new Date().toISOString(),
  });
  for (const client of Array.from(allClients)) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch {
        /* silent */
      }
    }
  }
}

export function broadcastRequestDecision(notification: RequestDecisionNotification): void {
  const message = JSON.stringify(notification);
  for (const client of Array.from(allClients)) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch {
        /* silent */
      }
    }
  }
}

export function broadcastVoidRequest(notification: VoidRequestNotification): void {
  const message = JSON.stringify(notification);
  for (const client of Array.from(adminClients)) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

export function broadcastReturnRequest(notification: ReturnRequestNotification): void {
  const message = JSON.stringify(notification);
  for (const client of Array.from(adminClients)) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

export function sendReturnDecision(notification: ReturnDecisionNotification): void {
  const sockets = cashierClients.get(notification.cashier_user_id);
  if (!sockets) return;
  const message = JSON.stringify(notification);
  for (const client of Array.from(sockets)) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

export function sendVoidDecision(notification: VoidDecisionNotification): void {
  const sockets = cashierClients.get(notification.cashier_user_id);
  if (!sockets) return;
  const message = JSON.stringify(notification);
  for (const client of Array.from(sockets)) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

export function broadcastDiscountRequest(notification: DiscountRequestNotification): void {
  const message = JSON.stringify(notification);
  for (const client of Array.from(adminClients)) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

export function broadcastDiscountCancellation(notification: DiscountCancellationNotification): void {
  const message = JSON.stringify(notification);
  for (const client of Array.from(adminClients)) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

export function sendDiscountDecision(notification: DiscountDecisionNotification): void {
  const message = JSON.stringify(notification);
  // Send decision to the requesting cashier client(s)
  const sockets = cashierClients.get(notification.cashier_user_id);
  if (sockets) {
    for (const client of Array.from(sockets)) {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    }
  }
  // Also broadcast to all admin clients so other admin terminals update in real time
  for (const client of Array.from(adminClients)) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

// ─── Credit Limit Override notifications ──────────────────────────────────────

export function broadcastCreditLimitOverrideRequest(
  notification: CreditLimitOverrideRequestNotification
): void {
  const message = JSON.stringify(notification);
  for (const client of Array.from(adminClients)) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

export function sendCreditLimitOverrideDecision(
  notification: CreditLimitOverrideDecisionNotification
): void {
  const message = JSON.stringify(notification);
  const sockets = cashierClients.get(notification.cashier_user_id);
  if (sockets) {
    for (const client of Array.from(sockets)) {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    }
  }
  // Also notify all admin clients (so the pending list auto-refreshes)
  for (const client of Array.from(adminClients)) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

// ─── Server Maintenance notifications ─────────────────────────────────────────

export interface ServerMaintenanceNotification {
  type: "server_maintenance";
  status: "started" | "ended";
  message?: string;
  timestamp?: string;
}

export function broadcastServerMaintenance(
  notification: Omit<ServerMaintenanceNotification, "type">
): void {
  const message = JSON.stringify({
    type: "server_maintenance",
    ...notification,
    timestamp: notification.timestamp || new Date().toISOString(),
  });
  for (const client of Array.from(allClients)) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch {
        /* silent */
      }
    }
  }
}
