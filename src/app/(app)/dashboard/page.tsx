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
import { Calendar, CheckSquare, Ticket, ArrowRight } from "lucide-react";

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

export default function HeutePage() {
  const supabase = createClient();
  const [userName, setUserName] = useState("");
  const [appointments, setAppointments] = useState<ApptToday[]>([]);
  const [todos, setTodos] = useState<OpenTodo[]>([]);
  const [tickets, setTickets] = useState<OpenTicket[]>([]);
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

      const [apptRes, todoRes, ticketRes] = await Promise.all([
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
          .order("priority", { ascending: false }) // dringend first (alphabetical: dringend < normal)
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(5),
        supabase
          .from("tickets")
          .select("id, ticket_number, title, type, status")
          .eq("created_by", user.id)
          .eq("status", "offen")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      type ApptRow = Omit<ApptToday, "job"> & { job: ApptToday["job"] | ApptToday["job"][] | null };
      const apptRows = (apptRes.data ?? []) as ApptRow[];
      setAppointments(apptRows.map((a) => ({
        ...a,
        job: Array.isArray(a.job) ? a.job[0] ?? null : a.job,
      })));
      setTodos((todoRes.data ?? []) as OpenTodo[]);
      setTickets((ticketRes.data ?? []) as OpenTicket[]);
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
                      {t.priority === "dringend" && <span className="text-red-600 dark:text-red-400 mr-1">🚨</span>}
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
