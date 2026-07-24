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

// Keep the old name as an alias so existing callers don't break
export type ReturnNotification = ReturnRequestNotification;

// Track connected Admin sockets
const adminClients = new Set<WebSocket>();
// Track cashier sockets keyed by userId so we can route decisions back
const cashierClients = new Map<number, Set<WebSocket>>();

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

    if (payload.role === "Admin") {
      adminClients.add(ws);
      ws.on("close", () => adminClients.delete(ws));
    } else if (payload.role === "Cashier") {
      const uid = payload.id;
      if (!cashierClients.has(uid)) cashierClients.set(uid, new Set());
      cashierClients.get(uid)!.add(ws);
      ws.on("close", () => {
        cashierClients.get(uid)?.delete(ws);
        if (cashierClients.get(uid)?.size === 0) cashierClients.delete(uid);
      });
    } else {
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
