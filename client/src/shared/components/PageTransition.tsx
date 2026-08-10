import { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * PageTransition wrapper that provides smooth fade-in transitions for page content.
 * Uses GPU-friendly CSS properties (opacity, transform) for smooth performance.
 * 
 * @example
 * <PageTransition>
 *   <YourPageContent />
 * </PageTransition>
 */
export default function PageTransition({ children, className = "" }: PageTransitionProps) {
  return (
    <div 
      className={`animate-fade-in ${className}`}
      style={{
        animationDuration: "200ms",
        animationTimingFunction: "ease-out",
      }}
    >
      {children}
    </div>
  );
}
