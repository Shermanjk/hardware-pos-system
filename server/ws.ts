import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import jwt from "jsonwebtoken";
import type { AuthPayload } from "./middleware/authenticate.js";

export interface ReturnNotification {
  type: "return_request";
  id: number;
  return_number: string;
  cashier_name: string;
  customer_name: string;
  invoice_number: string;
  created_at: string;
}

// Track connected Admin sockets
const adminClients = new Set<WebSocket>();

export function initWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // Authenticate via ?token= query param
    const url = new URL(req.url ?? "", "http://localhost");
    const token = url.searchParams.get("token");
    const secret = process.env.JWT_SECRET;

    if (!token || !secret) {
      ws.close(1008, "Unauthorized");
      return;
    }

    let payload: AuthPayload;
    try {
      payload = jwt.verify(token, secret) as AuthPayload;
    } catch {
      ws.close(1008, "Unauthorized");
      return;
    }

    if (payload.role !== "Admin") {
      ws.close(1008, "Forbidden");
      return;
    }

    adminClients.add(ws);
    ws.on("close", () => adminClients.delete(ws));
  });
}

export function broadcastReturnRequest(notification: ReturnNotification): void {
  const message = JSON.stringify(notification);
  for (const client of Array.from(adminClients)) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}
