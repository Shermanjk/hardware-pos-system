import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import jwt from "jsonwebtoken";
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

// Keep the old name as an alias so existing callers don't break
export type ReturnNotification = ReturnRequestNotification;

// ─── Heartbeat constants ──────────────────────────────────────────────────────
// Every 30 s we ping each connected socket. If no pong arrives within 10 s we
// terminate the connection. This prevents zombie sockets from accumulating in
// adminClients / cashierClients over a long business day.
const HEARTBEAT_INTERVAL_MS = 30_000; // how often we ping
const PONG_TIMEOUT_MS        = 10_000; // how long we wait for pong before terminating

// Track connected Admin sockets
const adminClients = new Set<WebSocket>();
// Track cashier sockets keyed by userId so we can route decisions back
const cashierClients = new Map<number, Set<WebSocket>>();

// ─── Per-socket heartbeat setup ───────────────────────────────────────────────
// Attach a ping/pong heartbeat to a freshly opened WebSocket. Returns a
// cleanup function that clears both timers — call it from the "close" handler.
function attachHeartbeat(ws: WebSocket): () => void {
  let pongTimer: ReturnType<typeof setTimeout> | null = null;

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
      ws.terminate(); // triggers "close" event → removes from adminClients/cashierClients
    }, PONG_TIMEOUT_MS);
  }, HEARTBEAT_INTERVAL_MS);

  // Reset the pong timer whenever the client responds.
  ws.on("pong", () => {
    if (pongTimer) {
      clearTimeout(pongTimer);
      pongTimer = null;
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

    // ── Start heartbeat immediately on connection ────────────────────────────
    const stopHeartbeat = attachHeartbeat(ws);

    if (payload.role === "Admin") {
      adminClients.add(ws);
      ws.on("close", () => {
        stopHeartbeat();
        adminClients.delete(ws);
      });
    } else if (payload.role === "Cashier") {
      const uid = payload.id;
      if (!cashierClients.has(uid)) cashierClients.set(uid, new Set());
      cashierClients.get(uid)!.add(ws);
      ws.on("close", () => {
        stopHeartbeat();
        cashierClients.get(uid)?.delete(ws);
        if (cashierClients.get(uid)?.size === 0) cashierClients.delete(uid);
      });
    } else {
      stopHeartbeat();
      ws.close(1008, "Forbidden");
    }
  });
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

export function sendDiscountDecision(notification: DiscountDecisionNotification): void {
  const sockets = cashierClients.get(notification.cashier_user_id);
  if (!sockets) return;
  const message = JSON.stringify(notification);
  for (const client of Array.from(sockets)) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}
