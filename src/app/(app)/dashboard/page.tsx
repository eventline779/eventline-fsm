"use client";

/**
 * Dashboard ("Heute") — Einstiegs-Page nach Login.
 *
 * Zeigt dem User die wichtigsten "was jetzt"-Infos auf einen Blick:
 *   - Termine heute (mit Auftrag-Bezug)
 *   - Offene eigene Todos (priorisiert)
 *   - Eigene offene Tickets (IT/Beleg/Stempel/Material)
 *   - Schnellzugriff zu Stempel + Kalender
 *
 * Vorher war die Page leer ("Inhalt komplett entfernt; Re-Build kann
 * hier neue Widgets hinzufuegen") — User landete in einer leeren Halle.
 *
 * Architektur: alles client-seitig via createClient(). RLS-Policies
 * sorgen dafuer dass jeder User nur seine eigenen Daten sieht — Admin
 * sieht trotzdem alles via has_permission().
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import {
  Calendar, CheckSquare, Ticket, ArrowRight, AlertCircle, Clock, Briefcase, FileEdit,
  Sparkles, Users, Receipt, PenLine, PlaneTakeoff, Wallet, ClockAlert, FilePlus,
} from "lucide-react";
import { usePermissions } from "@/lib/use-permissions";
import { OfficeAttendanceCard } from "@/components/dashboard/office-attendance-card";
import { NextActionsList, type NextAction } from "@/components/ui/next-action";

function greetingForHour(h: number): string {
  if (h < 12) return "Guten Morgen";
  if (h < 17) return "Guten Tag";
  return "Guten Abend";
}

interface ApptToday {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  job: { id: string; job_number: number | null; title: string } | null;
}

interface OpenTodo {
  id: string;
  title: string;
  priority: "normal" | "dringend";
  due_date: string | null;
}

interface OpenTicket {
  id: string;
  ticket_number: number;
  title: string;
  type: string;
  status: string;
}

interface RapportDraft {
  id: string;
  job_id: string;
  updated_at: string;
  job: { job_number: number | null; title: string; customer: { name: string } | null; location: { name: string } | null } | null;
}

interface PersonalStats {
  hoursWeek: number;
  hoursWeekByDay: number[]; // [Mo, Di, Mi, Do, Fr, Sa, So]
  activeJobs: number;
  openTodosToday: number;   // eigene offene Todos ohne oder mit Faelligkeit bis heute
}

interface UpcomingDay {
  isoDate: string;          // "2026-05-12"
  label: string;            // "Mo 12.5."
  isToday: boolean;
  appointments: ApptToday[];
}

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const WEEKDAY_FULL = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]; // JS-getDay() index

function formatHoursShort(h: number): string {
  if (h <= 0) return "0h";
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  if (hh === 0) return `${mm}min`;
  if (mm === 0) return `${hh}h`;
  return `${hh}h ${mm}min`;
}

export default function HeutePage() {
  const supabase = createClient();
  const { profile, can, role } = usePermissions();
  void profile; // profile fuer kuenftige Erweiterungen — Name wird via own-fetch geholt
  const [userName, setUserName] = useState("");
  const [todos, setTodos] = useState<OpenTodo[]>([]);
  const [tickets, setTickets] = useState<OpenTicket[]>([]);
  const [stats, setStats] = useState<PersonalStats | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingDay[]>([]);
  const [rapportDrafts, setRapportDrafts] = useState<RapportDraft[]>([]);
  const [nextActions, setNextActions] = useState<NextAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      if (profile?.full_name) setUserName(profile.full_name.split(" ")[0]);

      // Tagesgrenze fuer Stempel-Aggregationen + Look-Ahead-Start
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);

      // Wochenstart Montag 00:00. JS-getDay() gibt Sonntag=0, Montag=1, ...
      // Mit ((dow + 6) % 7) wird Mo=0, So=6 — so kann man Tage von Montag
      // zaehlen.
      const startOfWeek = new Date(startOfDay);
      const monOffset = (startOfWeek.getDay() + 6) % 7;
      startOfWeek.setDate(startOfWeek.getDate() - monOffset);

      // 7-Tage-Look-Ahead Fenster (heute 00:00 bis +7d 23:59)
      const sevenDaysAhead = new Date(startOfDay);
      sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);
      sevenDaysAhead.setHours(23, 59, 59, 999);

      // Fenster fuer "Offene Todos heute": alle offenen Todos ohne
      // Faelligkeit ODER Faelligkeit <= heute (= ueberfaellig + heute
      // faellig). Datum als lokales ISO (Europe/Zurich) bilden — sonst
      // droht ein UTC-Offset-Fehler beim Vergleich.
      const todayLocalIsoDate = startOfDay.toLocaleDateString("en-CA", { timeZone: "Europe/Zurich" });

      const [todoRes, ticketRes, entriesRes, openTodosTodayRes, assignedJobsRes, leadJobsRes, upcomingRes, draftsRes] = await Promise.all([
        supabase
          .from("todos")
          .select("id, title, priority, due_date")
          .eq("assigned_to", user.id)
          .eq("status", "offen")
          .order("priority", { ascending: false })
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(5),
        supabase
          .from("tickets")
          .select("id, ticket_number, title, type, status")
          .eq("created_by", user.id)
          .eq("status", "offen")
          .order("created_at", { ascending: false })
          .limit(5),
        // Stempelzeiten der laufenden Woche (eigene, abgeschlossene)
        supabase
          .from("time_entries")
          .select("clock_in, clock_out")
          .eq("user_id", user.id)
          .not("clock_out", "is", null)
          .gte("clock_in", startOfWeek.toISOString()),
        // "Offene Todos heute" — Count aller offenen eigenen Todos, deren
        // Faelligkeit heute oder in der Vergangenheit liegt (oder gar keine
        // Faelligkeit gesetzt ist — die haben "kein Ablaufdatum" und
        // gelten daher immer als "steht an"). Count-only, keine Rows.
        supabase
          .from("todos")
          .select("id", { count: "exact", head: true })
          .eq("assigned_to", user.id)
          .eq("status", "offen")
          .or(`due_date.is.null,due_date.lte.${todayLocalIsoDate}`),
        // Aktive Auftraege via job_appointments (= Termine des Mitarbeiters).
        // Set dedupliziert weiter unten falls mehrere Termine pro Job.
        supabase
          .from("job_appointments")
          .select("job:jobs(id, status, is_deleted)")
          .eq("assigned_to", user.id),
        // Aktive Auftraege bei denen ich Project-Lead bin
        supabase
          .from("jobs")
          .select("id, status")
          .eq("project_lead_id", user.id)
          .neq("is_deleted", true),
        // Kommende 7 Tage — eigene Termine im Look-Ahead-Fenster
        supabase
          .from("job_appointments")
          .select("id, title, start_time, end_time, job:jobs(id, job_number, title)")
          .eq("assigned_to", user.id)
          .gte("start_time", startOfDay.toISOString())
          .lte("start_time", sevenDaysAhead.toISOString())
          .order("start_time"),
        // Eigene Rapport-Entwuerfe — Bruecke zum Auftrag-Detail. RLS erlaubt
        // dem User Sicht auf seine eigenen created_by-Rapporte; wir zeigen
        // die letzten 5 offenen Entwuerfe.
        supabase
          .from("service_reports")
          .select("id, job_id, updated_at, job:jobs(job_number, title, customer:customers(name), location:locations(name))")
          .eq("created_by", user.id)
          .eq("status", "entwurf")
          .order("updated_at", { ascending: false })
          .limit(5),
      ]);

      setTodos((todoRes.data ?? []) as OpenTodo[]);
      setTickets((ticketRes.data ?? []) as OpenTicket[]);

      // Stunden-Aggregation: laufende Woche (mit Per-Tag-Verteilung)
      let hoursWeek = 0;
      const hoursByDay = [0, 0, 0, 0, 0, 0, 0]; // Mo..So
      type EntryRow = { clock_in: string; clock_out: string | null };
      for (const e of (entriesRes.data ?? []) as EntryRow[]) {
        if (!e.clock_out) continue;
        const start = new Date(e.clock_in);
        const dur = (new Date(e.clock_out).getTime() - start.getTime()) / 3600000;
        hoursWeek += dur;
        const dayIdx = (start.getDay() + 6) % 7;
        hoursByDay[dayIdx] += dur;
      }

      // Aktive Auftraege = assigned + lead, Status nicht abgeschlossen/storniert,
      // dedupliziert (kann sein dass jemand assigned + lead auf demselben Job ist).
      const activeJobIds = new Set<string>();
      type AssignmentRow = { job: { id: string; status: string; is_deleted: boolean } | { id: string; status: string; is_deleted: boolean }[] | null };
      for (const a of (assignedJobsRes.data ?? []) as AssignmentRow[]) {
        const j = Array.isArray(a.job) ? a.job[0] : a.job;
        if (j && !j.is_deleted && !["abgeschlossen", "storniert"].includes(j.status)) {
          activeJobIds.add(j.id);
        }
      }
      type LeadRow = { id: string; status: string };
      for (const j of (leadJobsRes.data ?? []) as LeadRow[]) {
        if (!["abgeschlossen", "storniert"].includes(j.status)) {
          activeJobIds.add(j.id);
        }
      }

      setStats({
        hoursWeek,
        hoursWeekByDay: hoursByDay,
        activeJobs: activeJobIds.size,
        openTodosToday: openTodosTodayRes.count ?? 0,
      });

      // Upcoming-Look-Ahead nach Datum gruppieren — 7 Day-Buckets, leere Tage
      // werden ausgelassen damit die Card nicht aufgeblaeht wirkt.
      type UpcomingApptRow = Omit<ApptToday, "job"> & { job: ApptToday["job"] | ApptToday["job"][] | null };
      const upcomingByDate = new Map<string, ApptToday[]>();
      for (const a of (upcomingRes.data ?? []) as UpcomingApptRow[]) {
        const date = new Date(a.start_time);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        const arr = upcomingByDate.get(key) ?? [];
        arr.push({
          ...a,
          job: Array.isArray(a.job) ? a.job[0] ?? null : a.job,
        });
        upcomingByDate.set(key, arr);
      }
      const todayKey = `${startOfDay.getFullYear()}-${String(startOfDay.getMonth() + 1).padStart(2, "0")}-${String(startOfDay.getDate()).padStart(2, "0")}`;
      const upcomingArr: UpcomingDay[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(startOfDay);
        d.setDate(d.getDate() + i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const appts = upcomingByDate.get(key) ?? [];
        if (appts.length === 0 && key !== todayKey) continue; // leere Tage skippen (heute zeigen wir trotzdem)
        upcomingArr.push({
          isoDate: key,
          label: `${WEEKDAY_FULL[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`,
          isToday: key === todayKey,
          appointments: appts,
        });
      }
      setUpcoming(upcomingArr);

      // Rapport-Entwuerfe — Supabase gibt bei !inner-loser joins die
      // Relation als Array oder Object zurueck, wir normalisieren auf ein
      // Objekt und filtern Rows deren Job in der Zwischenzeit geloescht
      // wurde raus.
      type DraftRow = {
        id: string;
        job_id: string;
        updated_at: string;
        job:
          | { job_number: number | null; title: string; customer: { name: string } | { name: string }[] | null; location: { name: string } | { name: string }[] | null }
          | { job_number: number | null; title: string; customer: { name: string } | { name: string }[] | null; location: { name: string } | { name: string }[] | null }[]
          | null;
      };
      const draftsArr: RapportDraft[] = ((draftsRes.data ?? []) as DraftRow[])
        .map((d) => {
          const j = Array.isArray(d.job) ? d.job[0] ?? null : d.job;
          if (!j) return null;
          const cust = Array.isArray(j.customer) ? j.customer[0] ?? null : j.customer;
          const loc = Array.isArray(j.location) ? j.location[0] ?? null : j.location;
          return {
            id: d.id,
            job_id: d.job_id,
            updated_at: d.updated_at,
            job: {
              job_number: j.job_number,
              title: j.title,
              customer: cust,
              location: loc,
            },
          } as RapportDraft;
        })
        .filter((d): d is RapportDraft => d !== null);
      setRapportDrafts(draftsArr);

      setLoading(false);
    })();
  }, [supabase]);

  // ─── Naechste-Aktion-Widget — auto-abgeleitete Handlungs-Vorschlaege
  // Statt statische CTAs zeigt der Top-Slot dynamisch was gerade zu tun
  // ist (Rapport fortsetzen, Ferien-Antraege pruefen, Rechnung stellen,
  // Personal zuteilen etc.). Rollen-abhaengig. Ein zusaetzlicher Effect
  // damit die ersten Widgets (Termine/KPIs) nicht auf 5-10 Zusatz-Queries
  // warten. Re-run wenn Rolle wechselt — z.B. nach Auth-Refresh.
  useEffect(() => {
    if (!role) return; // Rolle noch nicht geladen — nichts derivieren
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const actions = await deriveDashboardNextActions(supabase, user.id, role);
      if (!cancelled) setNextActions(actions);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, role]);

  const greeting = greetingForHour(new Date().getHours());

  function formatDate(iso: string): string {
    return new Date(iso + "T12:00:00Z").toLocaleDateString("de-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit" });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting}{userName ? ` ${userName}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {new Date().toLocaleDateString("de-CH", {
            timeZone: "Europe/Zurich",
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Deine naechsten Aktionen — auto-abgeleitete Handlungs-Vorschlaege
          aus dem DB-Zustand (Rapport-Entwuerfe, offene Stempelungen, Termine
          heute, Personal-Zuteilung, Rechnungen, Ferien-Genehmigungen, Lohn-
          Setup). Ganz oben damit der User nach dem Login ZUERST sieht, was
          zu tun ist — nicht was gestern war. */}
      <NextActionsList
        title="Deine nächsten Aktionen"
        titleIcon={Sparkles}
        actions={nextActions}
        loading={loading}
        onShowMore={nextActions.length > 5 ? () => { window.location.href = "/todos"; } : undefined}
        emptyLabel="Nichts anstehend — alles im Lot"
        emptySublabel="Du hast keine offenen Handlungen. Zeit für einen Espresso."
      />

      {/* Office-Anwesenheit — Wochen-Grid wer wann im Büro ist. Nur
          gerendert wenn User die Permission hat (sonst RLS liefert
          eh nichts). */}
      {can("anwesenheit:view") && <OfficeAttendanceCard />}

      {/* Personal-Stats-Strip — 3 KPIs im "was ist heute los"-Fokus.
          Reihenfolge: Zeit-Fortschritt (Diese Woche mit Sparkline Mo..So),
          Pipeline (Aktive Auftraege), Priorisiertes To-Do (Offene Todos
          heute — Todos ohne Faelligkeit oder mit Faelligkeit bis heute). */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Diese Woche"
          value={loading ? "—" : formatHoursShort(stats?.hoursWeek ?? 0)}
          icon={Clock}
          accent="teal"
          sparkline={loading ? null : stats?.hoursWeekByDay ?? null}
        />
        <StatCard
          label="Aktive Aufträge"
          value={loading ? "—" : (stats?.activeJobs ?? 0).toString()}
          icon={Briefcase}
          accent="red"
        />
        <StatCard
          label="Offene Todos heute"
          value={loading ? "—" : (stats?.openTodosToday ?? 0).toString()}
          icon={CheckSquare}
          accent="amber"
          sub="fällig oder überfällig"
        />
      </div>

      {/* Kommende 7 Tage — Look-Ahead-Agenda fuer alle User */}
      {!loading && <UpcomingCard days={upcoming} />}

      {/* Meine Rapport-Entwuerfe — Bruecke Dashboard → Auftrag-Rapport-Tab.
          Nur gerendert wenn tatsaechlich Entwuerfe da sind, damit sie keine
          leere Card produziert. */}
      {!loading && rapportDrafts.length > 0 && <RapportDraftsCard drafts={rapportDrafts} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Offene Todos */}
        <Card className="bg-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <h2 className="font-semibold text-sm">Offene Todos</h2>
                <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                  {todos.length}
                </span>
              </div>
              <Link href="/todos" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                Alle <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
              </div>
            ) : todos.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Keine offenen Todos.</p>
            ) : (
              <div className="space-y-2">
                {todos.map((t) => (
                  <Link
                    key={t.id}
                    href="/todos"
                    className="flex items-center justify-between gap-2 p-3 rounded-lg bg-foreground/[0.02] dark:bg-foreground/[0.04] hover:bg-foreground/[0.05] dark:hover:bg-foreground/[0.08] transition-colors min-w-0"
                  >
                    <p className="font-medium text-sm truncate flex-1 min-w-0">
                      {t.priority === "dringend" && (
                        <AlertCircle className="inline h-3.5 w-3.5 -mt-0.5 mr-1 text-red-600 dark:text-red-400" />
                      )}
                      {t.title}
                    </p>
                    {t.due_date && (
                      <span className="text-[11px] text-muted-foreground shrink-0">{formatDate(t.due_date)}</span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Eigene offene Tickets */}
        <Card className="bg-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Ticket className="h-4 w-4 text-red-600 dark:text-red-400" />
                <h2 className="font-semibold text-sm">Meine offenen Tickets</h2>
                <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">
                  {tickets.length}
                </span>
              </div>
              <Link href="/tickets" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                Alle <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
              </div>
            ) : tickets.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Keine offenen Tickets.</p>
            ) : (
              <div className="space-y-2">
                {tickets.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tickets/${t.id}`}
                    className="flex items-center gap-2 p-3 rounded-lg bg-foreground/[0.02] dark:bg-foreground/[0.04] hover:bg-foreground/[0.05] dark:hover:bg-foreground/[0.08] transition-colors min-w-0"
                  >
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">T-{t.ticket_number}</span>
                    <p className="font-medium text-sm truncate flex-1 min-w-0">{t.title}</p>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// =====================================================================
// StatCard — kompakte KPI-Kachel mit optionaler Wochen-Sparkline
// =====================================================================

const ACCENT_CLASSES = {
  teal: { icon: "text-teal-600 dark:text-teal-400", bg: "rgb(20,184,166)" },
  red: { icon: "text-red-600 dark:text-red-400", bg: "rgb(220,38,38)" },
  green: { icon: "text-green-600 dark:text-green-400", bg: "rgb(34,197,94)" },
  blue: { icon: "text-blue-600 dark:text-blue-400", bg: "rgb(37,99,235)" },
  amber: { icon: "text-amber-600 dark:text-amber-400", bg: "rgb(245,158,11)" },
} as const;

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: keyof typeof ACCENT_CLASSES;
  /** Optionale Wochen-Sparkline (7 Werte Mo..So). */
  sparkline?: number[] | null;
  /** Optionaler Sub-Text unter dem Wert (z.B. "Todos"). */
  sub?: string;
}

function StatCard({ label, value, icon: Icon, accent, sparkline, sub }: StatCardProps) {
  const colors = ACCENT_CLASSES[accent];
  const max = sparkline ? Math.max(...sparkline, 1) : 1;
  return (
    <Card className="bg-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {label}
          </p>
          <Icon className={`h-4 w-4 ${colors.icon}`} />
        </div>
        <div className="flex items-baseline gap-2">
          <p className="text-xl font-bold tabular-nums leading-none">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        </div>
        {sparkline && (
          <div className="mt-3 flex items-end gap-1 h-8">
            {sparkline.map((v, i) => {
              const heightPx = v > 0 ? Math.max((v / max) * 28, 2) : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5 min-w-0">
                  <div
                    className="w-full rounded-sm"
                    style={{
                      height: `${heightPx}px`,
                      backgroundColor: v > 0 ? colors.bg : "transparent",
                      opacity: v > 0 ? 0.7 : 1,
                    }}
                  />
                  <span className="text-[8px] text-muted-foreground/70 leading-none">
                    {WEEKDAY_LABELS[i]}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// UpcomingCard — Kommende 7 Tage Look-Ahead
// =====================================================================

function UpcomingCard({ days }: { days: UpcomingDay[] }) {
  const totalAppts = days.reduce((s, d) => s + d.appointments.length, 0);
  return (
    <Card className="bg-card">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <h2 className="font-semibold text-sm">Kommende 7 Tage</h2>
            <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
              {totalAppts}
            </span>
          </div>
          <Link href="/kalender" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            Kalender <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {days.length === 0 || totalAppts === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Keine Termine in den nächsten 7 Tagen.</p>
        ) : (
          <div className="space-y-2">
            {days.filter((d) => d.appointments.length > 0).map((d) => (
              <div key={d.isoDate}>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className={`text-[10px] uppercase tracking-wider font-semibold ${d.isToday ? "text-foreground" : "text-muted-foreground"}`}>
                    {d.isToday ? "Heute" : d.label}
                  </span>
                  {d.isToday && <span className="h-1 w-1 rounded-full bg-red-500" />}
                </div>
                <div className="space-y-1">
                  {d.appointments.map((a) => (
                    <Link
                      key={a.id}
                      href={a.job ? `/auftraege/${a.job.id}` : "/kalender"}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-foreground/[0.02] dark:bg-foreground/[0.04] hover:bg-foreground/[0.05] dark:hover:bg-foreground/[0.08] transition-colors min-w-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{a.title}</p>
                        {a.job && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {a.job.job_number ? `INT-${a.job.job_number} · ` : ""}{a.job.title}
                          </p>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                        {new Date(a.start_time).toLocaleTimeString("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// RapportDraftsCard — offene eigene Rapport-Entwuerfe
// Bruecke zum Auftrag-Detail: Klick oeffnet /auftraege/[id]?tab=rapport&openDraft=1
// wodurch das RapportFormModal automatisch mit dem Entwurf aufgeht.
// =====================================================================

function formatRelativeShort(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60000);
  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `vor ${diffD} Tag${diffD === 1 ? "" : "en"}`;
  return new Date(iso).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit" });
}

function RapportDraftsCard({ drafts }: { drafts: RapportDraft[] }) {
  return (
    <Card className="bg-card">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileEdit className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h2 className="font-semibold text-sm">Meine Rapport-Entwürfe</h2>
            <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
              {drafts.length}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          {drafts.map((d) => {
            const nr = d.job?.job_number ? `INT-${d.job.job_number}` : "INT-…";
            const label = d.job?.customer?.name ?? d.job?.location?.name ?? d.job?.title ?? "";
            return (
              <Link
                key={d.id}
                href={`/auftraege/${d.job_id}?tab=rapport&openDraft=1`}
                className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md bg-foreground/[0.02] dark:bg-foreground/[0.04] hover:bg-foreground/[0.05] dark:hover:bg-foreground/[0.08] transition-colors min-w-0"
              >
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <span className="text-[10px] font-mono font-semibold text-muted-foreground shrink-0">{nr}</span>
                  <p className="text-sm truncate">{label}</p>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {formatRelativeShort(d.updated_at)}
                </span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// deriveDashboardNextActions — rollen-abhaengige "was jetzt?"-Aktionen
// =====================================================================
//
// Bundelt 5-10 Supabase-Queries via Promise.all und mappt die Ergebnisse
// auf NextAction-Objekte. Reihenfolge in der Liste = Prioritaet.
// Rollen:
//   admin / teamleiter → operative Steuerungs-Aktionen
//   techniker / mitarbeiter → arbeits-Aktionen (Termin heute, Signatur)
//   alle → Rapport-Entwuerfe, offene Stempelung, heute Termin ohne Rapport
//
// Die Regeln sind bewusst konservativ formuliert (schwelle >2 Tage, >7 Tage,
// >6 Monate) damit die Liste nicht taeglich mit trivialen Vorschlaegen
// vollgemuellt wird.

type SupabaseClient = ReturnType<typeof createClient>;

async function deriveDashboardNextActions(
  supabase: SupabaseClient,
  userId: string,
  role: string,
): Promise<NextAction[]> {
  const isLead = role === "admin" || role === "teamleiter";
  const isField = role === "techniker" || role === "mitarbeiter";

  const now = Date.now();
  const twoDaysAgoISO = new Date(now - 2 * 24 * 3600 * 1000).toISOString();
  const sevenDaysAgoISO = new Date(now - 7 * 24 * 3600 * 1000).toISOString();
  const twentyFourHAgoISO = new Date(now - 24 * 3600 * 1000).toISOString();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startTodayISO = today.toISOString();
  const endTodayISO = new Date(today.getTime() + 24 * 3600 * 1000).toISOString();
  const tomorrow = new Date(today.getTime() + 24 * 3600 * 1000);
  const startTomorrowISO = tomorrow.toISOString();
  const endTomorrowISO = new Date(tomorrow.getTime() + 24 * 3600 * 1000).toISOString();
  const todayLocalIso = today.toLocaleDateString("en-CA", { timeZone: "Europe/Zurich" });
  const tomorrowLocalIso = new Date(today.getTime() + 24 * 3600 * 1000).toLocaleDateString("en-CA", { timeZone: "Europe/Zurich" });

  // ─── Parallel-Queries ───────────────────────────────────────────
  const [
    oldDraftsRes,
    openStempelRes,
    todayApptsRes,
    tomorrowApptsRes,
    tomorrowJobsAdminRes,
    unbilledJobsRes,
    pendingVacationsRes,
    missingSigRes,
  ] = await Promise.all([
    // Rapport-Entwuerfe seit >2 Tagen (eigene).
    supabase
      .from("service_reports")
      .select("id, job_id, updated_at, job:jobs(job_number, title, customer:customers(name), location:locations(name))")
      .eq("created_by", userId)
      .eq("status", "entwurf")
      .lt("updated_at", twoDaysAgoISO)
      .order("updated_at", { ascending: true })
      .limit(3),
    // Offene Stempelungen des Users: clock_out=NULL und clock_in >24h alt.
    // (Anstelle "nicht abgesegnet" — die App hat kein Approval-Feld.)
    supabase
      .from("time_entries")
      .select("id, clock_in, job:jobs(id, job_number, title)")
      .eq("user_id", userId)
      .is("clock_out", null)
      .lt("clock_in", twentyFourHAgoISO)
      .order("clock_in", { ascending: true })
      .limit(2),
    // Heute-Termine des Users. Fuer "kein Rapport begonnen" gleichen wir
    // clientseitig ab (siehe unten).
    supabase
      .from("job_appointments")
      .select("id, start_time, job:jobs!inner(id, job_number, title, is_deleted, status)")
      .eq("assigned_to", userId)
      .gte("start_time", startTodayISO)
      .lt("start_time", endTodayISO),
    // Morgen-Termine des Users (fuer Techniker-Rolle als "Termin morgen"-Hinweis).
    supabase
      .from("job_appointments")
      .select("id, start_time, title, job:jobs!inner(id, job_number, title, is_deleted)")
      .eq("assigned_to", userId)
      .gte("start_time", startTomorrowISO)
      .lt("start_time", endTomorrowISO)
      .order("start_time")
      .limit(3),
    // Admin/Teamleiter: Auftraege die morgen starten und noch keine
    // Termine (bzw. keine Zuteilungen) haben. Wir laden die morgen-startenden
    // und mappen clientseitig ab wieviele appointments/assignments es gibt.
    isLead
      ? supabase
          .from("jobs")
          .select("id, job_number, title, start_date, customer:customers(name), appointments:job_appointments(id, assigned_to)")
          .eq("status", "offen")
          .eq("is_deleted", false)
          .eq("start_date", tomorrowLocalIso)
          .limit(20)
      : Promise.resolve({ data: [] as JobsWithApptRow[] }),
    // Admin/Teamleiter: Auftraege abgeschlossen seit >7 Tagen ohne Rechnung.
    isLead
      ? supabase
          .from("jobs")
          .select("id, job_number, title, end_date, updated_at")
          .eq("status", "abgeschlossen")
          .eq("is_deleted", false)
          .is("invoiced_at", null)
          .is("invoice_skipped_at", null)
          .lt("updated_at", sevenDaysAgoISO)
          .order("updated_at", { ascending: true })
          .limit(5)
      : Promise.resolve({ data: [] as UnbilledJobRow[] }),
    // Admin/Teamleiter: offene Ferien-Antraege.
    isLead
      ? supabase
          .from("time_off")
          .select("id", { count: "exact", head: true })
          .eq("status", "beantragt")
      : Promise.resolve({ count: 0 }),
    // Techniker/Mitarbeiter: eigene abgeschlossene Rapporte ohne Techniker-Signatur.
    isField
      ? supabase
          .from("service_reports")
          .select("id, job_id, job:jobs(job_number, title)")
          .eq("created_by", userId)
          .eq("status", "abgeschlossen")
          .is("technician_signature_url", null)
          .order("updated_at", { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] as MissingSigRow[] }),
  ]);

  // ─── Zweite Welle — Mitarbeiter ohne hinterlegten aktuellen Lohn.
  // Wir laden alle aktiven Nicht-Partner-Profiles und die aktiven
  // compensation-Rows (effective_to IS NULL) — der Diff sind die
  // Mitarbeiter ohne Lohn. RLS: employee_compensation ist auf lohn:manage
  // + admin begrenzt; bei Access-Denied liefert der Query [] und die
  // Regel liefert schlicht keinen Vorschlag (kein Alert-Muell fuer
  // User ohne Lohn-Recht). Wir feuern beide Queries parallel damit die
  // Widget-Latenz nicht zwei Round-Trips braucht.
  let missingLohn: { profile_id: string; full_name: string }[] = [];
  if (isLead) {
    const [profilesRes, compRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .neq("role", "partner"),
      supabase
        .from("employee_compensation")
        .select("profile_id")
        .is("effective_to", null),
    ]);
    const withComp = new Set(
      ((compRes.data ?? []) as { profile_id: string }[]).map((r) => r.profile_id),
    );
    missingLohn = ((profilesRes.data ?? []) as { id: string; full_name: string }[])
      .filter((p) => !withComp.has(p.id))
      .map((p) => ({ profile_id: p.id, full_name: p.full_name }));
  }

  // ─── Termine heute die noch keinen Rapport haben ─────────────────
  // Wir laden die service_reports der Jobs die heute Termin haben,
  // um clientseitig abzugleichen (spart eine Cross-Join-Query).
  type ApptTodayRow = {
    id: string;
    start_time: string;
    job: { id: string; job_number: number | null; title: string; is_deleted: boolean; status: string } | { id: string; job_number: number | null; title: string; is_deleted: boolean; status: string }[] | null;
  };
  const todayApptRows = (todayApptsRes.data ?? []) as ApptTodayRow[];
  const todayJobIds = new Set<string>();
  const todayApptsByJob = new Map<string, { start: string; number: number | null; title: string }>();
  for (const a of todayApptRows) {
    const j = Array.isArray(a.job) ? a.job[0] : a.job;
    if (!j || j.is_deleted || j.status !== "offen") continue;
    if (!todayApptsByJob.has(j.id)) {
      todayApptsByJob.set(j.id, { start: a.start_time, number: j.job_number, title: j.title });
      todayJobIds.add(j.id);
    }
  }
  let jobsWithReports = new Set<string>();
  if (todayJobIds.size > 0) {
    const { data: repRows } = await supabase
      .from("service_reports")
      .select("job_id")
      .in("job_id", Array.from(todayJobIds));
    jobsWithReports = new Set((repRows ?? []).map((r: { job_id: string }) => r.job_id));
  }

  // ─── Mapping in NextAction-Objekte ───────────────────────────────
  const actions: NextAction[] = [];

  // 1. Danger-Level: Offene Stempelung (ueberfaellig — der Nutzer stempelt
  //    immer noch ein Ding).
  type OpenStempelRow = { id: string; clock_in: string; job: { id: string; job_number: number | null; title: string } | { id: string; job_number: number | null; title: string }[] | null };
  for (const t of ((openStempelRes.data ?? []) as OpenStempelRow[])) {
    const j = Array.isArray(t.job) ? t.job[0] : t.job;
    const nr = j?.job_number ? `INT-${j.job_number}` : null;
    const hoursOpen = Math.round((now - Date.parse(t.clock_in)) / 3600000);
    actions.push({
      key: `stempel-open-${t.id}`,
      icon: ClockAlert,
      label: "Offene Stempelung schließen",
      subtitle: `Seit ${hoursOpen}h offen${nr ? ` · ${nr}` : ""}`,
      severity: "danger",
      href: "/stempelzeiten",
    });
  }

  // 2. Heute Termin ohne Rapport → Rapport starten
  for (const jobId of todayJobIds) {
    if (jobsWithReports.has(jobId)) continue;
    const meta = todayApptsByJob.get(jobId)!;
    const nr = meta.number ? `INT-${meta.number}` : "INT-…";
    const timeStr = new Date(meta.start).toLocaleTimeString("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" });
    actions.push({
      key: `today-rapport-${jobId}`,
      icon: FilePlus,
      label: `Rapport starten für ${nr}`,
      subtitle: `Heute ${timeStr} · ${meta.title}`,
      severity: "warn",
      href: `/auftraege/${jobId}?tab=rapport`,
    });
  }

  // 3. Rapport-Entwuerfe seit >2 Tagen fortsetzen
  type DraftRow = {
    id: string;
    job_id: string;
    updated_at: string;
    job: { job_number: number | null; title: string; customer: { name: string } | { name: string }[] | null; location: { name: string } | { name: string }[] | null }
      | { job_number: number | null; title: string; customer: { name: string } | { name: string }[] | null; location: { name: string } | { name: string }[] | null }[]
      | null;
  };
  for (const d of ((oldDraftsRes.data ?? []) as DraftRow[])) {
    const j = Array.isArray(d.job) ? d.job[0] : d.job;
    if (!j) continue;
    const cust = Array.isArray(j.customer) ? j.customer[0] : j.customer;
    const loc = Array.isArray(j.location) ? j.location[0] : j.location;
    const nr = j.job_number ? `INT-${j.job_number}` : "INT-…";
    const days = Math.floor((now - Date.parse(d.updated_at)) / (24 * 3600 * 1000));
    actions.push({
      key: `draft-old-${d.id}`,
      icon: PenLine,
      label: `Rapport in ${nr} fortsetzen`,
      subtitle: `Entwurf seit ${days} Tagen · ${cust?.name ?? loc?.name ?? j.title}`,
      severity: "warn",
      href: `/auftraege/${d.job_id}?tab=rapport&openDraft=1`,
    });
  }

  // 4. Admin/Teamleiter: Morgen-Auftraege ohne Personal.
  type JobsWithApptRow = {
    id: string;
    job_number: number | null;
    title: string;
    start_date: string;
    customer: { name: string } | { name: string }[] | null;
    appointments: { id: string; assigned_to: string | null }[] | null;
  };
  for (const j of ((tomorrowJobsAdminRes.data ?? []) as JobsWithApptRow[])) {
    const appts = j.appointments ?? [];
    const noAppts = appts.length === 0;
    const noAssignments = appts.every((a) => !a.assigned_to);
    if (!noAppts && !noAssignments) continue; // alles sauber zugeteilt
    const cust = Array.isArray(j.customer) ? j.customer[0] : j.customer;
    const nr = j.job_number ? `INT-${j.job_number}` : "INT-…";
    actions.push({
      key: `tomorrow-personal-${j.id}`,
      icon: Users,
      label: noAppts ? `Termine anlegen für ${nr}` : `Personal zuteilen für ${nr}`,
      subtitle: `Morgen · ${cust?.name ?? j.title}`,
      severity: "danger",
      href: `/auftraege/${j.id}?tab=uebersicht${noAppts ? "&termin=neu" : ""}`,
    });
  }

  // 5. Admin/Teamleiter: Auftraege abgeschlossen seit >7 Tagen ohne Rechnung.
  type UnbilledJobRow = { id: string; job_number: number | null; title: string; end_date: string | null; updated_at: string };
  for (const j of ((unbilledJobsRes.data ?? []) as UnbilledJobRow[])) {
    const nr = j.job_number ? `INT-${j.job_number}` : "INT-…";
    const days = Math.floor((now - Date.parse(j.updated_at)) / (24 * 3600 * 1000));
    actions.push({
      key: `unbilled-${j.id}`,
      icon: Receipt,
      label: `Rechnung für ${nr} stellen`,
      subtitle: `Abgeschlossen vor ${days} Tagen · ${j.title}`,
      severity: "warn",
      href: `/abrechnung?job=${j.id}`,
    });
  }

  // 6. Admin/Teamleiter: Ferien-Antraege warten (nur EINE Zeile, gebuendelt).
  const pendingVacationCount = pendingVacationsRes.count ?? 0;
  if (pendingVacationCount > 0) {
    actions.push({
      key: "vacations-pending",
      icon: PlaneTakeoff,
      label: pendingVacationCount === 1
        ? "1 Ferienantrag prüfen"
        : `${pendingVacationCount} Ferienanträge prüfen`,
      subtitle: "Warten auf Genehmigung",
      severity: "warn",
      href: "/hr?tab=ferien",
    });
  }

  // 7. Admin/Teamleiter: Mitarbeiter ohne hinterlegten Lohn (max 3).
  for (const m of missingLohn.slice(0, 3)) {
    actions.push({
      key: `lohn-missing-${m.profile_id}`,
      icon: Wallet,
      label: `Lohn für ${m.full_name} setzen`,
      subtitle: "Kein Brutto-Stundenlohn hinterlegt",
      severity: "info",
      href: "/hr?tab=loehne",
    });
  }

  // 8. Techniker/Mitarbeiter: Termin morgen → Vorbereitungshinweis.
  type TomorrowRow = { id: string; start_time: string; title: string; job: { id: string; job_number: number | null; title: string; is_deleted: boolean } | { id: string; job_number: number | null; title: string; is_deleted: boolean }[] | null };
  for (const a of ((tomorrowApptsRes.data ?? []) as TomorrowRow[])) {
    const j = Array.isArray(a.job) ? a.job[0] : a.job;
    if (!j || j.is_deleted) continue;
    const nr = j.job_number ? `INT-${j.job_number}` : "INT-…";
    const time = new Date(a.start_time).toLocaleTimeString("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" });
    actions.push({
      key: `tomorrow-appt-${a.id}`,
      icon: Calendar,
      label: `Termin morgen um ${time} · ${nr}`,
      subtitle: a.title || j.title,
      severity: "info",
      href: `/auftraege/${j.id}`,
    });
  }

  // 9. Techniker/Mitarbeiter: fehlende Signatur bei eigenem Rapport.
  type MissingSigRow = { id: string; job_id: string; job: { job_number: number | null; title: string } | { job_number: number | null; title: string }[] | null };
  for (const r of ((missingSigRes.data ?? []) as MissingSigRow[])) {
    const j = Array.isArray(r.job) ? r.job[0] : r.job;
    const nr = j?.job_number ? `INT-${j.job_number}` : "INT-…";
    actions.push({
      key: `sig-missing-${r.id}`,
      icon: PenLine,
      label: `Signatur nachtragen in ${nr}`,
      subtitle: "Rapport abgeschlossen, deine Unterschrift fehlt",
      severity: "warn",
      href: `/auftraege/${r.job_id}?tab=rapport`,
    });
  }

  // Sortierung nach Severity (danger → warn → info) fuer visuellen Fokus.
  const severityOrder: Record<NextAction["severity"], number> = { danger: 0, warn: 1, info: 2 };
  actions.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return actions;
}

// Type-Hints fuer die deriveDashboardNextActions Row-Shapes — nur damit
// TypeScript in Promise.all die Zweige gleich typisieren kann.
type JobsWithApptRow = {
  id: string;
  job_number: number | null;
  title: string;
  start_date: string;
  customer: { name: string } | { name: string }[] | null;
  appointments: { id: string; assigned_to: string | null }[] | null;
};
type UnbilledJobRow = { id: string; job_number: number | null; title: string; end_date: string | null; updated_at: string };
type MissingSigRow = { id: string; job_id: string; job: { job_number: number | null; title: string } | { job_number: number | null; title: string }[] | null };

