import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";

interface UpdateCheckResponse {
  installedVersion: string;
  updateInstalled: boolean;
}

export function UpdateNotification() {
  const [showNotification, setShowNotification] = useState(false);
  const [installedVersion, setInstalledVersion] = useState("");

  useEffect(() => {
    // Get current version from package.json (injected during build)
    const currentVersion = import.meta.env.VITE_APP_VERSION || "1.0.0";

    // If the user already clicked "Refresh Now" this session, don't re-show
    if (sessionStorage.getItem("update_notification_dismissed") === currentVersion) {
      return;
    }
    
    // Poll every 30 seconds to check for updates
    const checkForUpdates = async () => {
      try {
        const response = await fetch("/api/system-update/check", {
          headers: {
            "x-client-version": currentVersion,
          },
        });
        if (response.ok) {
          const data: UpdateCheckResponse = await response.json();
          if (data.updateInstalled) {
            setShowNotification(true);
            setInstalledVersion(data.installedVersion);
          }
        }
      } catch {
        // Silently fail — don't spam console with network errors
      }
    };

    const intervalId = setInterval(checkForUpdates, 30000);
    
    // Initial check
    checkForUpdates();

    return () => clearInterval(intervalId);
  }, []);

  const handleRefresh = () => {
    // Mark as dismissed for this session so the poll doesn't re-show it
    // immediately after the page reloads (before the new build is served)
    const currentVersion = import.meta.env.VITE_APP_VERSION || "1.0.0";
    sessionStorage.setItem("update_notification_dismissed", currentVersion);
    window.location.reload();
  };

  const handleDismiss = () => {
    const currentVersion = import.meta.env.VITE_APP_VERSION || "1.0.0";
    sessionStorage.setItem("update_notification_dismissed", currentVersion);
    setShowNotification(false);
  };

  if (!showNotification) return null;

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md">
      <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800 pr-10">
        <RefreshCw className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertTitle className="text-blue-900 dark:text-blue-100">
          Update Available
        </AlertTitle>
        <AlertDescription className="text-blue-800 dark:text-blue-200">
          The system has been updated to version {installedVersion}. Please refresh to get the latest changes.
          <div className="mt-3">
            <Button
              onClick={handleRefresh}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Refresh Now
            </Button>
          </div>
        </AlertDescription>
        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-blue-400 hover:text-blue-700 dark:text-blue-500 dark:hover:text-blue-300 transition-colors"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </Alert>
    </div>
  );
}
