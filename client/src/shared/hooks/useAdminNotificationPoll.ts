// ─── useAdminNotificationPoll ─────────────────────────────────────────────────
// Polls GET /api/notifications/pending-counts every 60 s so that Admin sidebar
// badges stay accurate even when a WebSocket notification was missed during a
// reconnection gap.
//
// Merge strategy: Math.max(current, polled) for each count.
// This prevents race conditions where an in-flight WS event could make the
// badge appear to decrease if the HTTP poll responds slightly late.
//
// triggerRefresh is passed as the `onOpen` callback to createReconnectingWS
// so the poll fires immediately on every WebSocket reconnect, recovering any
// notifications missed during the disconnection window.

import { useState, useCallback, useEffect } from "react";
import httpClient from "@/shared/api/httpClient";

interface PendingCounts {
  pendingReturns: number;
  pendingVoids:   number;
}

interface UseAdminNotificationPollResult {
  pendingReturns: number;
  pendingVoids:   number;
  /** Call this immediately after a WS reconnect to catch up on missed events. */
  triggerRefresh: () => void;
}

const POLL_INTERVAL_MS = 60_000; // 60 s

export function useAdminNotificationPoll(): UseAdminNotificationPollResult {
  const [counts, setCounts] = useState<PendingCounts>({
    pendingReturns: 0,
    pendingVoids:   0,
  });

  const fetchCounts = useCallback(async () => {
    try {
      const res = await httpClient.get<PendingCounts>("/api/notifications/pending-counts");
      setCounts((prev) => ({
        // Higher-wins merge: never let a stale HTTP response decrease a count
        // that was already incremented by an in-flight WebSocket event.
        pendingReturns: Math.max(prev.pendingReturns, res.data.pendingReturns),
        pendingVoids:   Math.max(prev.pendingVoids,   res.data.pendingVoids),
      }));
    } catch {
      // Retain last known counts on failure — don't reset to 0.
    }
  }, []);

  useEffect(() => {
    fetchCounts();
    const id = setInterval(fetchCounts, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchCounts]);

  return {
    pendingReturns: counts.pendingReturns,
    pendingVoids:   counts.pendingVoids,
    triggerRefresh: fetchCounts,
  };
}
