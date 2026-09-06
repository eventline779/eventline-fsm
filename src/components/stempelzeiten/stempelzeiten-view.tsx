"use client";

/**
 * Stempelzeiten-Portal (vereinfacht — 2026-09-02).
 *
 * Zeigt die eigenen Stempeleintraege der letzten 30 Tage als flache, nach
 * Tag gruppierte Liste — kein Datums-Picker, keine Quick-Chips, kein
 * Heatmap-/Pivot-Toggle, kein Anomalien-Only-Filter mehr. Anomalien
 * (lange Schicht > 10h, Mitternacht-Uebergang, vergessener Stempel-Out
 * > 18h) erscheinen als kleine Chips pro Zeile.
 *
 * KPIs oben (3 Kacheln): Diese Woche / Dieser Monat / Ø pro Arbeitstag Monat.
 * "Heute" faellt weg — steht ohnehin ganz oben in der Liste.
 *
 * Admin-Sicht: SearchableSelect oben rechts. Standard = leer = eigene Sicht.
 * Beim Waehlen eines Mitarbeiters werden dessen Eintraege via admin-only-RPC
 * `get_all_time_entries` (SECURITY DEFINER) geladen. Der frueheren "Alle
 * Mitarbeiter"-Toggle entfaellt bewusst: eine gemischte Liste ist beim
 * schnellen Ueberblick meist verwirrender als hilfreich.
 *
 * DST-Safety: KPI-Tages-Buckets via per-Minute-Bucketize (Europe/Zurich),
 * damit Nacht-Schichten korrekt auf zwei Tage verteilt werden. Die
 * Listen-Gruppierung selbst haengt die volle Schicht ans clock_in-Datum.
 */

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePermissions } from "@/lib/use-permissions";
import { Card, CardContent } from "@/components/ui/card";
import {
  Briefcase, FileText, Clock, Calendar, Trash2,
  AlertTriangle, Moon, Search, X, Users, Edit3,
} from "lucide-react";
import { useStempel, formatStempelDuration } from "@/lib/use-stempel";
import { useConfirm } from "@/components/ui/use-confirm";
import { SearchableSelect } from "@/components/searchable-select";
import { Input } from "@/components/ui/input";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";
import { JobNumber } from "@/components/job-number";
import { toast } from "sonner";
import { TOAST } from "@/lib/messages";
import {
  ZRH_TZ, localDateIso, todayLocalIso, weekdayForDateIso,
} from "@/lib/swiss-time";
import Link from "next/link";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { BackButton } from "@/components/ui/back-button";

interface AdminEntry {
  id: string;
  user_id: string;
  user_name: string;
  job_id: string | null;
  job_number: number | null;
  job_title: string | null;
  clock_in: string;
  clock_out: string | null;
  description: string | null;
  notes: string | null;
  duration_minutes: number | null;
}

interface OwnEntry {
  id: string;
  job_id: string | null;
  clock_in: string;
  clock_out: string | null;
  description: string | null;
  notes: string | null;
  job: { job_number: number; title: string } | null;
}

/** Payload fuer den Row-"Korrigieren"-Button — wandert 1:1 in
 *  NewTicketModal.initialData rein und belegt das Stempel-Form vor. */
interface CorrectPayload {
  timeEntryId: string;
  clockIn: string;
  clockOut: string | null;
  jobId: string | null;
}

/** Ergebniszeile fuer den Auftragsnummer-Filter (Join zu profiles). */
interface JobFilterEntry {
  id: string;
  user_id: string;
  job_id: string | null;
  clock_in: string;
  clock_out: string | null;
  description: string | null;
  notes: string | null;
  user: { full_name: string | null } | null;
}

/** Header-Info fuer den gefundenen Auftrag beim Auftragsnummer-Filter. */
interface JobFilterHeader {
  id: string;
  job_number: number;
  title: string;
  customer: { name: string } | null;
}

interface NormalizedEntry {
  id: string;
  /** user_id des Eintrag-Owners — wird gebraucht um zu entscheiden, ob der
   *  Row-"Korrigieren"-Button gezeigt wird (nur eigene Eintraege). */
  userId: string | null;
  userName: string | null;
  jobId: string | null;
  jobLabel: string | null;
  jobHref: string | null;
  description: string | null;
  clockIn: string;
  clockOut: string | null;
  durationMinutes: number | null;
}

/** Range-Fenster in Tagen — hart. Wer weiter zurueck schauen will, nutzt
 *  die Lohn-Monatsstunden oder /hr?tab=loehne. */
