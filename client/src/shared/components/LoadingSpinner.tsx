interface LoadingSpinnerProps {
  /** Size of the spinner in pixels (default: 16) */
  size?: number;
  /** CSS class name for custom styling */
  className?: string;
  /** Color override (default: current text color) */
  color?: string;
}

/**
 * Unified loading spinner component with consistent animation.
 * Uses a subtle spinning animation that's not distracting.
 * 
 * @example
 * <LoadingSpinner size={20} className="text-blue-500" />
 */
export default function LoadingSpinner({ 
  size = 16, 
  className = "", 
  color 
}: LoadingSpinnerProps) {
  const style = color ? { color } : undefined;
  
  return (
    <span 
      className={`inline-block rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        ...style,
      }}
    />
  );
}
