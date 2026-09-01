"use client";

/**
 * NextAction — "Was steht jetzt an?"-Muster.
 *
 * Ausgangs-Problem (Audit): Der User faellt nach jeder Aktion aus dem
 * Prozess. Die App zeigt Daten, aber sagt nicht was zu tun ist. Antwort
 * darauf sind auto-abgeleitete Handlungs-Vorschlaege basierend auf dem
 * aktuellen DB-Zustand — kein statisches CTA, sondern kontext-abhaengig.
 *
 * Zwei Varianten:
 *   <NextActionInline>  kleiner Chip fuer Sticky-Header
 *                       (Icon + Label + optional Klick-Ziel)
 *   <NextActionsList>   Liste bis zu 5 Aktionen fuer Dashboard/Detail
 *
 * Jede Aktion ist entweder ein Link (`href`) ODER ein Callback (`onClick`).
 * `severity` steuert die Left-Border-Farbe (Warning-Card-Grammatik):
 *   info    = blau      "gute Idee, kein Druck"
 *   warn    = amber     "sollte bald passieren"
 *   danger  = rot       "ueberfaellig, blockiert Workflow"
 */

import Link from "next/link";
import type { ComponentType } from "react";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type NextActionSeverity = "info" | "warn" | "danger";

export interface NextAction {
  /** Stabiler Key fuer React-Listen — z.B. "job-INT-123-freigeben". */
  key: string;
  /** Lucide-Icon-Component (oder aehnliches). */
  icon: ComponentType<{ className?: string }>;
  /** Kurz-Label, z.B. "Rapport starten". */
  label: string;
  /** Optionaler Zusatz, z.B. "AU-1234 · Kunde X". */
  subtitle?: string;
  severity: NextActionSeverity;
  /** Navigations-Ziel. Wenn gesetzt, wird als <Link> gerendert. */
  href?: string;
  /** Alternativ: Klick-Handler (z.B. Modal oeffnen). */
  onClick?: () => void;
}

// Severity-Klassen — Left-Border folgt der Warning-Card-Grammatik. Dark-
// Mode-Werte sind ~2-3x kraeftiger, sonst verschwindet die Kante.
const SEVERITY = {
  info: {
    border: "bg-blue-400 dark:bg-blue-500",
    iconBg: "bg-blue-100 dark:bg-blue-500/25",
    iconText: "text-blue-700 dark:text-blue-300",
  },
  warn: {
    border: "bg-amber-400 dark:bg-amber-500",
    iconBg: "bg-amber-100 dark:bg-amber-500/25",
    iconText: "text-amber-700 dark:text-amber-300",
  },
  danger: {
    border: "bg-red-500 dark:bg-red-500",
    iconBg: "bg-red-100 dark:bg-red-500/25",
    iconText: "text-red-700 dark:text-red-300",
  },
} as const;

// =====================================================================
// NextActionInline — kleiner Chip fuer den Sticky-Header
// =====================================================================

interface InlineProps {
  action: NextAction | null;
  className?: string;
}

/**
 * Kompakter Chip, z.B. rechts neben dem Status-Badge im Auftrag-Detail.
 * Rendert nichts wenn `action=null` — der Aufrufer muss also nicht
 * conditional wrappen.
 */
