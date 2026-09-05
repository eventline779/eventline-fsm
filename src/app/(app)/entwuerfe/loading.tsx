import { Skeleton } from "@/components/ui/skeleton";

/**
 * Entwuerfe-Liste-Skeleton — Header + Suchleiste + Kartenliste. Bildet
 * die echte Liste grob nach damit die Navigation ins Segment sofort
 * "landet" (siehe §7 Instant-Loading-Feedback).
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
