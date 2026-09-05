"use client";

/**
 * Auftrag-Detail: Sticky-Header (Nummer/Titel/Badges/Meta/Aktionen/Tab-Nav).
 *
 * Sitzt oben in der Detail-Seite und bleibt beim Scrollen an der oberen
 * Kante des #app-scroll-Wrappers stehen. Alle Zustands-Actions (Freigeben,
 * Abschliessen, Bearbeiten, Stornieren, Stempeln) sitzen direkt in der
 * Aktions-Bar — kein Overflow-Menu mehr; Farbtrennung (blau=primaer,
 * gruen=abschliessen, rot=destruktiv) verhindert Klick-Verwechslungen.
 */

import { type ReactNode } from "react";
import {
  MapPin,
  User,
  Calendar,
  XCircle,
  AlertCircle,
  Inbox,
} from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { JobNumber } from "@/components/job-number";
import { JobStempelButton } from "@/components/stempel/job-stempel-button";
import { TabsNav } from "@/components/ui/tabs-nav";
import { JOB_STATUS } from "@/lib/constants";
import type { JobDetailWithRelations, JobStatus } from "@/types";

export type TabKey = "uebersicht" | "rapport" | "dokumente";

type StatusAction = {
  from: JobStatus[];
  to: JobStatus;
  label: string;
  icon: React.ReactNode;
  variant: "primary" | "outline" | "destructive";
};

type Tab = { key: TabKey; label: string; icon: React.ReactNode };

type Props = {
  jobId: string;
  job: JobDetailWithRelations;
  canEdit: boolean;
  availableActions: StatusAction[];
  onStatusAction: (to: JobStatus) => void | Promise<void>;
  onOpenCancel: () => void;
  canFinish: boolean;
  finishBlockReason: string;
  tabs: Tab[];
  activeTab: TabKey;
  onSelectTab: (t: TabKey) => void;
  /** Auto-abgeleiteter "was jetzt?"-Chip — die Detail-Page erzeugt ihn
   *  ueber <AuftragNextActionChip> und reicht ihn hier durch, damit der
   *  Header keine Modal-/Status-Callbacks kennen muss. */
  nextActionChip?: ReactNode;
};

export function AuftragStickyHeader({
  jobId,
  job,
  canEdit,
  availableActions,
  onStatusAction,
  onOpenCancel,
  canFinish,
  finishBlockReason,
  tabs,
  activeTab,
  onSelectTab,
  nextActionChip,
}: Props) {
  const customer = job.customer ?? job.location?.customer ?? undefined;
  const location = job.location ?? undefined;
  const room = job.room ?? undefined;
  const isDringend = job.priority === "dringend";

  const eventDateLabel = job.start_date
    ? `${new Date(job.start_date).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })}${
        job.end_date && job.end_date !== job.start_date
          ? ` – ${new Date(job.end_date).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })}`
          : ""
      }`
    : "";
  const locationLabel = location?.name ?? room?.name ?? job.external_address ?? "";

  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b -mx-4 md:-mx-10 px-4 md:px-10 pt-1 pb-3 mb-6">
      <div className="flex items-start gap-3">
        <BackButton fallbackHref="/auftraege" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <JobNumber number={job.job_number} size="md" />
            {job.status !== "offen" && (
              <span
                className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full ${JOB_STATUS[job.status].color}`}
              >
                {JOB_STATUS[job.status].label}
              </span>
            )}
            {isDringend && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">
                <AlertCircle className="h-3 w-3" />
                Dringend
              </span>
            )}
            {job.was_anfrage && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-foreground/[0.06] text-muted-foreground"
                data-tooltip="Aus einer Vermietungs-Anfrage entstanden"
              >
                <Inbox className="h-3 w-3" />
                Vermietung
              </span>
            )}
            {/* Auto-abgeleiteter "was jetzt?"-Chip — Klick fuehrt direkt
                zur naechsten sinnvollen Aktion (Termine anlegen, Personal
                zuteilen, Rapport starten, Rechnung stellen etc.). Rendert
                null wenn nichts ansteht (z.B. sauberer abgerechneter Job). */}
            {nextActionChip}
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight truncate mt-0.5">{job.title}</h1>
          {(customer?.name || locationLabel || eventDateLabel) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
              {customer?.name && (
                <span className="inline-flex items-center gap-1 min-w-0">
                  <User className="h-3 w-3 shrink-0" />
                  <span className="truncate">{customer.name}</span>
                </span>
              )}
              {locationLabel && (
                <span className="inline-flex items-center gap-1 min-w-0">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{locationLabel}</span>
                </span>
              )}
              {eventDateLabel && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3 shrink-0" />
                  <span className="tabular-nums">{eventDateLabel}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Aktions-Bar */}
      <div className="flex flex-wrap gap-2 mt-3">
        {availableActions
          .filter((a) => a.to !== "storniert")
          .filter((a) => a.to === "abgeschlossen" || canEdit)
          .map((a) => {
            // Visuelle Grammatik: EINE Primaer-Aktion pro Screen (Audit
            // Thema 5, Regel 1). Rot ist reserviert fuer destruktive
            // Aktionen (Stornieren, Loeschen). Positive Primaerer wie
            // Freigeben/Abschliessen sind blau bzw. gruen.
            const isFinish = a.to === "abgeschlossen";
            const isPrimary = a.variant === "primary";
            const tone = isFinish ? "kasten-green" : isPrimary ? "kasten-blue" : "kasten-muted";
            const isRelease = a.to === "offen";
            const releaseBlocked = isRelease && (!job.start_date || !job.end_date);
            return (
              <button
                key={a.to}
                type="button"
                onClick={() => onStatusAction(a.to)}
                disabled={releaseBlocked}
                data-tooltip={releaseBlocked ? "Bitte erst Datum im Bearbeiten-Modus setzen" : undefined}
                className={`kasten ${tone}`}
              >
                {a.icon}
                {a.label}
              </button>
            );
          })}

        {canEdit && availableActions.some((a) => a.to === "storniert") && (
          // Stornieren als direkter Button (nicht mehr im Overflow-Menu).
          // Rot ist app-weit ONLY fuer destruktive Aktionen reserviert, und
          // die positiv-primaeren Buttons daneben nutzen kasten-blue
          // (Freigeben) bzw. kasten-green (Abschliessen) — klare visuelle
          // Trennung durch Farbe, kein Klick-Risiko.
          <button
            type="button"
            onClick={onOpenCancel}
            className="kasten kasten-red"
            data-tooltip="Auftrag stornieren"
            data-tooltip-align="end"
          >
            <XCircle className="h-4 w-4" />
            Stornieren
          </button>
        )}

        {job.status === "offen" && (
          <JobStempelButton jobId={jobId} jobNumber={job.job_number} />
        )}
      </div>

      {/* End-Date-Hint */}
      {!canFinish && job.status === "offen" && finishBlockReason && (
        <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1.5">
          <AlertCircle className="h-3 w-3" />
          {finishBlockReason} — Rapport kann jedoch schon jetzt vorbereitet werden.
        </p>
      )}

      {/* Tab-Nav */}
      <TabsNav
        tabs={tabs}
        active={activeTab}
        onChange={(k) => onSelectTab(k as TabKey)}
        className="mt-3 border-0"
        ariaLabel="Auftrag-Bereiche"
      />
    </div>
  );
}
