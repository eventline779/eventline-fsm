import { Skeleton } from "@/components/ui/skeleton";

/**
 * Abrechnung-Skeleton: Header + zwei Streams (links Rechnungen, rechts Belege).
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1].map((col) => (
          <div key={col} className="space-y-3">
            <Skeleton className="h-6 w-40" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
