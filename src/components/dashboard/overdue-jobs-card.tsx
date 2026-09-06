"use client";

/**
 * Dashboard — Widget "Ueberfaellige Auftraege" (Admin-only).
 *
 * Zeigt Auftraege deren end_date in der Vergangenheit liegt, die aber noch
 * nicht abgeschlossen sind. Ziel: Admin uebersieht keine vergessenen
 * offenen Auftraege.
 *
 * Datenquelle: /api/dashboard -> admin.overdue_jobs = { count, items[] }.
 * Server liefert bereits die 5 aeltesten (aeltestes zuerst) und ein separates
 * Count fuer die Gesamtsumme.
 *
 * Farb-Regel: hier ist Rot bewusst — akute Terminueberschreitung, ein
 * Admin muss das SOFORT sehen. Bei count=0 dezenter positiver Zustand
 * (kein grosses Feuerwerk), damit die Karte im Normalfall nicht schreit.
 *
 * Route-Ziel /auftraege/[id] hat einen Sticky-Header mit eigenem BackButton.
 */

import Link from "next/link";
import { AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { JobNumber } from "@/components/job-number";

export interface OverdueJobItem {
  id: string;
  job_number: number | null;
  title: string;
  end_date: string;
  days_overdue: number;
  customer_name: string | null;
  location_name: string | null;
}

interface Props {
  count: number;
  items: OverdueJobItem[];
}

function overdueLabel(days: number): string {
  if (days <= 0) return "heute faellig";
  if (days === 1) return "seit 1 Tag";
  return `seit ${days} Tagen`;
}

export function OverdueJobsCard({ count, items }: Props) {
  if (count === 0) {
    return (
      <section className="rounded-xl border bg-card p-3 text-sm text-muted-foreground flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        Alles im Zeitplan — keine überfälligen Aufträge.
      </section>
    );
  }

  const remaining = Math.max(0, count - items.length);

  return (
    <section className="rounded-xl border border-red-500/30 dark:border-red-500/40 bg-card p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="mt-0.5 rounded-md bg-red-500/15 p-1.5 shrink-0">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading text-base font-semibold text-red-700 dark:text-red-300">
            Überfällig
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            End-Datum vergangen, aber noch nicht abgeschlossen
          </p>
        </div>
        <div className="font-heading text-3xl font-semibold text-red-600 dark:text-red-400 tabular-nums leading-none shrink-0">
          {count}
        </div>
      </div>

      <ul className="divide-y">
        {items.map((j) => (
          <li key={j.id}>
            <Link
              href={`/auftraege/${j.id}`}
              className="flex items-center gap-3 py-2 text-sm hover:text-accent transition-colors"
            >
              <JobNumber number={j.job_number} />
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{j.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {j.customer_name ?? j.location_name ?? "—"}
                </div>
              </div>
              <span className="text-xs font-medium text-red-600 dark:text-red-400 tabular-nums whitespace-nowrap">
                {overdueLabel(j.days_overdue)}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>

      {remaining > 0 && (
        <Link
          href="/auftraege?from=dashboard"
          className="mt-2 inline-flex items-center gap-1 text-xs text-accent font-medium hover:underline"
        >
          + {remaining} weitere anzeigen <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </section>
  );
}
