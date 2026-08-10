import { useState, useEffect, useRef } from "react";

interface UseSmartLoadingOptions {
  /** Delay in ms before showing loading state (default: 150ms) */
  delay?: number;
  /** Minimum display duration in ms once shown (default: 300ms) */
  minDisplayDuration?: number;
}

/**
 * Smart loading hook that prevents flashing loaders for fast requests.
 * 
 * - Delays showing loading state to avoid flashes for fast requests
 * - Ensures minimum display duration once shown to prevent flickering
 * - Returns whether to show loading UI
 * 
 * @example
 * const { isLoading, showLoading } = useSmartLoading();
 * 
 * // In your data fetch:
 * setLoading(true);
 * try {
 *   await fetchData();
 * } finally {
 *   setLoading(false);
 * }
 * 
 * // In your render:
 * {showLoading && <Skeleton />}
 */
export function useSmartLoading(options: UseSmartLoadingOptions = {}) {
  const {
    delay = 150,
    minDisplayDuration = 300,
  } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  
  const loadingStartTimeRef = useRef<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const minDisplayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isLoading) {
      // Clear any existing timeouts
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (minDisplayTimeoutRef.current) clearTimeout(minDisplayTimeoutRef.current);
      
      // Delay showing loading state
      timeoutRef.current = setTimeout(() => {
        loadingStartTimeRef.current = Date.now();
        setShowLoading(true);
      }, delay);
    } else {
      // Clear delay timeout if loading was cancelled before delay
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      // If currently showing loading, ensure minimum display duration
      if (showLoading && loadingStartTimeRef.current) {
        const elapsed = Date.now() - loadingStartTimeRef.current;
        const remaining = Math.max(0, minDisplayDuration - elapsed);
        
        if (remaining > 0) {
          minDisplayTimeoutRef.current = setTimeout(() => {
            setShowLoading(false);
            loadingStartTimeRef.current = null;
          }, remaining);
        } else {
          setShowLoading(false);
          loadingStartTimeRef.current = null;
        }
      } else {
        // Not showing loading yet, just hide immediately
        setShowLoading(false);
        loadingStartTimeRef.current = null;
      }
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (minDisplayTimeoutRef.current) clearTimeout(minDisplayTimeoutRef.current);
    };
  }, [isLoading, delay, minDisplayDuration, showLoading]);

  return { isLoading: showLoading, setIsLoading, showLoading };
}
