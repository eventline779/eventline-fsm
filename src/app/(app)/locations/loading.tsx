import { Skeleton } from "@/components/ui/skeleton";

/**
 * Locations-Skeleton: Header + Belegungsplan-artige Table (breite Zeilen).
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="flex gap-2 flex-wrap">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-[420px]" />
    </div>
  );
}
