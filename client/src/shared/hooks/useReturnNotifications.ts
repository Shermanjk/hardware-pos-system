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

// ─── Shared reconnecting WebSocket factory ────────────────────────────────────
//
// Creates a WebSocket that automatically reconnects after disconnection using
// exponential back-off (1s, 2s, 4s … capped at 30s).  The returned cleanup
// function must be called on component unmount to stop all reconnect attempts.
//
// This is the production-readiness fix for FAIL: WebSocket no reconnection.
// Without this, a 2-second network blip during a business day would silently
// kill all real-time notifications for the rest of the shift.

interface ReconnectingWSOptions {
  onMessage: (event: MessageEvent) => void;
  /** Called when a brand-new connection is opened (not on every reconnect). */
  onOpen?: () => void;
}

function createReconnectingWS(options: ReconnectingWSOptions): () => void {
  let ws: WebSocket | null = null;
  let retryDelay = 1000;           // start at 1 s
  const MAX_DELAY = 30_000;        // cap at 30 s
  let destroyed = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (destroyed) return;

    const token = loadToken();
    if (!token) return; // not authenticated — don't reconnect

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${protocol}://${window.location.host}/ws?token=${token}`);

    ws.onopen = () => {
      retryDelay = 1000; // reset back-off on successful connection
      options.onOpen?.();
    };

    ws.onmessage = options.onMessage;

    ws.onclose = (event) => {
      if (destroyed) return;
      // 1008 = Policy Violation (unauthorized / forbidden) — do NOT retry
      if (event.code === 1008) return;

      // Schedule reconnect with exponential back-off
      retryTimer = setTimeout(() => {
        retryDelay = Math.min(retryDelay * 2, MAX_DELAY);
        connect();
      }, retryDelay);
    };

    ws.onerror = () => {
      // onerror is always followed by onclose — reconnect logic lives there
    };
  }

  connect();

  // Reconnect when the tab regains focus or the browser comes back online.
  // This handles the case where the device slept, the network dropped, or the
  // user switched away from the tab for an extended period.
  function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        if (retryTimer) clearTimeout(retryTimer);
        retryDelay = 1000;
        connect();
      }
    }
  }

  function handleOnline() {
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      if (retryTimer) clearTimeout(retryTimer);
      retryDelay = 1000;
      connect();
    }
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("online", handleOnline);

  // Cleanup — called on component unmount
  return () => {
    destroyed = true;
    if (retryTimer) clearTimeout(retryTimer);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("online", handleOnline);
    ws?.close(1000, "Component unmounted");
  };
}

// ─── Admin hook: receives new void requests from cashiers ──────────────────────

export function useVoidRequestNotifications() {
  const [notifications, setNotifications] = useState<VoidRequestNotification[]>([]);

  const clearAll = useCallback(() => setNotifications([]), []);

  useEffect(() => {
    const cleanup = createReconnectingWS({
      onMessage: (event) => {
        try {
          const data: VoidRequestNotification = JSON.parse(event.data);
          if (data.type !== "void_request") return;
          setNotifications((prev) => [data, ...prev]);
          toast.error(`Void Request — ${data.invoice_number}`, {
            description: `${data.cashier_name} · ${data.customer_name} · ₱${Number(data.total_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
            duration: 8000,
          });
        } catch { /* ignore malformed */ }
      },
    });
    return cleanup;
  }, []);

  return { notifications, unreadCount: notifications.length, clearAll };
}

// ─── Admin hook: receives new return requests ─────────────────────────────────

export function useReturnNotifications() {
  const [notifications, setNotifications] = useState<ReturnNotification[]>([]);

  const clearAll = useCallback(() => setNotifications([]), []);

  useEffect(() => {
    const cleanup = createReconnectingWS({
      onMessage: (event) => {
        try {
          const data: ReturnNotification = JSON.parse(event.data);
          if (data.type !== "return_request") return;
          setNotifications((prev) => [data, ...prev]);
          toast.warning(`Return Request — ${data.return_number}`, {
            description: `${data.cashier_name} · Invoice ${data.invoice_number}`,
            duration: 6000,
          });
        } catch { /* ignore malformed */ }
      },
    });
    return cleanup;
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
    const cleanup = createReconnectingWS({
      onMessage: (event) => {
        try {
          const data: ReturnDecisionNotification = JSON.parse(event.data);
          if (data.type !== "return_decision") return;
          onDecisionRef.current(data);
        } catch { /* ignore malformed */ }
      },
    });
    return cleanup;
  }, []); // stable — onDecision changes are handled via ref
}

// ─── Cashier hook: receives void approve/reject decisions ─────────────────────

export function useVoidDecisions(
  onDecision: (n: VoidDecisionNotification) => void
) {
  const onDecisionRef = useRef(onDecision);
  onDecisionRef.current = onDecision;

  useEffect(() => {
    const cleanup = createReconnectingWS({
      onMessage: (event) => {
        try {
          const data: VoidDecisionNotification = JSON.parse(event.data);
          if (data.type !== "void_decision") return;
          onDecisionRef.current(data);
        } catch { /* ignore malformed */ }
      },
    });
    return cleanup;
  }, []);
}

// ─── Admin hook: receives discount request & cancellation notifications ────────

export function useDiscountNotifications() {
  useEffect(() => {
    const cleanup = createReconnectingWS({
      onMessage: (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "discount_request") {
            toast.warning(`Discount Request`, {
              id: `discount-req-${data.request_id}`,
              description: `${data.cashier_name} · ${data.discount_name} (${data.requested_percentage}%) · ₱${Number(data.discount_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
              duration: 6000,
            });
            window.dispatchEvent(new CustomEvent("refresh-pending-counts"));
          } else if (data.type === "discount_cancelled") {
            toast.info(`Discount Request Cancelled`, {
              id: `discount-cancel-${data.request_id}`,
              description: `${data.cashier_name} cancelled request #${data.request_id} for ${data.discount_name}`,
              duration: 5000,
            });
            window.dispatchEvent(new CustomEvent("refresh-pending-counts"));
          } else if (data.type === "discount_decision") {
            window.dispatchEvent(new CustomEvent("refresh-pending-counts"));
          }
        } catch { /* ignore malformed */ }
      },
    });
    return cleanup;
  }, []);
}
