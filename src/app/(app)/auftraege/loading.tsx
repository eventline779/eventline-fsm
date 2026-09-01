import { Skeleton } from "@/components/ui/skeleton";

/**
 * Auftraege-Liste-Skeleton: Header (Titel + Segment-Tabs + Action-Buttons)
 * + Filterleiste + Tabellenzeilen. Bildet die echte Table-Ansicht grob nach.
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="border rounded-xl overflow-hidden">
        <Skeleton className="h-10 rounded-none" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-none border-t" />
        ))}
      </div>
    </div>
  );
}
