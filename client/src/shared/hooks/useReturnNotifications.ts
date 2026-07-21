import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { loadToken } from "@/shared/utils/auth";

export interface ReturnNotification {
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

// ─── Admin hook: receives new return requests ─────────────────────────────────

export function useReturnNotifications() {
  const [notifications, setNotifications] = useState<ReturnNotification[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const clearAll = useCallback(() => setNotifications([]), []);

  useEffect(() => {
    const token = loadToken();
    if (!token) return;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data: ReturnNotification = JSON.parse(event.data);
        if (data.type !== "return_request") return;
        setNotifications((prev) => [data, ...prev]);
        toast.warning(`Return Request — ${data.return_number}`, {
          description: `${data.cashier_name} · Invoice ${data.invoice_number}`,
          duration: 6000,
        });
      } catch { /* ignore malformed */ }
    };

    return () => { ws.close(); wsRef.current = null; };
  }, []);

  return { notifications, unreadCount: notifications.length, clearAll };
}

// ─── Cashier hook: receives approve/reject decisions ─────────────────────────

export function useReturnDecisions(
  onDecision: (n: ReturnDecisionNotification) => void
) {
  const onDecisionRef = useRef(onDecision);
  onDecisionRef.current = onDecision;

  useEffect(() => {
    const token = loadToken();
    if (!token) return;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws?token=${token}`);

    ws.onmessage = (event) => {
      try {
        const data: ReturnDecisionNotification = JSON.parse(event.data);
        if (data.type !== "return_decision") return;
        onDecisionRef.current(data);
      } catch { /* ignore malformed */ }
    };

    return () => ws.close();
  }, []); // stable — onDecision changes are handled via ref
}
