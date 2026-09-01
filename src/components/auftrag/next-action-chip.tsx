"use client";

/**
 * AuftragNextActionChip — der "was jetzt?"-Chip fuer den Auftrag-Detail-
 * Sticky-Header. Auto-abgeleitet aus dem Job-Zustand + Termin-Liste
 * + Rapport-Status.
 *
 * Ausgelagert in eigenes Component damit die Sticky-Header-Datei (die
 * parallel von einer anderen Session fuer die Tab-Nav-Migration bearbeitet
 * wird) minimal beruehrt wird — Header importiert nur diesen Chip.
 *
 * Regel-Werk (in Prioritaets-Reihenfolge — nur die ERSTE zutreffende Regel
 * wird als Chip angezeigt):
 *   1. status=entwurf                                → Freigeben
 *   2. status=offen  + keine Termine                 → Termine anlegen
 *   3. status=offen  + Termine ohne Personal          → Personal zuteilen
 *   4. status=offen  + eigener Rapport-Entwurf offen → Rapport fortsetzen
 *   5. status=offen  + heute Startdatum + kein Rapport → Rapport starten
 *   6. status=offen  + Enddatum vorbei + kein Rapport → Auftrag abschliessen
 *   7. status=abgeschlossen + keine Rechnung gestellt → Rechnung stellen
 *   Sonst: kein Chip (null).
 *
 * Chip zeigt IMMER nur EINE Aktion — die naechste Front-of-Line. Sonst
 * wird der Header optisch ueberladen und die Aussagekraft verwaessert.
 */

import { CheckCircle, Calendar, Users, FileEdit, FilePlus, Receipt, Flag } from "lucide-react";
import { NextActionInline, type NextAction } from "@/components/ui/next-action";
import { localDateIso } from "@/lib/swiss-time";
import type { JobDetailWithRelations, JobAppointment } from "@/types";

type ReportSummary = {
  id: string;
  status: string;
  created_by: string;
};

interface Props {
  jobId: string;
  job: JobDetailWithRelations;
  appointments: JobAppointment[];
  reports: ReportSummary[];
  currentUserId: string | null;
  /** Callback fuer "Rapport starten/fortsetzen" — oeffnet das Rapport-Modal
   *  im Detail-Page-State. Fuer "Termine anlegen"/etc. reicht href-Navigation. */
  onOpenRapport: () => void;
  /** Callback fuer "Freigeben" — Status-Aktion. */
  onRelease: () => void;
  /** Callback fuer "Auftrag abschliessen" — oeffnet ebenfalls das Rapport-Modal. */
  onFinish: () => void;
  /** Callback fuer "Rechnung stellen" — im Regelfall Link zu /abrechnung? */
}

export function AuftragNextActionChip({
  jobId,
  job,
  appointments,
  reports,
  currentUserId,
  onOpenRapport,
  onRelease,
  onFinish,
}: Props) {
  const action = deriveNextAction({ jobId, job, appointments, reports, currentUserId, onOpenRapport, onRelease, onFinish });
  return <NextActionInline action={action} />;
}

