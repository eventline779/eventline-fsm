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
import { Calendar, CheckSquare, Ticket, ArrowRight, AlertCircle, Clock, Briefcase, CheckCircle2 } from "lucide-react";

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

interface PersonalStats {
  hoursToday: number;
  hoursWeek: number;
  hoursWeekByDay: number[]; // [Mo, Di, Mi, Do, Fr, Sa, So]
  activeJobs: number;
  completedTodosWeek: number;
}

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

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
  const [userName, setUserName] = useState("");
  const [appointments, setAppointments] = useState<ApptToday[]>([]);
  const [todos, setTodos] = useState<OpenTodo[]>([]);
  const [tickets, setTickets] = useState<OpenTicket[]>([]);
  const [stats, setStats] = useState<PersonalStats | null>(null);
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

      // Termine heute (eigene oder Auftrag-Mitglied — RLS regelt)
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);

      // Wochenstart Montag 00:00. JS-getDay() gibt Sonntag=0, Montag=1, ...
      // Mit ((dow + 6) % 7) wird Mo=0, So=6 — so kann man Tage von Montag
      // zaehlen.
      const startOfWeek = new Date(startOfDay);
      const monOffset = (startOfWeek.getDay() + 6) % 7;
      startOfWeek.setDate(startOfWeek.getDate() - monOffset);

      const [apptRes, todoRes, ticketRes, entriesRes, assignedJobsRes, leadJobsRes, doneTodosRes] = await Promise.all([
        supabase
          .from("job_appointments")
          .select("id, title, start_time, end_time, job:jobs(id, job_number, title)")
          .eq("assigned_to", user.id)
          .gte("start_time", startOfDay.toISOString())
          .lte("start_time", endOfDay.toISOString())
          .order("start_time"),
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
        // Aktive Auftraege via job_assignments
        supabase
          .from("job_assignments")
          .select("job:jobs(id, status, is_deleted)")
          .eq("profile_id", user.id),
        // Aktive Auftraege bei denen ich Project-Lead bin
        supabase
          .from("jobs")
          .select("id, status")
          .eq("project_lead_id", user.id)
          .neq("is_deleted", true),
        // Erledigte eigene Todos diese Woche
        supabase
          .from("todos")
          .select("id")
          .eq("assigned_to", user.id)
          .eq("status", "erledigt")
          .gte("completed_at", startOfWeek.toISOString()),
      ]);

      type ApptRow = Omit<ApptToday, "job"> & { job: ApptToday["job"] | ApptToday["job"][] | null };
      const apptRows = (apptRes.data ?? []) as ApptRow[];
      setAppointments(apptRows.map((a) => ({
        ...a,
        job: Array.isArray(a.job) ? a.job[0] ?? null : a.job,
      })));
      setTodos((todoRes.data ?? []) as OpenTodo[]);
      setTickets((ticketRes.data ?? []) as OpenTicket[]);

      // Stunden-Aggregation
      let hoursToday = 0;
      let hoursWeek = 0;
      const hoursByDay = [0, 0, 0, 0, 0, 0, 0]; // Mo..So
      type EntryRow = { clock_in: string; clock_out: string | null };
      for (const e of (entriesRes.data ?? []) as EntryRow[]) {
        if (!e.clock_out) continue;
        const start = new Date(e.clock_in);
        const dur = (new Date(e.clock_out).getTime() - start.getTime()) / 3600000;
        hoursWeek += dur;
        if (start >= startOfDay) hoursToday += dur;
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
        hoursToday,
        hoursWeek,
        hoursWeekByDay: hoursByDay,
        activeJobs: activeJobIds.size,
        completedTodosWeek: (doneTodosRes.data ?? []).length,
      });

      setLoading(false);
    })();
  }, [supabase]);

  const greeting = greetingForHour(new Date().getHours());

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" });
  }
  function formatDate(iso: string): string {
    return new Date(iso + "T12:00:00").toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" });
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

      {/* Personal-Stats-Strip — eigene Wochenzahlen, gleicher Look fuer
          alle User. Mini-Sparkline fuer "Diese Woche" zeigt die Stunden-
          Verteilung nach Wochentag. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Heute"
          value={loading ? "—" : formatHoursShort(stats?.hoursToday ?? 0)}
          icon={Clock}
          accent="teal"
        />
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
          label="Erledigt diese Woche"
          value={loading ? "—" : (stats?.completedTodosWeek ?? 0).toString()}
          icon={CheckCircle2}
          accent="green"
          sub="Todos"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Termine heute */}
        <Card className="bg-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h2 className="font-semibold text-sm">Heute</h2>
                <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                  {appointments.length}
                </span>
              </div>
              <Link href="/kalender" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                Kalender <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {loading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}
              </div>
            ) : appointments.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Keine Termine heute.</p>
            ) : (
              <div className="space-y-2">
                {appointments.map((a) => (
                  <Link
                    key={a.id}
                    href={a.job ? `/auftraege/${a.job.id}` : "/kalender"}
                    className="block p-3 rounded-lg bg-foreground/[0.02] dark:bg-foreground/[0.04] hover:bg-foreground/[0.05] dark:hover:bg-foreground/[0.08] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <p className="font-medium text-sm truncate">{a.title}</p>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatTime(a.start_time)}{a.end_time ? `–${formatTime(a.end_time)}` : ""}
                      </span>
                    </div>
                    {a.job && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {a.job.job_number ? `INT-${a.job.job_number} · ` : ""}{a.job.title}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
