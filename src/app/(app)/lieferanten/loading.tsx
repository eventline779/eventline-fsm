import { Skeleton } from "@/components/ui/skeleton";

/**
 * Lieferanten-Liste-Skeleton: Header + Suche + Tabellenzeilen.
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
      <Skeleton className="h-9 w-full max-w-md" />
      <div className="border rounded-xl overflow-hidden">
        <Skeleton className="h-10 rounded-none" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-none border-t" />
        ))}
      </div>
    </div>
  );
}
