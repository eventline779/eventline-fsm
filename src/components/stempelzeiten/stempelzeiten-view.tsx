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

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePermissions } from "@/lib/use-permissions";
import { Card, CardContent } from "@/components/ui/card";
import {
  Briefcase, FileText, Clock, Calendar, Trash2,
  AlertTriangle, Moon,
} from "lucide-react";
import { useStempel, formatStempelDuration } from "@/lib/use-stempel";
import { useConfirm } from "@/components/ui/use-confirm";
import { SearchableSelect } from "@/components/searchable-select";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";
import { toast } from "sonner";
import { TOAST } from "@/lib/messages";
import {
  ZRH_TZ, localDateIso, todayLocalIso, weekdayForDateIso,
} from "@/lib/swiss-time";
import Link from "next/link";

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

interface NormalizedEntry {
  id: string;
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

function normalizeOwn(e: OwnEntry): NormalizedEntry {
  const dur = e.clock_out
    ? Math.max(0, Math.floor((new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime()) / 60000))
    : null;
  return {
    id: e.id,
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
  const { confirm, ConfirmModalElement } = useConfirm();
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showStempelTicket, setShowStempelTicket] = useState(false);
  const { can } = usePermissions();
  const [ownEntries, setOwnEntries] = useState<OwnEntry[]>([]);
  const [adminEntries, setAdminEntries] = useState<AdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // Admin-only: Wechsel zwischen eigener Sicht ("") und einem einzelnen
  // Mitarbeiter. Ersetzt den frueheren "Alle Mitarbeiter"-Toggle.
  const [filterUserId, setFilterUserId] = useState("");
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [now, setNow] = useState(() => Date.now());

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
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      setIsAdmin(profile?.role === "admin");
    })();
  }, [supabase]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data } = await supabase.rpc("get_assignable_users");
      setUsers((data as { id: string; full_name: string }[]) ?? []);
    })();
  }, [isAdmin, supabase]);

  // 30-Tage-Cutoff hart — kein UI-Umschalter. Aus dem Render heraus stabil.
  const fromIso = useMemo(
    () => addDaysIso(todayLocalIso(), -DEFAULT_RANGE_DAYS),
    [],
  );

  // Admin schaut auf einen anderen Mitarbeiter?
  const viewingOther = isAdmin && !!filterUserId && filterUserId !== currentUserId;

  const load = useCallback(async () => {
    setLoading(true);
    const fromTs = new Date(fromIso + "T00:00:00").toISOString();
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
  }, [supabase, viewingOther, currentUserId, filterUserId, fromIso]);

  useEffect(() => { load(); }, [load]);

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
    return viewingOther ? adminEntries.map(normalizeAdmin) : ownEntries.map(normalizeOwn);
  }, [viewingOther, adminEntries, ownEntries]);

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
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stempelzeiten</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {viewingOther ? (selectedUserLabel ?? "Fremd-Ansicht") : "Deine Einträge"} · letzte {DEFAULT_RANGE_DAYS} Tage
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {can("tickets:create") && (
            <button
              type="button"
              onClick={() => setShowStempelTicket(true)}
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
            <span className="font-mono text-lg font-semibold tabular-nums text-green-700 dark:text-green-400">
              {formatStempelDuration(active.clock_in, now)}
            </span>
          </CardContent>
        </Card>
      )}

      {/* KPI-Header (3 Kacheln) */}
      <KpiHeader kpi={kpi} />

      {/* Header-Zeile: Hinweistext links, Admin-User-Selector rechts */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Stempeleinträge der letzten {DEFAULT_RANGE_DAYS} Tage
        </p>
        {isAdmin && (
          <div className="w-full sm:w-56">
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

      {/* Body */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Card key={i} className="animate-pulse bg-card"><CardContent className="p-4 h-16" /></Card>)}</div>
      ) : normalized.length === 0 ? (
        <Card className="bg-card border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Clock className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg">Keine Einträge</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {viewingOther
                ? `${selectedUserLabel ?? "Diese Person"} hat in den letzten ${DEFAULT_RANGE_DAYS} Tagen nicht gestempelt.`
                : `Du hast in den letzten ${DEFAULT_RANGE_DAYS} Tagen nicht gestempelt.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <GroupedList entries={normalized} now={now} onDelete={deleteEntry} />
      )}

      {ConfirmModalElement}

      <NewTicketModal
        open={showStempelTicket}
        onClose={() => setShowStempelTicket(false)}
        onCreated={() => {
          setShowStempelTicket(false);
          toast.success("Ticket erstellt — Admin wurde benachrichtigt");
        }}
        initialType="stempel_aenderung"
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

// ------------------ Grouped List ------------------

function GroupedList({
  entries, now, onDelete,
}: {
  entries: NormalizedEntry[];
  now: number;
  onDelete: (id: string) => void;
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
                <EntryCard key={e.id} entry={e} anomaly={detectAnomaly(e, now)} onDelete={() => onDelete(e.id)} />
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
  entry, anomaly, onDelete,
}: {
  entry: NormalizedEntry;
  anomaly: Anomaly;
  onDelete: () => void;
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