function deriveNextAction(args: {
  jobId: string;
  job: JobDetailWithRelations;
  appointments: JobAppointment[];
  reports: ReportSummary[];
  currentUserId: string | null;
  onOpenRapport: () => void;
  onRelease: () => void;
  onFinish: () => void;
}): NextAction | null {
  const { jobId, job, appointments, reports, currentUserId, onOpenRapport, onRelease, onFinish } = args;

  // Storniert / partner_anfrage / anfrage: kein Chip — dort greifen andere
  // Grammatiken (Storno-Banner, Partner-Anfrage-Banner). NextAction ist
  // fuer den "operativen" Zustand.
  if (job.status === "storniert" || job.status === "partner_anfrage" || job.status === "anfrage") {
    return null;
  }

  // 1. Entwurf → Freigeben (info: kein Druck, aber logischer naechster Schritt).
  //    Wenn Datum fehlt, sagt der Chip "Datum ergaenzen fuer Freigabe".
  if (job.status === "entwurf") {
    if (!job.start_date || !job.end_date) {
      return {
        key: `job-${jobId}-datum-fehlt`,
        icon: Calendar,
        label: "Datum ergänzen",
        subtitle: "Start-/Enddatum setzen um freizugeben",
        severity: "info",
        href: `/auftraege/${jobId}/bearbeiten`,
      };
    }
    return {
      key: `job-${jobId}-freigeben`,
      icon: CheckCircle,
      label: "Freigeben",
      subtitle: "Auftrag aus dem Entwurf zurück nach Offen",
      severity: "info",
      onClick: onRelease,
    };
  }

  // 7. Abgeschlossen + keine Rechnung + kein Skip → Rechnung stellen (warn).
  if (job.status === "abgeschlossen") {
    if (!job.invoiced_at && !job.invoice_skipped_at) {
      return {
        key: `job-${jobId}-rechnung`,
        icon: Receipt,
        label: "Rechnung stellen",
        subtitle: "Abgeschlossen — Abrechnung offen",
        severity: "warn",
        href: `/abrechnung?job=${jobId}`,
      };
    }
    return null; // sauber abgerechnet
  }

  // Ab hier: status === "offen".
  if (job.status !== "offen") return null;

  // 2. Offen ohne Termine → Termine anlegen.
  if (appointments.length === 0) {
    return {
      key: `job-${jobId}-termine`,
      icon: Calendar,
      label: "Termine anlegen",
      subtitle: "Auftrag ist freigegeben, aber ohne geplante Termine",
      severity: "warn",
      href: `/auftraege/${jobId}?tab=uebersicht&termin=neu`,
    };
  }

  // 3. Offen mit Terminen aber keiner hat einen assigned_to → Personal zuteilen.
  const hasAssignees = appointments.some((a) => !!a.assigned_to);
  if (!hasAssignees) {
    return {
      key: `job-${jobId}-personal`,
      icon: Users,
      label: "Personal zuteilen",
      subtitle: `${appointments.length} Termin${appointments.length === 1 ? "" : "e"} ohne zugewiesene Person`,
      severity: "warn",
      href: `/auftraege/${jobId}?tab=uebersicht`,
    };
  }

  // 4. Offen + eigener Rapport-Entwurf offen → Rapport fortsetzen.
  const ownDraft = reports.find(
    (r) => r.status === "entwurf" && currentUserId && r.created_by === currentUserId,
  );
  if (ownDraft) {
    return {
      key: `job-${jobId}-rapport-fortsetzen`,
      icon: FileEdit,
      label: "Rapport fortsetzen",
      subtitle: "Du hast einen offenen Rapport-Entwurf",
      severity: "info",
      onClick: onOpenRapport,
    };
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  const startISO = job.start_date ? localDateIso(new Date(job.start_date)) : null;
  const endISO = job.end_date ? localDateIso(new Date(job.end_date)) : null;

  // 5. Offen + heute Startdatum + kein Rapport (weder Entwurf noch abgeschlossen)
  //    → Rapport starten. Nur relevant fuer User, die heute assigned sind.
  const hasAnyReport = reports.length > 0;
  const isAssignedToday = currentUserId
    ? appointments.some((a) => {
        if (a.assigned_to !== currentUserId) return false;
        const dISO = localDateIso(new Date(a.start_time));
        return dISO === todayISO;
      })
    : false;
  if (startISO === todayISO && isAssignedToday && !hasAnyReport) {
    return {
      key: `job-${jobId}-rapport-starten`,
      icon: FilePlus,
      label: "Rapport starten",
      subtitle: "Dein Termin startet heute",
      severity: "info",
      onClick: onOpenRapport,
    };
  }

  // 6. Offen + Enddatum vorbei + kein abgeschlossener Rapport → abschliessen.
  const hasCompletedReport = reports.some((r) => r.status === "abgeschlossen");
  if (endISO && endISO < todayISO && !hasCompletedReport) {
    const daysAgo = Math.max(
      1,
      Math.round((Date.parse(todayISO) - Date.parse(endISO)) / 86400000),
    );
    return {
      key: `job-${jobId}-abschliessen`,
      icon: Flag,
      label: "Auftrag abschließen",
      subtitle: `Enddatum vor ${daysAgo} Tag${daysAgo === 1 ? "" : "en"} — Rapport fehlt`,
      severity: "danger",
      onClick: onFinish,
    };
  }

  return null;
}
