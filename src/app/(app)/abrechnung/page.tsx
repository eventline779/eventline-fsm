"use client";

/**
 * Abrechnung — abgeschlossene Auftraege als "Rechnung gestellt" markieren.
 *
 * Liste alle Jobs mit status='abgeschlossen' AND invoiced_at IS NULL —
 * die warten noch darauf dass die Rechnung gestellt wird. Pro Karte:
 *   - Header: INT-Nr, Titel, Kunde, Datum, Standort
 *   - Body 2-Spalten: Arbeitsrapport (vom service_report) | Stunden-Total
 *   - Action: Button "Rechnung gestellt" -> Modal mit RE-Nummer-Input
 *
 * Nach Submit: invoiced_at + invoice_number + invoiced_by gesetzt, der
 * Auftrag verschwindet aus der Liste und taucht im /auftraege-Archiv mit
 * "Abgerechnet"-Tag auf.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Receipt, Calendar, MapPin, User, FileText, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { TOAST } from "@/lib/messages";
import { usePermissions } from "@/lib/use-permissions";
import Link from "next/link";

interface ServiceReportData {
  id: string;
  work_description: string;
  equipment_used: string | null;
  issues: string | null;
  report_date: string;
}

interface TimeEntryData {
  id: string;
  user_id: string;
  clock_in: string;
  clock_out: string | null;
  user: { full_name: string } | null;
}

interface UnbilledJob {
  id: string;
  job_number: number | null;
  title: string;
  start_date: string | null;
  end_date: string | null;
  customer: { name: string } | null;
  location: { name: string } | null;
  service_reports: ServiceReportData[];
  time_entries: TimeEntryData[];
}

const SELECT = `
  id, job_number, title, start_date, end_date,
  customer:customers(name),
  location:locations(name),
  service_reports(id, work_description, equipment_used, issues, report_date),
  time_entries(id, user_id, clock_in, clock_out, user:profiles!time_entries_profile_id_fkey(full_name))
`.replace(/\s+/g, " ").trim();

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const datePart = iso.split("T")[0];
  const [y, m, d] = datePart.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatHours(totalMinutes: number): string {
  if (totalMinutes <= 0) return "0h";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

// Pro Mitarbeiter aggregierte Stunden — fuer die Spalte rechts. Nur Eintraege
// mit clock_out (offene Stempel-Sessions sind keine "abrechenbaren Stunden").
function aggregatePerUser(entries: TimeEntryData[]): { name: string; minutes: number }[] {
  const byUser = new Map<string, { name: string; minutes: number }>();
  for (const e of entries) {
    if (!e.clock_out) continue;
    const minutes = Math.round((new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime()) / 60000);
    const name = e.user?.full_name ?? "Unbekannt";
    const key = e.user_id;
    const existing = byUser.get(key);
    if (existing) existing.minutes += minutes;
    else byUser.set(key, { name, minutes });
  }
  return Array.from(byUser.values()).sort((a, b) => b.minutes - a.minutes);
}

export default function AbrechnungPage() {
  const supabase = createClient();
  const { can, ready } = usePermissions();
  const [jobs, setJobs] = useState<UnbilledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeJob, setActiveJob] = useState<UnbilledJob | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("jobs")
      .select(SELECT)
      .eq("status", "abgeschlossen")
      .is("invoiced_at", null)
      .neq("is_deleted", true)
      .order("end_date", { ascending: false, nullsFirst: false })
      .limit(100);
    if (error) {
      TOAST.supabaseError(error, "Aufträge konnten nicht geladen werden");
      setLoading(false);
      return;
    }
    setJobs((data as unknown as UnbilledJob[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  function openModal(job: UnbilledJob) {
    setActiveJob(job);
    setInvoiceNumber("");
  }

  function closeModal() {
    if (submitting) return;
    setActiveJob(null);
    setInvoiceNumber("");
  }

  async function submit() {
    if (!activeJob) return;
    const trimmed = invoiceNumber.trim();
    if (!trimmed) {
      TOAST.requiredField("Rechnungsnummer");
      return;
    }
    setSubmitting(true);
    const fullNumber = `RE-${trimmed}`;
    const res = await fetch(`/api/jobs/${activeJob.id}/mark-invoiced`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice_number: fullNumber }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!json.success) {
      TOAST.errorOr(json.error, "Markieren fehlgeschlagen");
      return;
    }
    toast.success(`INT-${activeJob.job_number ?? "?"} als ${fullNumber} abgerechnet`);
    setActiveJob(null);
    setInvoiceNumber("");
    // Aus der Liste entfernen — visueller Fortschritt ohne Re-Fetch.
    setJobs((prev) => prev.filter((j) => j.id !== activeJob.id));
  }

  const canEdit = useMemo(() => can("abrechnung:edit"), [can]);

  if (!ready) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Abrechnung</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Abgeschlossene Aufträge als "Rechnung gestellt" markieren. {jobs.length > 0 && `(${jobs.length} offen)`}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : jobs.length === 0 ? (
        <Card className="bg-card">
          <CardContent className="p-10 text-center">
            <CheckCircle2 className="h-10 w-10 mx-auto text-green-500 mb-3" />
            <p className="font-medium">Alles abgerechnet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Keine offenen Abrechnungen. Sobald ein Auftrag abgeschlossen wird, taucht er hier auf.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onMarkBilled={() => openModal(job)}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}

      <Modal
        open={activeJob !== null}
        onClose={closeModal}
        title={activeJob ? `Rechnung gestellt für INT-${activeJob.job_number ?? "?"}` : ""}
        icon={<Receipt className="h-5 w-5 text-blue-500" />}
        size="md"
        closable={!submitting}
      >
        <div>
          <label className="text-sm font-medium">Rechnungsnummer</label>
          <p className="text-xs text-muted-foreground mt-0.5 mb-2">
            Tippe nur den Nummern-Teil ein — "RE-" wird automatisch vorangestellt.
          </p>
          <div className="flex items-center">
            <span className="px-3 py-2 text-sm font-mono bg-muted/40 border border-r-0 rounded-l-lg text-muted-foreground">
              RE-
            </span>
            <Input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="2026-001"
              autoFocus
              className="rounded-l-none font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={closeModal}
            disabled={submitting}
            className="kasten kasten-muted flex-1"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !invoiceNumber.trim()}
            className="kasten kasten-green flex-1"
          >
            <Receipt className="h-3.5 w-3.5" />
            {submitting ? "Speichere…" : "Bestätigen"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

interface JobCardProps {
  job: UnbilledJob;
  onMarkBilled: () => void;
  canEdit: boolean;
}

function JobCard({ job, onMarkBilled, canEdit }: JobCardProps) {
  const report = job.service_reports[0] ?? null;
  const perUser = aggregatePerUser(job.time_entries);
  const totalMinutes = perUser.reduce((sum, p) => sum + p.minutes, 0);
  const dateRange = job.start_date && job.end_date && job.start_date !== job.end_date
    ? `${formatDate(job.start_date)} – ${formatDate(job.end_date)}`
    : formatDate(job.end_date ?? job.start_date);

  return (
    <Card className="bg-card">
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-semibold text-muted-foreground">
                INT-{String(job.job_number ?? "?").padStart(6, "0")}
              </span>
            </div>
            <h2 className="font-semibold text-base">
              <Link href={`/auftraege/${job.id}`} className="hover:underline">{job.title}</Link>
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
              {job.customer?.name && (
                <span className="inline-flex items-center gap-1">
                  <User className="h-3 w-3" />{job.customer.name}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />{dateRange}
              </span>
              {job.location?.name && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />{job.location.name}
                </span>
              )}
            </div>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={onMarkBilled}
              className="kasten kasten-green shrink-0"
            >
              <Receipt className="h-3.5 w-3.5" />
              Rechnung gestellt
            </button>
          )}
        </div>

        {/* Body — 2 Spalten: Rapport links | Stunden rechts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t">
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <FileText className="h-3 w-3" />Arbeitsrapport
            </h3>
            {report ? (
              <div className="space-y-2 text-sm">
                <p className="whitespace-pre-wrap text-foreground">{report.work_description}</p>
                {report.equipment_used && (
                  <p className="text-xs">
                    <span className="font-semibold text-muted-foreground">Material: </span>
                    <span className="whitespace-pre-wrap">{report.equipment_used}</span>
                  </p>
                )}
                {report.issues && (
                  <p className="text-xs">
                    <span className="font-semibold text-muted-foreground">Probleme: </span>
                    <span className="whitespace-pre-wrap">{report.issues}</span>
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">Kein Rapport erfasst.</p>
            )}
          </div>

          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Clock className="h-3 w-3" />Stunden
            </h3>
            <div className="space-y-2">
              <p className="text-2xl font-bold tabular-nums">{formatHours(totalMinutes)}</p>
              {perUser.length > 0 && (
                <div className="space-y-1 text-xs">
                  {perUser.map((p) => (
                    <div key={p.name} className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground truncate">{p.name}</span>
                      <span className="font-mono tabular-nums shrink-0">{formatHours(p.minutes)}</span>
                    </div>
                  ))}
                </div>
              )}
              {perUser.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Keine Stempelzeiten erfasst.</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
