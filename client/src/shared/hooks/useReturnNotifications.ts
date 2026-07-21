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

export function useReturnNotifications() {
  const [notifications, setNotifications] = useState<ReturnNotification[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const clearAll = useCallback(() => setNotifications([]), []);

  useEffect(() => {
    const token = loadToken();
    if (!token) return;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}://${host}/ws?token=${token}`);
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
      } catch {
        // ignore malformed messages
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  return { notifications, unreadCount: notifications.length, clearAll };
}