const DEFAULT_RANGE_DAYS = 30;

function pad2(n: number): string { return String(n).padStart(2, "0"); }

function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-CH", {
    timeZone: ZRH_TZ,
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("de-CH", {
    timeZone: ZRH_TZ, weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}

/** ISO-Wochen-Start: Montag der Woche fuer ein YYYY-MM-DD. */
function isoWeekStart(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const wd = date.getUTCDay(); // 0=Sun
  const mondayOffset = wd === 0 ? -6 : 1 - wd;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function monthFirstIso(iso: string): string {
  const [y, m] = iso.split("-");
  return `${y}-${m}-01`;
}
function monthLastIso(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${y}-${pad2(m)}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}

function normalizeAdmin(e: AdminEntry): NormalizedEntry {
  return {
    id: e.id,
    userId: e.user_id,
    userName: e.user_name,
    jobId: e.job_id,
    jobLabel: e.job_id && e.job_number ? `INT-${e.job_number} · ${e.job_title}` : null,
    jobHref: e.job_id ? `/auftraege/${e.job_id}` : null,
    description: e.description,
    clockIn: e.clock_in,
    clockOut: e.clock_out,
    durationMinutes: e.duration_minutes,
  };
}

function normalizeOwn(e: OwnEntry, currentUserId: string | null): NormalizedEntry {
  const dur = e.clock_out
    ? Math.max(0, Math.floor((new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime()) / 60000))
    : null;
  return {
    id: e.id,
    userId: currentUserId, // eigene Sicht -> per Definition der eingeloggte User
    userName: null,
    jobId: e.job_id,
    jobLabel: e.job_id && e.job ? `INT-${e.job.job_number} · ${e.job.title}` : null,
    jobHref: e.job_id ? `/auftraege/${e.job_id}` : null,
    description: e.description,
    clockIn: e.clock_in,
    clockOut: e.clock_out,
    durationMinutes: dur,
  };
}

/** Auftragsnummer-Filter: Job-Header ist bereits im State — pro Zeile braucht
 *  es keine Job-Info nochmal. userName kommt aus dem profiles-Join. */
function normalizeJobFilter(e: JobFilterEntry, jobHeader: JobFilterHeader): NormalizedEntry {
  const dur = e.clock_out
    ? Math.max(0, Math.floor((new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime()) / 60000))
    : null;
  return {
    id: e.id,
    userId: e.user_id,
    userName: e.user?.full_name ?? "Unbekannt",
    jobId: e.job_id,
    jobLabel: `INT-${jobHeader.job_number} · ${jobHeader.title}`,
    jobHref: e.job_id ? `/auftraege/${e.job_id}` : null,
    description: e.description,
    clockIn: e.clock_in,
    clockOut: e.clock_out,
    durationMinutes: dur,
  };
}

/** Nutzer-Eingabe "INT-26268", "int 26268", "26268" → geparste int oder null.
 *  int4-Schutz (>2^31-1) fuer versehentliche Telefonnummer-Eingaben. */
function parseJobNumber(raw: string): number | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 2147483647) return null; // int4-Overflow-Guard
  return n;
}

interface Anomaly {
  longShift: boolean;
  crossesMidnight: boolean;
  forgotten: boolean;
}
function detectAnomaly(e: NormalizedEntry, nowMs: number): Anomaly {
  const longShift = e.durationMinutes !== null && e.durationMinutes > 10 * 60;
  const crossesMidnight = !!e.clockOut && localDateIso(new Date(e.clockIn)) !== localDateIso(new Date(e.clockOut));
  const forgotten = !e.clockOut && (nowMs - new Date(e.clockIn).getTime()) > 18 * 60 * 60 * 1000;
  return { longShift, crossesMidnight, forgotten };
}

