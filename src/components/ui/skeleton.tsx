/**
 * Skeleton-Baustein fuer loading.tsx-Fallbacks (CLAUDE.md §7).
 * Shimmer via .shimmer-Klasse (globals.css → keyframes shimmer). Ziel: das echte
 * Layout grob vor-nachbilden, sodass beim Route-Wechsel keine weisse Seite
 * blitzt, sondern sofort die Ziel-Struktur (Header, Tabelle, Grid) erscheint.
 */
export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`shimmer rounded-md ${className}`}
      aria-hidden
    />
  );
}
