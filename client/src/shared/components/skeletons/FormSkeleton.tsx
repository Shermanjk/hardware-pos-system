import { Skeleton } from "@/components/ui/skeleton";

interface FormSkeletonProps {
  /** Number of form fields (default: 6) */
  fields?: number;
  /** Whether to show header skeleton (default: true) */
  showHeader?: boolean;
  /** Whether to show action buttons (default: true) */
  showActions?: boolean;
}

/**
 * Skeleton loader for form-based pages.
 * Matches typical form layouts to prevent layout shift.
 */
export default function FormSkeleton({ 
  fields = 6, 
  showHeader = true,
  showActions = true 
}: FormSkeletonProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      {showHeader && (
        <div className="mb-6">
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
      )}
      
      <div className="space-y-5">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        ))}
      </div>
      
      {showActions && (
        <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-gray-200">
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
      )}
    </div>
  );
}
