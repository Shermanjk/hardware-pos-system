import { useState, useEffect } from "react";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface UseDataCacheOptions {
  /** Cache duration in milliseconds (default: 5 minutes) */
  cacheDuration?: number;
  /** Whether to use stale-while-revalidate pattern (default: true) */
  staleWhileRevalidate?: boolean;
}

/**
 * Simple data caching hook for frequently accessed data.
 * Implements stale-while-revalidate pattern for smooth UX.
 * 
 * @example
 * const { data, isLoading, error, refetch } = useDataCache(
 *   'dashboard-data',
 *   () => fetchDashboardData(),
 *   { cacheDuration: 5 * 60 * 1000 }
 * );
 */
export function useDataCache<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  options: UseDataCacheOptions = {}
) {
  const {
    cacheDuration = 5 * 60 * 1000, // 5 minutes default
    staleWhileRevalidate = true,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastFetch, setLastFetch] = useState<number | null>(null);

  // Get cached data from localStorage
  const getCachedData = (): T | null => {
    try {
      const cached = localStorage.getItem(`cache-${cacheKey}`);
      if (!cached) return null;
      
      const entry: CacheEntry<T> = JSON.parse(cached);
      const now = Date.now();
      
      // Check if cache is still valid
      if (now - entry.timestamp < cacheDuration) {
        return entry.data;
      }
      
      // Cache expired, remove it
      localStorage.removeItem(`cache-${cacheKey}`);
      return null;
    } catch {
      return null;
    }
  };

  // Set cached data in localStorage
  const setCachedData = (value: T) => {
    try {
      const entry: CacheEntry<T> = {
        data: value,
        timestamp: Date.now(),
      };
      localStorage.setItem(`cache-${cacheKey}`, JSON.stringify(entry));
    } catch {
      // Ignore storage errors (e.g., quota exceeded)
    }
  };

  // Fetch data with caching
  const fetch = async (forceRefresh = false) => {
    const now = Date.now();
    const isStale = lastFetch && (now - lastFetch > cacheDuration);
    
    // If stale-while-revalidate is enabled and we have cached data, return it immediately
    if (staleWhileRevalidate && !forceRefresh && data && !isStale) {
      // Refresh in background
      fetcher()
        .then((freshData) => {
          setData(freshData);
          setCachedData(freshData);
          setLastFetch(Date.now());
        })
        .catch((err) => {
          console.error(`Background refresh failed for ${cacheKey}:`, err);
        });
      return;
    }

    // Otherwise, show loading state
    setIsLoading(true);
    setError(null);

    try {
      const freshData = await fetcher();
      setData(freshData);
      setCachedData(freshData);
      setLastFetch(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch data'));
      // If we have cached data, still show it even if fetch failed
      if (!data) {
        const cached = getCachedData();
        if (cached) {
          setData(cached);
          setLastFetch(Date.now() - cacheDuration + 1000); // Mark as stale
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    // Try to get cached data first
    const cached = getCachedData();
    if (cached && staleWhileRevalidate) {
      setData(cached);
      setLastFetch(Date.now() - cacheDuration + 1000); // Mark as stale to trigger background refresh
    }
    
    fetch();
  }, [cacheKey]); // Only re-run if cacheKey changes

  return {
    data,
    isLoading,
    error,
    refetch: () => fetch(true),
    isStale: lastFetch ? Date.now() - lastFetch > cacheDuration : true,
  };
}
