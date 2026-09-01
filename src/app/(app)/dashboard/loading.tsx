import { Skeleton } from "@/components/ui/skeleton";

/**
 * Dashboard-Skeleton: Titel + KPI-Reihe (3 Kacheln) + zwei grosse Karten
 * unten (Todos-Liste + Anstehende-Auftraege-Liste). Bildet das echte Layout
 * grob nach, damit beim Navigieren keine leere Flaeche blitzt.
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    </div>
  );
}
