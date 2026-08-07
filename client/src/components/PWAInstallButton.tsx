import { Button } from "@/components/ui/button";
import { Download, Monitor } from "lucide-react";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * PWA Install Button component
 * Shows an install button when the browser supports PWA installation
 * Only visible to Admin users in Settings
 */
export function PWAInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check if already installed
    const checkInstalled = () => {
      const isInStandaloneMode =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true;
      setIsInstalled(isInStandaloneMode);
    };

    checkInstalled();

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsSupported(true);
    };

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  // Don't show if already installed or not supported
  if (isInstalled) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-4 py-3 rounded-lg border border-green-200">
        <Monitor className="h-4 w-4" />
        <span>App is installed as a desktop application</span>
      </div>
    );
  }

  if (!isSupported) {
    return (
      <div className="text-sm text-gray-500 bg-gray-50 px-4 py-3 rounded-lg border border-gray-200">
        <p className="font-medium mb-1">PWA Installation Not Supported</p>
        <p className="text-xs">
          Your browser doesn't support PWA installation. Use Chrome, Edge, or Firefox on desktop to install this app.
        </p>
      </div>
    );
  }

  return (
    <Button onClick={handleInstallClick} className="w-full">
      <Download className="h-4 w-4 mr-2" />
      Install POS App
    </Button>
  );
}
