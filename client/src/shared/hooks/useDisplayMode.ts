import { useEffect, useState } from "react";

/**
 * Hook to detect if the app is running in standalone display mode (PWA)
 * Returns true when the app is installed as a PWA or running in browser app mode
 */
export function useDisplayMode() {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check initial display mode
    const checkDisplayMode = () => {
      const mediaQuery = window.matchMedia("(display-mode: standalone)");
      setIsStandalone(mediaQuery.matches);

      // Also check for iOS standalone mode
      const isIOSStandalone =
        (window.navigator as any).standalone === true ||
        window.matchMedia("(display-mode: standalone)").matches;

      setIsStandalone(isIOSStandalone || mediaQuery.matches);
    };

    checkDisplayMode();

    // Listen for display mode changes
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const handleChange = () => checkDisplayMode();

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return isStandalone;
}
