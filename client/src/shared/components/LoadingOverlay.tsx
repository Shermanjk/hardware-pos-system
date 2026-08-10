import { ReactNode } from "react";
import LoadingSpinner from "./LoadingSpinner";

interface LoadingOverlayProps {
  /** Whether to show the overlay */
  isLoading: boolean;
  /** Optional message to display below the spinner */
  message?: string;
  /** Optional children to render when not loading */
  children?: ReactNode;
  /** CSS class name for custom styling */
  className?: string;
  /** Background color (default: white with 80% opacity) */
  backgroundColor?: string;
}

/**
 * Loading overlay component that covers its container with a centered spinner.
 * Useful for loading states that need to block interaction with content.
 * 
 * @example
 * <LoadingOverlay isLoading={loading} message="Loading data...">
 *   <YourContent />
 * </LoadingOverlay>
 */
export default function LoadingOverlay({ 
  isLoading, 
  message, 
  children,
  className = "",
  backgroundColor = "rgba(255, 255, 255, 0.8)"
}: LoadingOverlayProps) {
  if (!isLoading) {
    return <>{children}</>;
  }

  return (
    <div 
      className={`absolute inset-0 flex flex-col items-center justify-center z-10 ${className}`}
      style={{ backgroundColor }}
    >
      <LoadingSpinner size={24} className="text-blue-500 mb-2" />
      {message && (
        <p className="text-sm text-gray-600 font-medium">{message}</p>
      )}
    </div>
  );
}
