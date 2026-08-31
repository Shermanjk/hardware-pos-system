import { useEffect, useRef, useState } from "react";
import { loadToken, clearToken } from "@/shared/utils/auth";
import { toast } from "sonner";
import axios from "axios";

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

export type ConnectionStatus = "connected" | "connecting" | "disconnected";

export interface ServerStatusState {
  status: ConnectionStatus;
  isOffline: boolean;
  isMaintenance: boolean;
  maintenanceMessage: string;
  lastConnectedAt: Date | null;
  retryCount: number;
}

type SyncCallback = (event: EntityUpdateEvent) => void;
type StatusCallback = (state: ServerStatusState) => void;

// ─── Singleton Real-time Event Hub ────────────────────────────────────────────
class RealtimeSyncHub {
  private ws: WebSocket | null = null;
  private retryDelay = 1000;
  private readonly maxDelay = 10_000; // Cap at 10 s for fast POS reconnects
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private healthProbeTimer: ReturnType<typeof setInterval> | null = null;
  private clientHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatMissedTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly HEARTBEAT_PULSE_MS = 1500;   // 1.5s client heartbeat pulse
  private readonly HEARTBEAT_TIMEOUT_MS = 1500; // 1.5s ack deadline -> split-second offline detection
  private listeners = new Map<EntityType, Set<SyncCallback>>();
  private wildcardListeners = new Set<SyncCallback>();
  private statusListeners = new Set<StatusCallback>();
  private isConnecting = false;

