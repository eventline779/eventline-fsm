"use client";

/**
 * Abrechnung — zwei parallele Ablage-Streams.
 *
 *  LINKS  — Auftraege (status='abgeschlossen', invoiced_at IS NULL):
 *           Header, Arbeitsrapport, Stunden, Button "Rechnung gestellt".
 *           Modal asks fuer RE-Nummer.
 *
 *  RECHTS — Belege (type='beleg', filed_at IS NULL, status != 'abgelehnt'):
 *           Header (Lieferant, Betrag, Kaufdatum), Description, Button
 *           "Beleg abgelegt". Modal asks fuer Ablage-Referenz (BL-Nummer).
 *
 * Beide Streams laufen unabhaengig — Permission-Gate ueber abrechnung:edit
 * fuer beide Buttons.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Receipt, Calendar, MapPin, User, FileText, Clock, CheckCircle2, Banknote, Building2, FolderArchive } from "lucide-react";
import { toast } from "sonner";
import { TOAST } from "@/lib/messages";
import { usePermissions } from "@/lib/use-permissions";
import Link from "next/link";
import type { TicketDataBeleg } from "@/types";

// =====================================================================
// Auftrags-Stream (links)
// =====================================================================

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

const JOBS_SELECT = `
  id, job_number, title, start_date, end_date,
  customer:customers(name),
  location:locations(name),
  service_reports(id, work_description, equipment_used, issues, report_date),
  time_entries(id, user_id, clock_in, clock_out, user:profiles!time_entries_profile_id_fkey(full_name))
`.replace(/\s+/g, " ").trim();

// =====================================================================
// Belege-Stream (rechts)
// =====================================================================

interface UnfiledBeleg {
  id: string;
  ticket_number: number;
  title: string;
  description: string | null;
  status: string;
  data: TicketDataBeleg;
  created_at: string;
  creator: { full_name: string } | null;
}

const BELEGE_SELECT = `
  id, ticket_number, title, description, status, data, created_at,
  creator:profiles!tickets_created_by_fkey(full_name)
`.replace(/\s+/g, " ").trim();

// =====================================================================
// Helpers
// =====================================================================

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

// =====================================================================
// Page
// =====================================================================

type ModalState =
  | { kind: "job"; job: UnbilledJob }
  | { kind: "beleg"; beleg: UnfiledBeleg }
  | null;

export default function AbrechnungPage() {
  const supabase = createClient();
  const { can, ready } = usePermissions();
  const [jobs, setJobs] = useState<UnbilledJob[]>([]);
  const [belege, setBelege] = useState<UnfiledBeleg[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [jobsRes, belegeRes] = await Promise.all([
      supabase
        .from("jobs")
        .select(JOBS_SELECT)
        .eq("status", "abgeschlossen")
        .is("invoiced_at", null)
        .neq("is_deleted", true)
        .order("end_date", { ascending: false, nullsFirst: false })
        .limit(100),
      supabase
        .from("tickets")
        .select(BELEGE_SELECT)
        .eq("type", "beleg")
        .is("filed_at", null)
        .neq("status", "abgelehnt")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (jobsRes.error) TOAST.supabaseError(jobsRes.error, "Aufträge konnten nicht geladen werden");
    if (belegeRes.error) TOAST.supabaseError(belegeRes.error, "Belege konnten nicht geladen werden");
    setJobs((jobsRes.data as unknown as UnbilledJob[]) ?? []);
    setBelege((belegeRes.data as unknown as UnfiledBeleg[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  function openJobModal(job: UnbilledJob) {
    setModal({ kind: "job", job });
    setReference("");
  }

  function openBelegModal(beleg: UnfiledBeleg) {
    setModal({ kind: "beleg", beleg });
    setReference("");
  }

  function closeModal() {
    if (submitting) return;
    setModal(null);
    setReference("");
  }

  async function submit() {
    if (!modal) return;
    const trimmed = reference.trim();
    if (!trimmed) {
      TOAST.requiredField(modal.kind === "job" ? "Rechnungsnummer" : "Ablage-Referenz");
      return;
    }
    setSubmitting(true);
    let url: string;
    let body: Record<string, string>;
    let prefix: string;
    if (modal.kind === "job") {
      url = `/api/jobs/${modal.job.id}/mark-invoiced`;
      prefix = "RE-";
      body = { invoice_number: `${prefix}${trimmed}` };
    } else {
      url = `/api/tickets/${modal.beleg.id}/mark-filed`;
      prefix = "BL-";
      body = { filed_reference: `${prefix}${trimmed}` };
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!json.success) {
      TOAST.errorOr(json.error, "Markieren fehlgeschlagen");
      return;
    }
    if (modal.kind === "job") {
      toast.success(`INT-${modal.job.job_number ?? "?"} als ${prefix}${trimmed} abgerechnet`);
      setJobs((prev) => prev.filter((j) => j.id !== modal.job.id));
    } else {
      toast.success(`Beleg T-${modal.beleg.ticket_number} abgelegt`);
      setBelege((prev) => prev.filter((b) => b.id !== modal.beleg.id));
    }
    setModal(null);
    setReference("");
  }

  const canEdit = useMemo(() => can("abrechnung:edit"), [can]);

  if (!ready) return null;

  const isJobModal = modal?.kind === "job";
  const modalTitle = !modal
    ? ""
    : modal.kind === "job"
      ? `Rechnung gestellt für INT-${modal.job.job_number ?? "?"}`
      : `Beleg abgelegt — T-${modal.beleg.ticket_number}`;
  const modalIcon = isJobModal
    ? <Receipt className="h-5 w-5 text-blue-500" />
    : <FolderArchive className="h-5 w-5 text-blue-500" />;
  const fieldLabel = isJobModal ? "Rechnungsnummer" : "Ablage-Referenz";
  const fieldHint = isJobModal
    ? `Tippe nur den Nummern-Teil ein — "RE-" wird automatisch vorangestellt.`
    : `Tippe die Bexio-Beleg-Nummer / Ablage-Referenz ein — "BL-" wird automatisch vorangestellt.`;
  const fieldPrefix = isJobModal ? "RE-" : "BL-";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Abrechnung</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aufträge mit gestellter Rechnung und Belege als abgelegt markieren.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Linke Spalte — Auftraege */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Aufträge
              </h2>
              {jobs.length > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {jobs.length} offen
                </span>
              )}
            </div>
            {jobs.length === 0 ? (
              <EmptyState message="Alles abgerechnet." sub="Sobald ein Auftrag abgeschlossen wird, taucht er hier auf." />
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => (
                  <JobCard key={job.id} job={job} onMarkBilled={() => openJobModal(job)} canEdit={canEdit} />
                ))}
              </div>
            )}
          </div>

          {/* Rechte Spalte — Belege */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Belege
              </h2>
              {belege.length > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {belege.length} offen
                </span>
              )}
            </div>
            {belege.length === 0 ? (
              <EmptyState message="Alles abgelegt." sub="Sobald ein Beleg-Ticket erfasst wird, taucht es hier auf." />
            ) : (
              <div className="space-y-3">
                {belege.map((beleg) => (
                  <BelegCard key={beleg.id} beleg={beleg} onMarkFiled={() => openBelegModal(beleg)} canEdit={canEdit} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Modal
        open={modal !== null}
        onClose={closeModal}
        title={modalTitle}
        icon={modalIcon}
        size="md"
        closable={!submitting}
      >
        <div>
          <label className="text-sm font-medium">{fieldLabel}</label>
          <p className="text-xs text-muted-foreground mt-0.5 mb-2">{fieldHint}</p>
          {/* Prefix-im-Padding-Pattern, identisch zum INT-000000-Suchfeld auf /auftraege */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono text-muted-foreground/60 pointer-events-none">
              {fieldPrefix}
            </span>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="000000"
              autoFocus
              className="pl-[3rem] font-mono"
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
            disabled={submitting || !reference.trim()}
            className="kasten kasten-green flex-1"
          >
            {isJobModal ? <Receipt className="h-3.5 w-3.5" /> : <FolderArchive className="h-3.5 w-3.5" />}
            {submitting ? "Speichere…" : "Bestätigen"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

// =====================================================================
// EmptyState — pro Spalte
// =====================================================================

function EmptyState({ message, sub }: { message: string; sub: string }) {
  return (
    <Card className="bg-card">
      <CardContent className="p-8 text-center">
        <CheckCircle2 className="h-8 w-8 mx-auto text-green-500 mb-2" />
        <p className="font-medium text-sm">{message}</p>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// JobCard
// =====================================================================

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
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-semibold text-muted-foreground">
                INT-{String(job.job_number ?? "?").padStart(6, "0")}
              </span>
            </div>
            <h3 className="font-semibold text-sm">
              <Link href={`/auftraege/${job.id}`} className="hover:underline">{job.title}</Link>
            </h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
              {job.customer?.name && (
                <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{job.customer.name}</span>
              )}
              <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{dateRange}</span>
              {job.location?.name && (
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{job.location.name}</span>
              )}
            </div>
          </div>
          {canEdit && (
            <button type="button" onClick={onMarkBilled} className="kasten kasten-green shrink-0">
              <Receipt className="h-3.5 w-3.5" />
              Rechnung gestellt
            </button>
          )}
        </div>

        <div className="pt-3 border-t space-y-3">
          <div>
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <FileText className="h-3 w-3" />Arbeitsrapport
            </h4>
            {report ? (
              <div className="space-y-1.5 text-sm">
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
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <Clock className="h-3 w-3" />Stunden
            </h4>
            <div className="flex items-baseline gap-3 mb-1.5">
              <p className="text-xl font-bold tabular-nums">{formatHours(totalMinutes)}</p>
              {perUser.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Keine Stempelzeiten</p>
              )}
            </div>
            {perUser.length > 0 && (
              <div className="space-y-0.5 text-xs">
                {perUser.map((p) => (
                  <div key={p.name} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground truncate">{p.name}</span>
                    <span className="font-mono tabular-nums shrink-0">{formatHours(p.minutes)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// BelegCard
// =====================================================================

interface BelegCardProps {
  beleg: UnfiledBeleg;
  onMarkFiled: () => void;
  canEdit: boolean;
}

function BelegCard({ beleg, onMarkFiled, canEdit }: BelegCardProps) {
  const d = beleg.data;
  return (
    <Card className="bg-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-semibold text-muted-foreground">
                T-{beleg.ticket_number}
              </span>
              {beleg.status === "offen" && (
                <span className="inline-flex px-1.5 py-0 text-[10px] font-medium rounded-full bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-300">
                  Offen
                </span>
              )}
              {beleg.status === "erledigt" && (
                <span className="inline-flex px-1.5 py-0 text-[10px] font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300">
                  Genehmigt
                </span>
              )}
            </div>
            <h3 className="font-semibold text-sm">
              <Link href={`/tickets/${beleg.id}`} className="hover:underline">{beleg.title}</Link>
            </h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-mono font-semibold text-foreground">
                <Banknote className="h-3 w-3" />CHF {d.betrag_chf?.toFixed(2)}
              </span>
              {d.kaufdatum && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />{formatDate(d.kaufdatum)}
                </span>
              )}
              {d.lieferant && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3 w-3" />{d.lieferant}
                </span>
              )}
              {beleg.creator?.full_name && (
                <span className="inline-flex items-center gap-1">
                  <User className="h-3 w-3" />{beleg.creator.full_name}
                </span>
              )}
            </div>
          </div>
          {canEdit && (
            <button type="button" onClick={onMarkFiled} className="kasten kasten-green shrink-0">
              <FolderArchive className="h-3.5 w-3.5" />
              Beleg abgelegt
            </button>
          )}
        </div>

        {beleg.description && (
          <div className="pt-3 border-t">
            <p className="text-sm whitespace-pre-wrap">{beleg.description}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
