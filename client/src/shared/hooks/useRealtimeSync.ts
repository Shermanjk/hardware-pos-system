import { useEffect, useRef } from "react";
import { loadToken } from "@/shared/utils/auth";

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

export interface EntityUpdateEvent {
  type: "entity_updated";
  entity: EntityType;
  action?: "created" | "updated" | "deleted" | "voided" | "paid" | "adjusted" | "approved" | "rejected";
  id?: number;
  customerId?: number;
  timestamp: string;
}

type SyncCallback = (event: EntityUpdateEvent) => void;

// ─── Singleton Real-time Event Hub ────────────────────────────────────────────
class RealtimeSyncHub {
  private ws: WebSocket | null = null;
  private retryDelay = 1000;
  private readonly maxDelay = 30_000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Map<EntityType, Set<SyncCallback>>();
  private wildcardListeners = new Set<SyncCallback>();
  private isConnecting = false;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          this.ensureConnected();
          // Trigger wildcard refresh on tab focus
          this.notifyListeners({
            type: "entity_updated",
            entity: "dashboard",
            timestamp: new Date().toISOString(),
          });
        }
      });
      window.addEventListener("online", () => {
        this.ensureConnected();
      });
    }
  }

  public subscribe(entities: EntityType | EntityType[], callback: SyncCallback): () => void {
    const list = Array.isArray(entities) ? entities : [entities];
    for (const entity of list) {
      if (!this.listeners.has(entity)) {
        this.listeners.set(entity, new Set());
      }
      this.listeners.get(entity)!.add(callback);
    }

    this.ensureConnected();

    return () => {
      for (const entity of list) {
        this.listeners.get(entity)?.delete(callback);
        if (this.listeners.get(entity)?.size === 0) {
          this.listeners.delete(entity);
        }
      }
    };
  }

  public subscribeAll(callback: SyncCallback): () => void {
    this.wildcardListeners.add(callback);
    this.ensureConnected();
    return () => {
      this.wildcardListeners.delete(callback);
    };
  }

  private ensureConnected() {
    if (typeof window === "undefined") return;
    const token = loadToken();
    if (!token) return;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const wsUrl = `${protocol}://${window.location.host}/ws?token=${token}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.retryDelay = 1000;
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.type === "entity_updated") {
            this.notifyListeners(data as EntityUpdateEvent);
          }
        } catch {
          /* ignore non-json messages */
        }
      };

      this.ws.onclose = (event: CloseEvent) => {
        this.isConnecting = false;
        this.ws = null;
        if (event.code === 1008) return; // unauthorized — do not reconnect

        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => {
          this.retryDelay = Math.min(this.retryDelay * 2, this.maxDelay);
          this.ensureConnected();
        }, this.retryDelay);
      };

      this.ws.onerror = () => {
        this.isConnecting = false;
      };
    } catch {
      this.isConnecting = false;
    }
  }

  private notifyListeners(event: EntityUpdateEvent) {
    const specific = this.listeners.get(event.entity);
    if (specific) {
      for (const cb of Array.from(specific)) {
        try {
          cb(event);
        } catch (err) {
          console.error(`[RealtimeSync] Listener error for ${event.entity}:`, err);
        }
      }
    }
    for (const cb of Array.from(this.wildcardListeners)) {
      try {
        cb(event);
      } catch (err) {
        console.error("[RealtimeSync] Wildcard listener error:", err);
      }
    }
  }
}

export const realtimeHub = new RealtimeSyncHub();

/**
 * React hook that automatically triggers a callback whenever the specified entity
 * or entities are updated anywhere in the system across all open tabs and terminals.
 *
 * @param entities Entity name or array of entity names to watch
 * @param onUpdate Callback to trigger on update (debounced automatically)
 * @param debounceMs Delay in milliseconds to debounce rapid updates (default: 300ms)
 */
export function useRealtimeSync(
  entities: EntityType | EntityType[],
  onUpdate: (event: EntityUpdateEvent) => void,
  debounceMs = 300
): void {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (event: EntityUpdateEvent) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        onUpdateRef.current(event);
      }, debounceMs);
    };

    const unsubscribe = realtimeHub.subscribe(entities, handler);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      unsubscribe();
    };
  }, [Array.isArray(entities) ? entities.join(",") : entities, debounceMs]);
}
