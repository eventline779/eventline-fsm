import { Skeleton } from "@/components/ui/skeleton";

/**
 * Vertrieb-Kanban-Skeleton: Header + 3-Split (Liste links, Detail rechts).
 * Bildet die zweispaltige Master/Detail-Ansicht nach.
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_1fr] gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}
