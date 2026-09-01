import { Skeleton } from "@/components/ui/skeleton";

/**
 * Kalender-Skeleton: Header + Toolbar + grosser Kalenderbereich.
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <Skeleton className="h-[600px]" />
    </div>
  );
}