/** 1-2 Initialen aus einem Namen ("Mathis Berger" -> "MB"). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stabile HSL-Farbe pro Name (gleicher Name -> gleiche Farbe). */
function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 45%)`;
}

interface DayBucket {
  date: string;
  totalMin: number;
}

/** Verteilt eine Liste Eintraege per-Minute auf Lokal-Datums-Buckets fuer
 *  die KPIs — splittet auch Mitternacht-Uebergaenge korrekt (DST-safe). */
function buildDayBuckets(entries: NormalizedEntry[]): Map<string, DayBucket> {
  const out = new Map<string, DayBucket>();
  for (const e of entries) {
    if (!e.clockOut) continue;
    const start = new Date(e.clockIn).getTime();
    const end = new Date(e.clockOut).getTime();
    if (end <= start) continue;
    for (let t = start; t < end; t += 60_000) {
      const date = localDateIso(new Date(t));
      let b = out.get(date);
      if (!b) {
        b = { date, totalMin: 0 };
        out.set(date, b);
      }
      b.totalMin++;
    }
  }
  return out;
}

/**
 * Wiederverwendbare Stempelzeiten-View. Wird sowohl von /hr?tab=stempelzeiten
 * als auch vom /stempelzeiten-Deep-Link-Wrapper gerendert.
 */
export function StempelzeitenView() {
  const supabase = createClient();
  const { active } = useStempel();
  // Deep-Link-Route /stempelzeiten kann via Dashboard aufgerufen werden
  // (?from=dashboard). In /hr eingebettet regelt der HR-Header den Zurueck-
  // Pfeil — hier dann keinen zusaetzlichen zeigen (sonst 2 Pfeile).
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const showBackButton =
    pathname === "/stempelzeiten" && searchParams.get("from") === "dashboard";
  const { confirm, ConfirmModalElement } = useConfirm();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showStempelTicket, setShowStempelTicket] = useState(false);
  /** Inline-Context: Payload fuer den Row-"Korrigieren"-Button (oder den
   *  "Vergessen auszustempeln?"-Link im Aktiv-Banner). Ist gesetzt →
   *  Modal oeffnet mit vorbelegten Feldern; null → normaler Fallback-
   *  Aufruf (leeres Form). */
  const [correctPayload, setCorrectPayload] = useState<CorrectPayload | null>(null);
  const { can } = usePermissions();
  // "Fremd-Sicht" (Admin-Selector + andere MA laden) gated ueber Permission,
  // nicht ueber die admin-Rolle direkt — so kann HR/Team-Leitung ebenfalls
  // per Rechte-Matrix Zugriff bekommen ohne Voll-Admin zu sein.
  const canSeeAll = can("stempelzeiten:see-all");
  const [ownEntries, setOwnEntries] = useState<OwnEntry[]>([]);
  const [adminEntries, setAdminEntries] = useState<AdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // Admin-only: Wechsel zwischen eigener Sicht ("") und einem einzelnen
  // Mitarbeiter. Ersetzt den frueheren "Alle Mitarbeiter"-Toggle.
  const [filterUserId, setFilterUserId] = useState("");
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [now, setNow] = useState(() => Date.now());

  // Auftragsnummer-Filter (URL-persistent via ?auftrag=XXXXX). Der Text im
  // Input ist entkoppelt vom "committeten" Filter — Live-Suche mit 300ms
  // Debounce (Enter committed sofort). Wenn gesetzt, zeigt die Ansicht alle
  // time_entries auf diesem Auftrag (RLS filtert fuer Nicht-Admins auf eigene).
  const [jobFilterInput, setJobFilterInput] = useState<string>(
    () => searchParams.get("auftrag") ?? "",
  );
  const [jobFilterNumber, setJobFilterNumber] = useState<number | null>(
    () => parseJobNumber(searchParams.get("auftrag") ?? ""),
  );
  const [jobFilterHeader, setJobFilterHeader] = useState<JobFilterHeader | null>(null);
  const [jobFilterEntries, setJobFilterEntries] = useState<JobFilterEntry[]>([]);
  const [jobLookupState, setJobLookupState] = useState<"idle" | "loading" | "not_found">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobFilterActive = jobFilterNumber !== null;

  // Live-Tick nur wenn aktiv eingestempelt (fuer laufende Zeit-Anzeige).
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);
    })();
  }, [supabase]);

  useEffect(() => {
    if (!canSeeAll) return;
    (async () => {
      const { data } = await supabase.rpc("get_assignable_users");
      setUsers((data as { id: string; full_name: string }[]) ?? []);
    })();
  }, [canSeeAll, supabase]);

  // 30-Tage-Cutoff hart — kein UI-Umschalter. Aus dem Render heraus stabil.
  const fromIso = useMemo(
    () => addDaysIso(todayLocalIso(), -DEFAULT_RANGE_DAYS),
    [],
  );

  // Admin schaut auf einen anderen Mitarbeiter?
  const viewingOther = canSeeAll && !!filterUserId && filterUserId !== currentUserId;

  const load = useCallback(async () => {
    setLoading(true);
    const fromTs = new Date(fromIso + "T00:00:00").toISOString();

    // Auftragsnummer-Filter aktiv → eigenstaendiger Pfad. Kein 30-Tage-
    // Cutoff (der Sinn ist "alles was auf diesem Auftrag gestempelt wurde").
    if (jobFilterActive && jobFilterNumber !== null) {
      setJobLookupState("loading");
      // 1) Auftrag per job_number aufloesen. maybeSingle → null wenn nicht da.
      const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select("id, job_number, title, customer:customers(name)")
        .eq("job_number", jobFilterNumber)
        .maybeSingle();
      if (jobErr) TOAST.supabaseError(jobErr, "Auftrag konnte nicht geladen werden");
      const jobHeader = (job as unknown as JobFilterHeader | null) ?? null;
      setJobFilterHeader(jobHeader);
      if (!jobHeader) {
        setJobFilterEntries([]);
        setJobLookupState("not_found");
        setOwnEntries([]);
        setAdminEntries([]);
        setLoading(false);
        return;
      }
      setJobLookupState("idle");
      // 2) Alle time_entries fuer diesen Auftrag. RLS: Admins sehen alle,
      //    Nicht-Admins nur eigene (per time_entries_select_own-Policy).
      const { data, error } = await supabase
        .from("time_entries")
        .select("id, user_id, job_id, clock_in, clock_out, description, notes, user:profiles(full_name)")
        .eq("job_id", jobHeader.id)
        .order("clock_in", { ascending: false });
      if (error) TOAST.supabaseError(error, "Stempel-Eintraege konnten nicht geladen werden");
      setJobFilterEntries((data as unknown as JobFilterEntry[]) ?? []);
      setOwnEntries([]);
      setAdminEntries([]);
      setLoading(false);
      return;
    }

    // Kein Auftrags-Filter → bestehende Logik (Eigene Sicht bzw. Admin-Fremdsicht).
    setJobFilterHeader(null);
    setJobFilterEntries([]);
    setJobLookupState("idle");

    if (viewingOther) {
      const { data, error } = await supabase.rpc("get_all_time_entries", {
        filter_user_id: filterUserId,
        filter_from: fromTs,
        filter_to: null,
      });
      if (error) TOAST.supabaseError(error, "Stempel-Eintraege konnten nicht geladen werden");
      setAdminEntries((data as AdminEntry[]) ?? []);
      setOwnEntries([]);
    } else {
      // RLS-Bug-Schutz: Admins haetten via RLS-Policy Zugriff auf ALLE
      // time_entries — ohne expliziten user_id-Filter zeigt "Eigene Sicht"
      // auch fremde Eintraege. Daher hier zwingend nach currentUserId
      // filtern. Wenn currentUserId noch nicht geladen, kein Query.
      if (!currentUserId) { setLoading(false); return; }
      const { data } = await supabase
        .from("time_entries")
        .select("id, job_id, clock_in, clock_out, description, notes, job:jobs(job_number, title)")
        .eq("user_id", currentUserId)
        .gte("clock_in", fromTs)
        .order("clock_in", { ascending: false });
      setOwnEntries((data as unknown as OwnEntry[]) ?? []);
      setAdminEntries([]);
    }
    setLoading(false);
  }, [supabase, viewingOther, currentUserId, filterUserId, fromIso, jobFilterActive, jobFilterNumber]);

  useEffect(() => { load(); }, [load]);

  // Auftragsnummer-Filter mit URL sync + Debounce. Der Input triggert erst nach
  // 300ms den commit-State (der wiederum die Query aufloest) — plus schreibt
  // ?auftrag=... in die URL fuer Reload-Persist + Teilbarkeit. Leerer Input
  // → param loeschen. Andere URL-Params (z.B. tab=stempelzeiten im HR-Hub)
  // bleiben erhalten.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const parsed = parseJobNumber(jobFilterInput);
      setJobFilterNumber(parsed);
      const params = new URLSearchParams(searchParams.toString());
      if (parsed !== null) {
        params.set("auftrag", String(parsed));
      } else {
        params.delete("auftrag");
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // searchParams/pathname bewusst NICHT im dep-array: sonst Loop wenn wir
    // die URL selbst rewriten. Sie werden nur beim Aendern des Inputs gelesen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobFilterInput]);

  /** Oeffnet das Ticket-Modal fuer eine Stempel-Korrektur mit vorbelegten
   *  Feldern. Kombi aus: Payload merken + Modal aufmachen. `payload` kann null
   *  sein — dann ist es der Fallback ohne Prefill (klassischer Top-Button). */
  const openCorrect = useCallback((payload: CorrectPayload | null) => {
    setCorrectPayload(payload);
    setShowStempelTicket(true);
  }, []);

  async function deleteEntry(id: string) {
    const ok = await confirm({
      title: "Eintrag löschen?",
      message: "Der Stempel-Eintrag wird unwiderruflich entfernt.",
      confirmLabel: "Löschen",
      variant: "red",
    });
    if (!ok) return;
    const { error } = await supabase.from("time_entries").delete().eq("id", id);
    if (error) {
      TOAST.supabaseError(error, "Eintrag konnte nicht gelöscht werden");
      return;
    }
    toast.success("Eintrag gelöscht");
    load();
  }

  const normalized: NormalizedEntry[] = useMemo(() => {
    if (jobFilterActive) {
      if (!jobFilterHeader) return [];
      return jobFilterEntries.map((e) => normalizeJobFilter(e, jobFilterHeader));
    }
    return viewingOther ? adminEntries.map(normalizeAdmin) : ownEntries.map((e) => normalizeOwn(e, currentUserId));
  }, [jobFilterActive, jobFilterHeader, jobFilterEntries, viewingOther, adminEntries, ownEntries, currentUserId]);

  // Aggregat fuer den Auftrags-Header: Total-Minuten + Anzahl unique
  // Mitarbeiter, die auf dem Auftrag gestempelt haben.
  const jobFilterSummary = useMemo(() => {
    if (!jobFilterActive) return { totalMin: 0, userCount: 0 };
    let total = 0;
    const users = new Set<string>();
    for (const e of jobFilterEntries) {
      users.add(e.user_id);
      if (e.clock_out) {
        total += Math.max(
          0,
          Math.floor((new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime()) / 60000),
        );
      }
    }
    return { totalMin: total, userCount: users.size };
  }, [jobFilterActive, jobFilterEntries]);

  const dayBuckets = useMemo(() => buildDayBuckets(normalized), [normalized]);

  // KPI: Diese Woche / Dieser Monat / Ø pro Arbeitstag im Monat.
  // "Heute" faellt bewusst weg — steht ohnehin in der Liste ganz oben.
  const kpi = useMemo(() => {
    const today = todayLocalIso();
    const weekStart = isoWeekStart(today);
    const weekEnd = addDaysIso(weekStart, 6);
    const monthFirst = monthFirstIso(today);
    const monthLast = monthLastIso(today);
    let weekMin = 0, monthMin = 0;
    const daysWithEntries = new Set<string>();
    for (const [date, b] of dayBuckets) {
      if (date >= weekStart && date <= weekEnd) weekMin += b.totalMin;
      if (date >= monthFirst && date <= monthLast) {
        monthMin += b.totalMin;
        daysWithEntries.add(date);
      }
    }
    const avgPerDay = daysWithEntries.size > 0 ? Math.round(monthMin / daysWithEntries.size) : 0;
    return { weekMin, monthMin, avgPerDay, daysWorked: daysWithEntries.size };
  }, [dayBuckets]);

  const selectedUserLabel = users.find((u) => u.id === filterUserId)?.full_name;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 min-h-9">
        <div className="flex items-center gap-3 min-w-0">
          {showBackButton && <BackButton fallbackHref="/dashboard" />}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Stempelzeiten</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {jobFilterActive
                ? (jobFilterHeader
                    ? `Auftrag INT-${jobFilterHeader.job_number} · alle Stempeleinträge`
                    : `Auftragsnummer INT-${jobFilterNumber}`)
                : `${viewingOther ? (selectedUserLabel ?? "Fremd-Ansicht") : "Deine Einträge"} · letzte ${DEFAULT_RANGE_DAYS} Tage`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {can("tickets:create") && (
            <button
              type="button"
              onClick={() => openCorrect(null)}
              className="kasten kasten-green"
              data-tooltip="Stempel-Aenderung anfragen"
            >
              <Clock className="h-3.5 w-3.5" />
              Stempel-Änderung
            </button>
          )}
        </div>
      </div>

      {/* Aktiver Eintrag-Banner */}
      {active && (
        <Card className="bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30">
          <CardContent className="p-4 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-green-700 dark:text-green-400">Aktuell eingestempelt</p>
                <p className="text-sm font-medium">
                  {active.job_id ? "Auf einem Auftrag" : (active.description || "Andere Arbeit")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Inline-Context: falls dieser laufende Stempel-In eigentlich
                  laengst haette out-gestempelt werden sollen — 1-Klick-Weg
                  ins Ticket-Formular mit vorbelegtem time_entry + Start-Zeit.
                  User tippt nur noch die Endzeit + den Grund. */}
              {can("tickets:create") && (
                <button
                  type="button"
                  onClick={() => openCorrect({
                    timeEntryId: active.id,
                    clockIn: active.clock_in,
                    clockOut: null,
                    jobId: active.job_id ?? null,
                  })}
                  className="text-xs font-medium text-green-700 dark:text-green-400 underline underline-offset-2 hover:text-green-800 dark:hover:text-green-300"
                  data-tooltip="Ticket mit vorbelegten Zeiten oeffnen"
                >
                  Vergessen auszustempeln?
                </button>
              )}
              <span className="font-mono text-lg font-semibold tabular-nums text-green-700 dark:text-green-400">
                {formatStempelDuration(active.clock_in, now)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI-Header (3 Kacheln) — bei aktivem Auftrags-Filter verstecken,
          weil "Diese Woche/Monat" auf einen einzelnen Auftrag keinen Sinn ergibt.
          Stattdessen erscheint der Auftrags-Header (siehe unten). */}
      {!jobFilterActive && <KpiHeader kpi={kpi} />}

      {/* Filter-Zeile: Auftragsnummer-Suche + (Admin) Mitarbeiter-Selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Auftragsnummer-Filter — 1:1 wie im /auftraege-Filter (fixes "INT-"-Prefix
            als absolute span + shadcn Input, digits-only), fuer app-weite Konsistenz. */}
        <div className="relative w-full sm:w-44">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono text-muted-foreground/60 pointer-events-none">
            INT-
          </span>
          <Input
            placeholder="00000"
            value={jobFilterInput}
            onChange={(e) => setJobFilterInput(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (debounceRef.current) clearTimeout(debounceRef.current);
                const parsed = parseJobNumber(jobFilterInput);
                setJobFilterNumber(parsed);
                const params = new URLSearchParams(searchParams.toString());
                if (parsed !== null) params.set("auftrag", String(parsed));
                else params.delete("auftrag");
                const qs = params.toString();
                router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
                e.preventDefault();
              }
              if (e.key === "Escape" && jobFilterInput) {
                setJobFilterInput("");
                e.preventDefault();
              }
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            className="pl-[3rem] h-9 font-mono"
            aria-label="Auftragsnummer"
          />
        </div>

        {/* Hinweistext (wenn kein Auftrags-Filter) — schiebt Selector nach rechts */}
        {!jobFilterActive && (
          <p className="text-xs text-muted-foreground hidden md:block ml-auto">
            Stempeleinträge der letzten {DEFAULT_RANGE_DAYS} Tage
          </p>
        )}

        {/* Admin-Selector — bei Auftrags-Filter ausgeblendet (die Ansicht zeigt
            bewusst ALLE MA auf dem Auftrag; ein zusaetzlicher MA-Filter wuerde
            das Bild reduzieren, ohne Mehrwert fuer den Anwendungsfall). */}
        {canSeeAll && !jobFilterActive && (
          <div className="w-full sm:w-56 sm:ml-2">
            <SearchableSelect
              value={filterUserId}
              onChange={setFilterUserId}
              placeholder="Eigene Sicht"
              items={users.map((u) => ({ id: u.id, label: u.full_name }))}
              active={viewingOther}
              clearable
            />
          </div>
        )}
      </div>

      {/* Auftrags-Header — bei aktivem Auftrags-Filter + gefundenem Auftrag */}
      {jobFilterActive && jobFilterHeader && !loading && (
        <JobFilterSummaryCard
          job={jobFilterHeader}
          totalMin={jobFilterSummary.totalMin}
          userCount={jobFilterSummary.userCount}
          entryCount={jobFilterEntries.length}
        />
      )}

      {/* Body */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Card key={i} className="animate-pulse bg-card"><CardContent className="p-4 h-16" /></Card>)}</div>
      ) : jobFilterActive && jobLookupState === "not_found" ? (
        <Card className="bg-card border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Search className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg">Kein Auftrag gefunden</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Es gibt keinen Auftrag mit Nummer INT-{jobFilterNumber}.
            </p>
          </CardContent>
        </Card>
      ) : normalized.length === 0 ? (
        <Card className="bg-card border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Clock className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg">Keine Einträge</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {jobFilterActive
                ? `Auf INT-${jobFilterNumber} wurde bisher nicht gestempelt.`
                : viewingOther
                  ? `${selectedUserLabel ?? "Diese Person"} hat in den letzten ${DEFAULT_RANGE_DAYS} Tagen nicht gestempelt.`
                  : `Du hast in den letzten ${DEFAULT_RANGE_DAYS} Tagen nicht gestempelt.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <GroupedList
          entries={normalized}
          now={now}
          currentUserId={currentUserId}
          canCreateTicket={can("tickets:create")}
          onDelete={deleteEntry}
          onCorrect={openCorrect}
        />
      )}

      {ConfirmModalElement}

      <NewTicketModal
        open={showStempelTicket}
        onClose={() => { setShowStempelTicket(false); setCorrectPayload(null); }}
        onCreated={() => {
          setShowStempelTicket(false);
          setCorrectPayload(null);
          toast.success("Ticket erstellt — Admin wurde benachrichtigt");
        }}
        initialType="stempel_aenderung"
        initialData={correctPayload ? {
          timeEntryId: correctPayload.timeEntryId,
          clockIn: correctPayload.clockIn,
          clockOut: correctPayload.clockOut,
          jobId: correctPayload.jobId,
        } : undefined}
      />
    </div>
  );
}