export function NextActionInline({ action, className }: InlineProps) {
  if (!action) return null;
  const s = SEVERITY[action.severity];
  const Icon = action.icon;

  const inner = (
    <>
      <span
        className={cn(
          "flex items-center justify-center h-4 w-4 rounded-full shrink-0",
          s.iconBg,
          s.iconText,
        )}
      >
        <Icon className="h-2.5 w-2.5" />
      </span>
      <span className="truncate">{action.label}</span>
      <ChevronRight className="h-3 w-3 opacity-60 shrink-0" />
    </>
  );

  // Kasten-Grammatik: kleiner Pill-Style, farbige Left-Border, hover
  // etwas dunkler. Inline-Style haben wir hier bewusst NICHT — der Chip
  // ist ein reines Link/Button-Element und kein Card-Row.
  const classes = cn(
    "inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full",
    "text-[11px] font-medium max-w-[240px]",
    "border-l-[3px]",
    action.severity === "info" && "border-l-blue-400 dark:border-l-blue-500 bg-blue-500/[0.08] text-blue-800 dark:text-blue-200 hover:bg-blue-500/[0.14]",
    action.severity === "warn" && "border-l-amber-400 dark:border-l-amber-500 bg-amber-500/[0.10] text-amber-800 dark:text-amber-200 hover:bg-amber-500/[0.16]",
    action.severity === "danger" && "border-l-red-500 dark:border-l-red-500 bg-red-500/[0.10] text-red-800 dark:text-red-200 hover:bg-red-500/[0.16]",
    "transition-colors",
    className,
  );

  if (action.href) {
    return (
      <Link
        href={action.href}
        className={classes}
        data-tooltip={action.subtitle || undefined}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={action.onClick}
      className={classes}
      data-tooltip={action.subtitle || undefined}
    >
      {inner}
    </button>
  );
}

// =====================================================================
// NextActionsList — Liste bis zu 5 Aktionen fuer Dashboard/Detail
// =====================================================================

interface ListProps {
  /** Titel der Card, z.B. "Deine nächsten Aktionen". */
  title: string;
  /** Icon links vom Titel. */
  titleIcon?: ComponentType<{ className?: string }>;
  actions: NextAction[];
  /** Max angezeigte Aktionen (Default 5). Rest wird gezaehlt. */
  limit?: number;
  /** Optional: Klick "N weitere ansehen" — z.B. Modal oder /todos. */
  onShowMore?: () => void;
  /** Empty-State Text wenn `actions.length === 0`. */
  emptyLabel?: string;
  /** Empty-State Sub-Text. */
  emptySublabel?: string;
  /** Loading-State (bewusst optional — Card rendert Skeleton). */
  loading?: boolean;
  /** Zusatz-className fuer die Card. */
  className?: string;
}

/**
 * Vollstaendige Liste, ideal fuer Dashboard-Top-Slot und Detail-Panels.
 * Empty-State ist bewusst freundlich formuliert — der User soll ein
 * gutes Gefuehl bekommen wenn nichts ansteht ("alles im Lot").
 */
export function NextActionsList({
  title,
  titleIcon: TitleIcon,
  actions,
  limit = 5,
  onShowMore,
  emptyLabel = "Nichts anstehend — alles im Lot",
  emptySublabel,
  loading = false,
  className,
}: ListProps) {
  const shown = actions.slice(0, limit);
  const more = Math.max(0, actions.length - limit);

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {TitleIcon && <TitleIcon className="h-4 w-4 text-foreground/80" />}
          <h2 className="font-semibold text-sm">{title}</h2>
          {!loading && actions.length > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-foreground/[0.06] text-foreground/70">
              {actions.length}
            </span>
          )}
        </div>
        {more > 0 && onShowMore && (
          <button
            type="button"
            onClick={onShowMore}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            +{more} weitere
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="py-6 flex flex-col items-center text-center gap-1">
          <CheckCircle2 className="h-5 w-5 text-emerald-500/70 dark:text-emerald-400/80" />
          <p className="text-xs font-medium text-foreground/80">{emptyLabel}</p>
          {emptySublabel && (
            <p className="text-[11px] text-muted-foreground">{emptySublabel}</p>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {shown.map((a) => (
            <NextActionRow key={a.key} action={a} />
          ))}
        </div>
      )}
    </div>
  );
}

// Eine Zeile in der Liste — 3px Left-Border in Severity-Farbe, kompakt,
// klick fuehrt zum Ziel. Optik konsistent mit den anderen Dashboard-Rows
// (rounded-lg, foreground/[0.02] bg, hover heller).
function NextActionRow({ action }: { action: NextAction }) {
  const Icon = action.icon;
  const s = SEVERITY[action.severity];

  const inner = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg pointer-events-none",
          s.border,
        )}
      />
      <span
        className={cn(
          "flex items-center justify-center h-6 w-6 rounded-md shrink-0",
          s.iconBg,
          s.iconText,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{action.label}</p>
        {action.subtitle && (
          <p className="text-[11px] text-muted-foreground truncate">
            {action.subtitle}
          </p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </>
  );

  const classes = cn(
    "relative flex items-center gap-2.5 pl-4 pr-2.5 py-2 rounded-lg",
    "bg-foreground/[0.02] dark:bg-foreground/[0.04]",
    "hover:bg-foreground/[0.05] dark:hover:bg-foreground/[0.08]",
    "transition-colors min-w-0 text-left w-full",
  );

  if (action.href) {
    return (
      <Link href={action.href} className={classes}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={classes}>
      {inner}
    </button>
  );
}
