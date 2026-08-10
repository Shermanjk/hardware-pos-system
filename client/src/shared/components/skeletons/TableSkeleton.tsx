import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
  /** Number of rows to show (default: 8) */
  rows?: number;
  /** Number of columns (default: 5) */
  columns?: number;
  /** Whether to show header skeleton (default: true) */
  showHeader?: boolean;
}

/**
 * Skeleton loader for table-based pages.
 * Matches typical table layouts to prevent layout shift.
 */
export default function TableSkeleton({ 
  rows = 8, 
  columns = 5,
  showHeader = true 
}: TableSkeletonProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {showHeader && (
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-9 rounded-md" />
          </div>
        </div>
      )}
      
      <div className="p-4">
        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              {Array.from({ length: columns }).map((_, j) => (
                <Skeleton 
                  key={j} 
                  className="h-4 rounded" 
                  style={{ 
                    width: j === 0 ? 'w-20' : j === columns - 1 ? 'w-16' : 'flex-1' 
                  }} 
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
