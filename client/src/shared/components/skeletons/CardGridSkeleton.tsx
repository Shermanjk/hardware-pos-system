import { Skeleton } from "@/components/ui/skeleton";

interface CardGridSkeletonProps {
  /** Number of cards to show (default: 4) */
  cards?: number;
  /** Number of columns (default: responsive grid) */
  columns?: number;
  /** Whether to show header skeleton (default: true) */
  showHeader?: boolean;
}

/**
 * Skeleton loader for card-based layouts.
 * Matches typical card grid layouts to prevent layout shift.
 */
export default function CardGridSkeleton({ 
  cards = 4, 
  showHeader = true 
}: CardGridSkeletonProps) {
  return (
    <div className="space-y-6">
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-9 rounded-md" />
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-20 mb-3" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
