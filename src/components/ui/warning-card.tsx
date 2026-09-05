"use client";

/**
 * WarningCard — Wrapper fuer Cards mit einer/mehreren Warnungen.
 *
 * Visuelle Grammatik-Regel (Audit Thema 5, Regel 2):
 * Statt eigene Warning-Textzeile innerhalb einer Card zu rendern,
 * bekommt die Card einen 3px Left-Border in warning-color (amber) und
 * oben rechts (per `data-tooltip`) das erste Info-Icon mit dem
 * kombinierten Grund. So bleiben die Cards ruhig und die Warnung ist
 * auf einen Blick erkennbar.
 *
 * Muster:
 *   <WarningCard warnings={[{ label: "Kein Termin geplant" }]}>
 *     ...normale Card-Inhalte...
 *   </WarningCard>
 *
 * Der Wrapper rendert kein Card-Chrome (border/bg) — er umschliesst die
 * bereits gestylte Card und legt den Left-Border-Streifen dazwischen, so
 * dass das Grid-Layout der Liste unveraendert bleibt. Die Warning-Kante
 * ist auch im Dark-Mode 3px breit und leuchtet dezent amber; das Info-
 * Icon wird via absolute-Positionierung oben rechts der Card montiert.
 *
 * Wichtig: Der Wrapper hat `position: relative` — die Card selbst muss
 * ihre eigene z-Ordnung nicht anpassen. Das Info-Icon liegt via z-10
 * ueber dem Card-Rand aber unter Popovern/Modalen.
 */

import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type WarningCardWarning = {
  /** Kurze Beschriftung z.B. "Kein Termin geplant". Wird im Tooltip
   *  angezeigt und (visuell verborgen) als aria-Label uebernommen. */
  label: string;
  /** Optional: laengerer Text (Tooltip only). Falls leer, wird `label`
   *  auch als Tooltip verwendet. */
  detail?: string;
};

type Props = {
  /** Liste der aktiven Warnungen. Bei leerer Liste rendert der Wrapper
   *  ohne Left-Border/Info-Icon — die Card sieht dann normal aus. */
  warnings: WarningCardWarning[];
  /** Der eigentliche Card-Inhalt (Link, Card, Row etc.). */
  children: ReactNode;
  /** Zusaetzliche className fuer den Outer-Wrapper. */
  className?: string;
};

export function WarningCard({ warnings, children, className }: Props) {
  const hasWarnings = warnings.length > 0;
  const tooltipText = warnings
    .map((w) => (w.detail ? `${w.label} — ${w.detail}` : w.label))
    .join(" · ");

  // IMMER denselben Wrapper — auch ohne Warnung. Sonst haetten Warning-Cards
  // einen Extra-DOM-Level und die Karten sitzen visuell anders auf der
  // space-y-Skala als Non-Warning-Cards. Das Icon wird nur konditional
  // gerendert, positioniert absolut innerhalb der Card oben rechts.
  return (
    <div className={cn("relative", className)}>
      {children}
      {hasWarnings && (
        <span
          className="pointer-events-auto absolute right-2 top-2 z-20 flex items-center justify-center h-5 w-5 rounded-full bg-amber-100 dark:bg-amber-500/25 text-amber-700 dark:text-amber-300"
          data-tooltip={tooltipText}
          data-tooltip-align="end"
          aria-label={tooltipText}
        >
          <Info className="h-3 w-3" strokeWidth={2.5} />
        </span>
      )}
    </div>
  );
}
