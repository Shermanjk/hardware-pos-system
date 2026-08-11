import { ReactNode } from "react";
import { useLocation } from "wouter";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * PageTransition wrapper that provides smooth fade-in transitions for page content.
 * Keyed on the current route so the animation only fires on actual navigations,
 * not on Suspense resolutions or parent re-renders.
 *
 * Uses GPU-friendly CSS properties (opacity, transform) for smooth performance.
 *
 * @example
 * <PageTransition>
 *   <YourPageContent />
 * </PageTransition>
 */
export default function PageTransition({ children, className = "" }: PageTransitionProps) {
  const [location] = useLocation();

  return (
    <div
      key={location}
      className={`animate-fade-in ${className}`}
      style={{
        animationDuration: "180ms",
        animationTimingFunction: "ease-out",
      }}
    >
      {children}
    </div>
  );
}