// ------------------ KPI-Header ------------------

interface KpiData {
  weekMin: number;
  monthMin: number;
  avgPerDay: number;
  daysWorked: number;
}
function KpiHeader({ kpi }: { kpi: KpiData }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <KpiCard label="Diese Woche" value={formatDuration(kpi.weekMin)} />
      <KpiCard
        label="Dieser Monat"
        value={formatDuration(kpi.monthMin)}
        sub={`${kpi.daysWorked} ${kpi.daysWorked === 1 ? "Arbeitstag" : "Arbeitstage"}`}
      />
      <KpiCard
        label="Ø pro Arbeitstag"
        value={formatDuration(kpi.avgPerDay)}
        sub="im aktuellen Monat"
      />
    </div>
  );
}
function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="bg-card">
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <p className="text-xl font-bold tabular-nums mt-0.5">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ------------------ Auftrags-Header (Summary) ------------------

/**
 * Kopf-Karte fuer den Auftragsnummer-Filter:
 * INT-XX · Titel · Kunde · Total-Stunden · Anzahl MA · Anzahl Eintraege.
 * Bewusst kompakt, single-row auf Desktop. Klick auf INT-Pill fuehrt in den
 * Auftrag rein.
 */
function JobFilterSummaryCard({
  job, totalMin, userCount, entryCount,
}: {
  job: JobFilterHeader;
  totalMin: number;
  userCount: number;
  entryCount: number;
}) {
  return (
    <Card className="bg-card border-red-200 dark:border-red-500/30">
      <CardContent className="p-3 sm:p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-md bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
            <Briefcase className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/auftraege/${job.id}`}
                className="hover:opacity-80 transition-opacity"
                data-tooltip="Auftrag öffnen"
              >
                <JobNumber number={job.job_number} size="md" />
              </Link>
              <span className="font-semibold text-sm truncate">{job.title}</span>
            </div>
            {job.customer?.name && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {job.customer.name}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 sm:gap-6 sm:ml-auto tabular-nums">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total</span>
            <span className="text-lg font-bold">{formatDuration(totalMin)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
              <Users className="h-2.5 w-2.5" />Mitarbeiter
            </span>
            <span className="text-lg font-bold">{userCount}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Einträge</span>
            <span className="text-lg font-bold">{entryCount}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------ Grouped List ------------------

function GroupedList({
  entries, now, currentUserId, canCreateTicket, onDelete, onCorrect,
}: {
  entries: NormalizedEntry[];
  now: number;
  currentUserId: string | null;
  canCreateTicket: boolean;
  onDelete: (id: string) => void;
  onCorrect: (payload: CorrectPayload) => void;
}) {
  // Gruppieren nach clock_in.localDate. Sortiert: neueste Tage zuerst.
  const groups = useMemo(() => {
    const map = new Map<string, NormalizedEntry[]>();
    for (const e of entries) {
      const d = localDateIso(new Date(e.clockIn));
      const arr = map.get(d) ?? [];
      arr.push(e);
      map.set(d, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  return (
    <div className="space-y-4">
      {groups.map(([date, list]) => {
        const total = list.reduce((s, e) => s + (e.durationMinutes ?? 0), 0);
        const wd = weekdayForDateIso(date);
        const isWeekend = wd === 0 || wd === 6;
        return (
          <div key={date}>
            <div className={`flex items-center justify-between gap-2 mb-2 sticky top-0 z-10 bg-background/95 backdrop-blur py-1 border-b ${isWeekend ? "border-amber-200 dark:border-amber-500/30" : "border-border"}`}>
              <div className="flex items-center gap-2">
                <Calendar className={`h-3.5 w-3.5 ${isWeekend ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`} />
                <span className="text-xs font-semibold uppercase tracking-wider">{formatLongDate(date)}</span>
                {isWeekend && <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Wochenende</span>}
              </div>
              <span className="text-xs font-bold tabular-nums">{formatDuration(total)}</span>
            </div>
            <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
              {list.map((e) => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  anomaly={detectAnomaly(e, now)}
                  isOwn={!!currentUserId && e.userId === currentUserId}
                  canCreateTicket={canCreateTicket}
                  onDelete={() => onDelete(e.id)}
                  onCorrect={() => onCorrect({
                    timeEntryId: e.id,
                    clockIn: e.clockIn,
                    clockOut: e.clockOut,
                    jobId: e.jobId,
                  })}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------ Entry-Card (mit Anomalien-Chips inline) ------------------

function EntryCard({
  entry, anomaly, isOwn, canCreateTicket, onDelete, onCorrect,
}: {
  entry: NormalizedEntry;
  anomaly: Anomaly;
  /** True wenn dieser Eintrag dem eingeloggten User gehoert — nur dann darf
   *  der Row-"Korrigieren"-Button erscheinen (Ticket-Erstellung fuer fremde
   *  Eintraege macht keinen Sinn, das Ticket landet immer auf created_by). */
  isOwn: boolean;
  canCreateTicket: boolean;
  onDelete: () => void;
  onCorrect: () => void;
}) {
  const isRunning = !entry.clockOut;
  return (
    <div className="px-3 py-2 flex items-center gap-2.5 hover:bg-foreground/[0.03] dark:hover:bg-foreground/[0.05] transition-colors">
      {entry.userName ? (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white"
          style={{ backgroundColor: colorForName(entry.userName) }}
          data-tooltip={entry.userName}
        >
          {initials(entry.userName)}
        </div>
      ) : (
        <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
          entry.jobLabel ? "bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400"
                         : "bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400"
        }`}>
          {entry.jobLabel ? <Briefcase className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {entry.userName && (
            <span className="text-xs font-bold shrink-0" style={{ color: colorForName(entry.userName) }}>
              {entry.userName}
            </span>
          )}
          {entry.jobLabel ? (
              entry.jobHref ? (
                <Link href={entry.jobHref} className="font-medium text-sm hover:underline truncate">{entry.jobLabel}</Link>
              ) : (
                <span className="font-medium text-sm truncate">{entry.jobLabel}</span>
              )
            ) : (
              <span className="font-medium text-sm truncate">{entry.description || "Andere Arbeit"}</span>
            )}
          {isRunning && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0 text-[10px] font-semibold rounded-full bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />Läuft
            </span>
          )}
          {anomaly.longShift && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 shrink-0" data-tooltip="Schicht ueber 10 Stunden">
              <AlertTriangle className="h-2.5 w-2.5" />Lang
            </span>
          )}
          {anomaly.crossesMidnight && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0 text-[10px] font-semibold rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 shrink-0" data-tooltip="Geht ueber Mitternacht">
              <Moon className="h-2.5 w-2.5" />Nacht
            </span>
          )}
          {anomaly.forgotten && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0 text-[10px] font-semibold rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 shrink-0" data-tooltip="Kein Stempel-Out seit >18h — vermutlich vergessen">
              <AlertTriangle className="h-2.5 w-2.5" />Vergessen?
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground tabular-nums truncate">
          {formatDateTime(entry.clockIn)}{entry.clockOut ? ` – ${formatDateTime(entry.clockOut)}` : ""}
          {entry.jobLabel && entry.description ? <span className="ml-2 italic">· {entry.description}</span> : null}
        </p>
      </div>
      <span className="font-mono font-semibold text-sm tabular-nums shrink-0">
        {entry.durationMinutes !== null ? formatDuration(entry.durationMinutes) : "läuft…"}
      </span>
      {/* Row-"Korrigieren" — Inline-Context, oeffnet Stempel-Aenderungs-Ticket
          mit vorbelegtem time_entry + Start + Ende. Nur bei eigenen Eintraegen
          (fremde Korrekturen sind nicht Sinn der Sache), nur wenn User Rechte
          fuer Ticket-Erstellung hat. */}
      {isOwn && canCreateTicket && (
        <button
          type="button"
          onClick={onCorrect}
          className="p-1 rounded text-muted-foreground/40 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10 transition-colors shrink-0"
          aria-label="Eintrag korrigieren"
          data-tooltip="Korrigieren — Ticket mit vorbelegten Zeiten oeffnen"
        >
          <Edit3 className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="p-1 rounded text-muted-foreground/40 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0"
        aria-label="Eintrag löschen"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
