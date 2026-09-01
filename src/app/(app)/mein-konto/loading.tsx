import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mein-Konto-Skeleton: Header + Card-Stack (Profil, Passwort, Praeferenzen).
 */
export default function Loading() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    </div>
  );
}
