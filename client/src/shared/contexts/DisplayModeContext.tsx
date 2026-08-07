import { createContext, useContext, useEffect, useState } from "react";

interface DisplayModeContextType {
  isStandalone: boolean;
}

const DisplayModeContext = createContext<DisplayModeContextType>({
  isStandalone: false,
});

export function DisplayModeProvider({ children }: { children: React.ReactNode }) {
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

  return (
    <DisplayModeContext.Provider value={{ isStandalone }}>
      {children}
    </DisplayModeContext.Provider>
  );
}

export function useDisplayMode() {
  const context = useContext(DisplayModeContext);
  return context.isStandalone;
}
