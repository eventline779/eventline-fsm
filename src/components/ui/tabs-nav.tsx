"use client";

/**
 * TabsNav — kanonische Nav-Tab-Zeile (Underline-Style).
 *
 * Eventline hatte zwei Tab-Muster durcheinander:
 *   1) Underline-Tabs (border-b-2 accent) → NAVIGATION zwischen Screens
 *      (Mein-Konto, Partner-Portal-Top, Auftrag-Detail, Projekt-Detail)
 *   2) Kasten-Toggle (kasten-active / kasten-toggle-off) → FILTER
 *      (Segment-Toggles wie „Alle Zeit | Dieses Jahr", Aufträge-Liste
 *      „Anfragen | Aktiv | Archiv" etc.)
 *
 * Regel:
 *   - DIESELBE Datenmenge, anders gefiltert → Kasten-Toggle (bleibt)
 *   - VOLLSTAENDIG UNTERSCHIEDLICHE Screens/Sektionen → Underline-Tab (dies hier)
 *
 * Referenz-Optik: mein-konto/page.tsx (kleiner Text, dezenter Hover,
 * subtile border-b unter der ganzen Nav-Zeile).
 *
 * Props:
 *   - tabs: Array von { key, label, badge?, icon?, href? }
 *     - href optional: wenn gesetzt, wird ein <Link> gerendert (Prefetch etc.)
 *       statt Button + onChange. Fuer Multi-Page-Navs wie Partner-Portal.
 *   - active: Key des aktiven Tabs
 *   - onChange: fuer button-basierte Tabs (Same-Page-State-Switch)
 *   - className: optional zusaetzliche Klassen an das <nav>
 *
 * Keyboard (WAI-ARIA „automatic activation"):
 *   - ArrowLeft / ArrowRight: vorheriger / naechster Tab (cyclisch)
 *   - Home / End: erster / letzter Tab
 *   - Enter / Space: aktivieren (bei Buttons redundant zum Click)
 *
 * Semantik: role="tablist" am <nav>, role="tab" + aria-selected je Button/Link.
 */

import Link from "next/link";
import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number | string;
  /** Optional: wenn gesetzt wird der Tab als <Link> gerendert (fuer Multi-Page-Navs). */
  href?: string;
}

interface Props {
  tabs: TabItem[];
  active: string;
  onChange?: (key: string) => void;
  className?: string;
  /** Optional: zusaetzliche Klassen fuer jeden Tab (z.B. Padding-Override). */
  tabClassName?: string;
  /** Optional: aria-label fuer die Tab-Zeile (default: „Bereichs-Navigation"). */
  ariaLabel?: string;
}

export function TabsNav({
  tabs,
  active,
  onChange,
  className,
  tabClassName,
  ariaLabel = "Bereichs-Navigation",
}: Props) {
  const navRef = useRef<HTMLElement | null>(null);

  const focusTab = useCallback((idx: number) => {
    const nav = navRef.current;
    if (!nav) return;
    const items = nav.querySelectorAll<HTMLElement>("[role='tab']");
    const target = items[idx];
    if (target) target.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>, currentIdx: number) => {
      if (tabs.length === 0) return;
      let next: number | null = null;
      if (e.key === "ArrowRight") next = (currentIdx + 1) % tabs.length;
      else if (e.key === "ArrowLeft") next = (currentIdx - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      if (next === null) return;
      e.preventDefault();
      const target = tabs[next];
      // Automatic-activation-Pattern: sofort umschalten + Fokus mitfuehren.
      if (target.href) {
        // Bei Link-Tabs kein onChange — der Link uebernimmt die Navigation.
        focusTab(next);
      } else if (onChange) {
        onChange(target.key);
        focusTab(next);
      }
    },
    [tabs, onChange, focusTab],
  );

  return (
    <nav
      ref={navRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "border-b flex gap-1 overflow-x-auto overflow-y-hidden -mb-px",
        className,
      )}
    >
      {tabs.map((t, idx) => {
        const isActive = t.key === active;
        const classes = cn(
          "inline-flex items-center gap-2 px-3 py-2.5 -mb-px text-sm font-medium border-b-2 transition-colors whitespace-nowrap outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40",
          isActive
            ? "border-red-500 text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground hover:border-foreground/20",
          tabClassName,
        );
        const inner = (
          <>
            {t.icon}
            <span>{t.label}</span>
            {t.badge !== undefined && t.badge !== null && t.badge !== "" && (
              <span
                className={cn(
                  "ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-semibold tabular-nums",
                  isActive
                    ? "bg-red-500/15 text-red-700 dark:bg-red-500/25 dark:text-red-300"
                    : "bg-foreground/[0.08] text-muted-foreground",
                )}
              >
                {t.badge}
              </span>
            )}
          </>
        );

        if (t.href) {
          return (
            <Link
              key={t.key}
              href={t.href}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={classes}
            >
              {inner}
            </Link>
          );
        }
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            onClick={() => onChange?.(t.key)}
            className={classes}
          >
            {inner}
          </button>
        );
      })}
    </nav>
  );
}
