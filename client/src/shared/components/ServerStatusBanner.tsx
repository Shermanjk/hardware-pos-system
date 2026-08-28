import { AlertTriangle, RefreshCw, ServerOff, Wifi, WifiOff } from "lucide-react";
import { useServerStatus } from "@/shared/hooks/useRealtimeSync";
import { Button } from "@/components/ui/button";

interface ServerStatusBannerProps {
  className?: string;
  showInCashier?: boolean;
  isOfflineOverride?: boolean;
  onReconnectOverride?: () => void;
}

export function ServerStatusBanner({
  className = "",
  showInCashier = true,
  isOfflineOverride,
  onReconnectOverride,
}: ServerStatusBannerProps) {
  const { status, isOffline, isMaintenance, maintenanceMessage, retryCount, reconnect } = useServerStatus();

  const effectivelyOffline = isOfflineOverride !== undefined ? isOfflineOverride : isOffline || status === "disconnected";

  const handleReconnect = () => {
    reconnect();
    if (onReconnectOverride) {
      onReconnectOverride();
    }
  };

  // If server is connected and not in maintenance and not offline override, render nothing
  if (!effectivelyOffline && status === "connected" && !isMaintenance) {
    return null;
  }

  // Maintenance mode banner
  if (isMaintenance) {
    return (
      <div
        className={`bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white px-4 py-2.5 shadow-md flex items-center justify-between gap-3 text-sm z-50 animate-in fade-in duration-200 ${className}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1 bg-white/20 rounded-full shrink-0 animate-pulse">
            <RefreshCw className="w-4 h-4 animate-spin text-white" />
          </div>
          <div className="truncate">
            <span className="font-semibold mr-1.5">System Update in Progress:</span>
            <span className="text-amber-100">
              {maintenanceMessage || "The server is applying updates and will restart in a few moments."}
            </span>
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="bg-white/20 hover:bg-white/30 text-white border-0 text-xs shrink-0 h-7 px-3 cursor-pointer"
          onClick={handleReconnect}
        >
          <RefreshCw className="w-3 h-3 mr-1" />
          Check Status
        </Button>
      </div>
    );
  }

  // Offline / Disconnected banner
  if (effectivelyOffline || status === "disconnected") {
    return (
      <div
        className={`bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white px-4 py-2.5 shadow-md flex items-center justify-between gap-3 text-sm z-50 animate-in fade-in duration-200 ${className}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 bg-white/20 rounded-lg shrink-0 animate-pulse">
            <WifiOff className="w-4 h-4 text-white" />
          </div>
          <div className="truncate">
            <span className="font-bold mr-1.5">Server Unreachable:</span>
            <span className="text-red-100">
              {status === "connecting"
                ? `Reconnecting to POS backend (Attempt #${retryCount})...`
                : "Cannot communicate with POS backend. Product lookups and transactions are temporarily suspended."}
            </span>
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="bg-white/20 hover:bg-white/30 text-white border-0 text-xs shrink-0 h-7 px-3 font-semibold cursor-pointer"
          disabled={status === "connecting"}
          onClick={handleReconnect}
        >
          <RefreshCw className={`w-3 h-3 mr-1.5 ${status === "connecting" ? "animate-spin" : ""}`} />
          {status === "connecting" ? "Connecting..." : "Reconnect Now"}
        </Button>
      </div>
    );
  }

  return null;
}

interface ServerStatusBadgeProps {
  className?: string;
  showText?: boolean;
  isOfflineOverride?: boolean;
  onReconnectOverride?: () => void;
}

export function ServerStatusBadge({
  className = "",
  showText = true,
  isOfflineOverride,
  onReconnectOverride,
}: ServerStatusBadgeProps) {
  const { status, isOffline, isMaintenance, reconnect } = useServerStatus();

  const effectivelyOffline = isOfflineOverride !== undefined ? isOfflineOverride : isOffline || status === "disconnected";

  const handleReconnect = () => {
    reconnect();
    if (onReconnectOverride) {
      onReconnectOverride();
    }
  };

  if (isMaintenance) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200 ${className}`}
        title="Server is in maintenance mode"
      >
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
        {showText && <span>Maintenance</span>}
      </div>
    );
  }

  if (!effectivelyOffline && status === "connected" && !isOffline) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 ${className}`}
        title="Server connected (Real-time updates active)"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
        {showText && <span>Online</span>}
      </div>
    );
  }

  if (status === "connecting") {
    return (
      <button
        onClick={handleReconnect}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors ${className}`}
        title="Reconnecting to server..."
      >
        <RefreshCw className="w-3 h-3 animate-spin text-amber-600 shrink-0" />
        {showText && <span>Reconnecting...</span>}
      </button>
    );
  }

  return (
    <button
      onClick={handleReconnect}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 cursor-pointer hover:bg-red-100 transition-colors ${className}`}
      title="Server unreachable. Click to reconnect."
    >
      <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
      {showText && <span>Offline</span>}
    </button>
  );
}
