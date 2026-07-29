import { useEffect, useState, useCallback } from "react";
import { loadToken } from "@/shared/utils/auth";

export interface ClerkNotification {
  id: string;
  type: "warning" | "danger" | "success";
  message: string;
  time: string;
  product_id?: number;
  product_name?: string;
  quantity?: number;
  reorder_level?: number;
  reference?: string;
}

export function useClerkNotifications() {
  const [notifications, setNotifications] = useState<ClerkNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const token = loadToken();
      if (!token) return;

      const response = await fetch("/api/inventory/notifications", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch (error) {
      console.error("Failed to fetch clerk notifications:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    fetchNotifications();
    // Refresh notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  return { notifications, unreadCount, clearAll, loading, refetch: fetchNotifications };
}
