import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("rounded-md bg-gray-200 animate-shimmer", className)}
      {...props}
    />
  );
}

export { Skeleton };