  private state: ServerStatusState = {
    status: "connecting",
    isOffline: false,
    isMaintenance: false,
    maintenanceMessage: "",
    lastConnectedAt: null,
    retryCount: 0,
  };

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          this.reconnectNow();
          // Trigger refresh on tab focus
          this.notifyListeners({
            type: "entity_updated",
            entity: "dashboard",
            timestamp: new Date().toISOString(),
          });
        }
      });

      window.addEventListener("online", () => {
        this.reconnectNow();
      });

      window.addEventListener("offline", () => {
        this.updateState({ status: "disconnected", isOffline: true });
        this.startFastHealthProbe();
      });
    }
  }

  public getStatus(): ServerStatusState {
    return { ...this.state };
  }

  public setOffline(offline: boolean) {
    if (offline) {
      this.updateState({ status: "disconnected", isOffline: true });
      this.startFastHealthProbe();
    } else {
      this.updateState({ isOffline: false });
    }
  }

  public subscribeStatus(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    callback(this.getStatus());
    this.ensureConnected();
    return () => {
      this.statusListeners.delete(callback);
    };
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

  public reconnectNow() {
    this.stopClientHeartbeat();
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryDelay = 1000;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.isConnecting = false;
    this.ensureConnected();
  }

  public disconnect() {
    this.stopClientHeartbeat();
    this.stopFastHealthProbe();
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.isConnecting = false;
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.close(1000, "Normal Closure");
      } catch {}
      this.ws = null;
    }
    this.updateState({ status: "disconnected", isOffline: false });
  }

  private updateState(partial: Partial<ServerStatusState>) {
    this.state = { ...this.state, ...partial };
    for (const listener of Array.from(this.statusListeners)) {
      try {
        listener(this.getStatus());
      } catch (err) {
        console.error("[RealtimeSync] Status listener error:", err);
      }
    }
  }

  private startFastHealthProbe() {
    if (this.healthProbeTimer) return;
    // Rapid probing every 1.0s while disconnected to auto-reconnect instantly when LAN cable is reconnected
    this.healthProbeTimer = setInterval(async () => {
      if (this.state.status === "connected") {
        this.stopFastHealthProbe();
        return;
      }
      try {
        const res = await axios.get("/api/health", { timeout: 1200 });
        if (res.status === 200) {
          this.stopFastHealthProbe();
          this.reconnectNow();
        }
      } catch {
        // Still down
      }
    }, 1000);
  }

  private stopFastHealthProbe() {
    if (this.healthProbeTimer) {
      clearInterval(this.healthProbeTimer);
      this.healthProbeTimer = null;
    }
  }

  private startClientHeartbeat() {
    this.stopClientHeartbeat();
    this.clientHeartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.stopClientHeartbeat();
        return;
      }

      try {
        this.ws.send(JSON.stringify({ type: "heartbeat" }));
      } catch {
        this.handleHeartbeatMissed();
        return;
      }

      if (!this.heartbeatMissedTimer) {
        this.heartbeatMissedTimer = setTimeout(() => {
          this.handleHeartbeatMissed();
        }, this.HEARTBEAT_TIMEOUT_MS);
      }
    }, this.HEARTBEAT_PULSE_MS);
  }

  private stopClientHeartbeat() {
    if (this.clientHeartbeatInterval) {
      clearInterval(this.clientHeartbeatInterval);
      this.clientHeartbeatInterval = null;
    }
    if (this.heartbeatMissedTimer) {
      clearTimeout(this.heartbeatMissedTimer);
      this.heartbeatMissedTimer = null;
    }
  }

  private handleHeartbeatMissed() {
    this.stopClientHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.updateState({ status: "disconnected", isOffline: true });
    this.startFastHealthProbe();
  }

  private ensureConnected() {
    if (typeof window === "undefined") return;
    const token = loadToken();
    if (!token) {
      this.updateState({ status: "disconnected", isOffline: false });
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (this.isConnecting) return;
    this.isConnecting = true;
    this.updateState({ status: "connecting" });

    try {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const wsUrl = `${protocol}://${window.location.host}/ws?token=${token}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        const wasMaintenance = this.state.isMaintenance;
        this.isConnecting = false;
        this.retryDelay = 1000;
        this.stopFastHealthProbe();
        this.startClientHeartbeat();
        this.updateState({
          status: "connected",
          isOffline: false,
          lastConnectedAt: new Date(),
          retryCount: 0,
          isMaintenance: false,
          maintenanceMessage: "",
        });

        // If the server just came back online after an update / maintenance restart,
        // automatically reload the kiosk client so the fresh bundle is loaded immediately.
        if (wasMaintenance) {
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.type === "heartbeat_ack") {
            // Heartbeat acknowledged by server — connection is verified alive!
            if (this.heartbeatMissedTimer) {
              clearTimeout(this.heartbeatMissedTimer);
              this.heartbeatMissedTimer = null;
            }
            return;
          }

          if (data && data.type === "entity_updated") {
            this.notifyListeners(data as EntityUpdateEvent);
            window.dispatchEvent(new CustomEvent("entity_updated", { detail: data }));
          } else if (data && data.type === "request_decision") {
            window.dispatchEvent(new CustomEvent("request_decision", { detail: data }));
            this.notifyListeners({
              type: "entity_updated",
              entity: "requests",
              action: data.decision,
              id: data.id,
              timestamp: new Date().toISOString(),
            });
            this.notifyListeners({
              type: "entity_updated",
              entity: "inventory",
              action: "adjusted",
              timestamp: new Date().toISOString(),
            });
          } else if (data && data.type === "force_logout") {
            const message = data.message || "Your session has been ended by an administrator.";
            clearToken();
            if (window.location.pathname !== "/login") {
              toast.error("Session Ended", {
                description: message,
                duration: 8000,
              });
              setTimeout(() => {
                if (window.location.pathname !== "/login") {
                  window.location.href = "/login";
                }
              }, 600);
            }
            return;
          } else if (data && data.type === "server_maintenance") {
            const isMaint = data.status === "started";
            const wasMaint = this.state.isMaintenance;
            this.updateState({
              isMaintenance: isMaint,
              maintenanceMessage: data.message || (isMaint ? "System maintenance in progress." : ""),
            });
            if (wasMaint && !isMaint) {
              setTimeout(() => {
                window.location.reload();
              }, 1200);
            }
          }
        } catch {
          /* ignore non-json messages */
        }
      };

      this.ws.onclose = (event: CloseEvent) => {
        this.stopClientHeartbeat();
        this.isConnecting = false;
        this.ws = null;

        // Instant sub-second disconnection state
        this.updateState({
          status: "disconnected",
          isOffline: true,
          retryCount: this.state.retryCount + 1,
        });

        if (event.code === 1008 || event.code === 4001) {
          clearToken();
          if (window.location.pathname !== "/login") {
            window.location.href = "/login";
          }
          return;
        }

        this.startFastHealthProbe();

        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => {
          this.retryDelay = Math.min(this.retryDelay * 1.5, this.maxDelay);
          this.ensureConnected();
        }, this.retryDelay);
      };

      this.ws.onerror = () => {
        this.stopClientHeartbeat();
        this.isConnecting = false;
        this.updateState({ status: "disconnected", isOffline: true });
        this.startFastHealthProbe();
      };
    } catch {
      this.stopClientHeartbeat();
      this.isConnecting = false;
      this.updateState({ status: "disconnected", isOffline: true });
      this.startFastHealthProbe();
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
 * React hook that subscribes to live server connection and maintenance status.
 * Re-renders automatically on connection state changes within milliseconds.
 */
export function useServerStatus(): ServerStatusState & { reconnect: () => void } {
  const [statusState, setStatusState] = useState<ServerStatusState>(() => realtimeHub.getStatus());

  useEffect(() => {
    const unsubscribe = realtimeHub.subscribeStatus((nextState) => {
      setStatusState(nextState);
    });
    return unsubscribe;
  }, []);

  return {
    ...statusState,
    reconnect: () => realtimeHub.reconnectNow(),
  };
}

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
