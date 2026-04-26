"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Play,
  Pause,
  Calendar,
  CheckSquare,
  FileText,
  Inbox,
  ArrowRight,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";

type AssignedEvent = {
  id: string;
  title: string;
  job_number: number | null;
  start_date: string | null;
  end_date: string | null;
  location_name: string | null;
  role_on_job: string | null;
};

type MyTodo = {
  id: string;
  title: string;
  due_date: string | null;
  priority: string;
};

type OpenTimeEntry = {
  id: string;
  job_id: string | null;
  clock_in: string;
  job_title: string | null;
};

type ReportDue = {
  job_id: string;
  title: string;
  end_date: string | null;
};

export default function HeutePage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [openEntry, setOpenEntry] = useState<OpenTimeEntry | null>(null);
  const [myEvents, setMyEvents] = useState<AssignedEvent[]>([]);
  const [myTodos, setMyTodos] = useState<MyTodo[]>([]);
  const [todoCount, setTodoCount] = useState(0);
  const [reportsDue, setReportsDue] = useState<ReportDue[]>([]);
  const [adminStats, setAdminStats] = useState({
    neueAnfragen: 0,
    eventsHeute: 0,
    eventsDieseWoche: 0,
  });

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    if (profile) {
      setUserName(profile.full_name?.split(" ")[0] ?? "");
      setIsAdmin(profile.role === "admin");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Open time entry (am I clocked in?)
    const { data: openEntries } = await supabase
      .from("time_entries")
      .select("id, job_id, clock_in, jobs(title)")
      .eq("profile_id", user.id)
      .is("clock_out", null)
      .order("clock_in", { ascending: false })
      .limit(1);
    if (openEntries && openEntries.length > 0) {
      const e = openEntries[0] as unknown as {
        id: string;
        job_id: string | null;
        clock_in: string;
        jobs?: { title: string } | { title: string }[] | null;
      };
      const job = Array.isArray(e.jobs) ? e.jobs[0] : e.jobs;
      setOpenEntry({
        id: e.id,
        job_id: e.job_id,
        clock_in: e.clock_in,
        job_title: job?.title ?? null,
      });
    }

    // My next assigned events
    const { data: assignments } = await supabase
      .from("job_assignments")
      .select(
        "role_on_job, jobs(id, title, job_number, start_date, end_date, status, locations(name))"
      )
      .eq("profile_id", user.id)
      .limit(20);

    type JobShape = {
      id: string;
      title: string;
      job_number: number | null;
      start_date: string | null;
      end_date: string | null;
      status: string;
      locations?: { name: string } | { name: string }[] | null;
    };
    const events = (assignments ?? [])
      .map((a) => {
        const jobs = a.jobs as unknown as JobShape | JobShape[] | null;
        const job = Array.isArray(jobs) ? jobs[0] : jobs;
        if (!job) return null;
        if (job.status === "abgeschlossen" || job.status === "storniert") return null;
        if (!job.start_date) return null;
        if (new Date(job.start_date) < today) return null;
        const loc = Array.isArray(job.locations) ? job.locations[0] : job.locations;
        return {
          id: job.id,
          title: job.title,
          job_number: job.job_number,
          start_date: job.start_date,
          end_date: job.end_date,
          location_name: loc?.name ?? null,
          role_on_job: a.role_on_job ?? null,
        } as AssignedEvent;
      })
      .filter((e): e is AssignedEvent => e !== null)
      .sort((a, b) => (a.start_date! > b.start_date! ? 1 : -1))
      .slice(0, 5);
    setMyEvents(events);

    // My open todos
    const { data: todos, count: tCount } = await supabase
      .from("todos")
      .select("id, title, due_date, priority", { count: "exact" })
      .eq("assigned_to", user.id)
      .neq("status", "completed")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(3);
    setMyTodos((todos as MyTodo[]) ?? []);
    setTodoCount(tCount ?? 0);

    // Reports due: jobs I worked (have time entries) that are completed/in_arbeit
    // and have no service_report by me
    const { data: workedJobs } = await supabase
      .from("time_entries")
      .select("job_id, jobs(id, title, end_date, status)")
      .eq("profile_id", user.id)
      .not("job_id", "is", null)
      .not("clock_out", "is", null);

    const workedJobIds = new Set<string>();
    type WorkedJob = { title: string; end_date: string | null; status: string };
    const workedJobsMap = new Map<string, WorkedJob>();
    for (const we of workedJobs ?? []) {
      const raw = we.jobs as unknown as WorkedJob | WorkedJob[] | null;
      const j = Array.isArray(raw) ? raw[0] : raw;
      if (j && we.job_id) {
        workedJobIds.add(we.job_id);
        workedJobsMap.set(we.job_id, j);
      }
    }

    if (workedJobIds.size > 0) {
      const { data: existingReports } = await supabase
        .from("service_reports")
        .select("job_id")
        .eq("created_by", user.id)
        .in("job_id", Array.from(workedJobIds));
      const reportedJobIds = new Set((existingReports ?? []).map((r) => r.job_id));
      const due: ReportDue[] = [];
      for (const jobId of workedJobIds) {
        if (!reportedJobIds.has(jobId)) {
          const j = workedJobsMap.get(jobId)!;
          if (j.status === "abgeschlossen") {
            due.push({ job_id: jobId, title: j.title, end_date: j.end_date });
          }
        }
      }
      setReportsDue(due.slice(0, 5));
    }

    // Admin extras
    if (profile?.role === "admin") {
      const [anfrRes, todayJobsRes, weekJobsRes] = await Promise.all([
        supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", "anfrage")
          .eq("request_step", 1)
          .neq("is_deleted", true),
        supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .gte("start_date", todayIso)
          .lt("start_date", new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString()),
        supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .gte("start_date", todayIso)
          .lt("start_date", weekEnd.toISOString()),
      ]);
      setAdminStats({
        neueAnfragen: anfrRes.count ?? 0,
        eventsHeute: todayJobsRes.count ?? 0,
        eventsDieseWoche: weekJobsRes.count ?? 0,
      });
    }

    setLoading(false);
  }

  async function handleClockOut() {
    if (!openEntry) return;
    const { error } = await supabase
      .from("time_entries")
      .update({ clock_out: new Date().toISOString() })
      .eq("id", openEntry.id);
    if (error) {
      toast.error("Fehler beim Ausstempeln");
      return;
    }
    toast.success("Ausgestempelt");
    setOpenEntry(null);
  }

  async function handleClockIn() {
    const { data, error } = await supabase
      .from("time_entries")
      .insert({ profile_id: userId, clock_in: new Date().toISOString() })
      .select("id, clock_in")
      .single();
    if (error || !data) {
      toast.error("Fehler beim Einstempeln");
      return;
    }
    toast.success("Eingestempelt");
    setOpenEntry({ id: data.id, job_id: null, clock_in: data.clock_in, job_title: null });
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-40 rounded bg-muted animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-40 rounded-xl bg-muted animate-pulse" />
          <div className="h-40 rounded-xl bg-muted animate-pulse" />
          <div className="h-40 rounded-xl bg-muted animate-pulse" />
          <div className="h-40 rounded-xl bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          Hallo {userName || "👋"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {new Date().toLocaleDateString("de-CH", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Time clock */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pause className="h-4 w-4 text-muted-foreground" />
              Zeiterfassung
            </CardTitle>
          </CardHeader>
          <CardContent>
            {openEntry ? (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Aktiv seit</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {new Date(openEntry.clock_in).toLocaleTimeString("de-CH", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {openEntry.job_title && (
                    <p className="text-xs text-muted-foreground mt-1">
                      auf: {openEntry.job_title}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleClockOut}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium rounded-xl ring-1 ring-foreground/10 bg-card text-red-700 dark:text-red-300 hover:bg-foreground/[0.03] transition-all"
                >
                  <Pause className="h-4 w-4" />
                  Ausstempeln
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Du bist aktuell nicht eingestempelt.
                </p>
                <button
                  type="button"
                  onClick={handleClockIn}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium rounded-xl ring-1 ring-foreground/10 bg-card text-green-700 dark:text-green-300 hover:bg-foreground/[0.03] transition-all"
                >
                  <Play className="h-4 w-4" />
                  Einstempeln
                </button>
                <Link
                  href="/zeiterfassung"
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  Verlauf ansehen <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* My next events */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Meine nächsten Events
              </span>
              <Link
                href="/auftraege"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Alle ansehen
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {myEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine kommenden Events. Genieße die Pause! ☕
              </p>
            ) : (
              <ul className="space-y-2">
                {myEvents.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/auftraege/${e.id}`}
                      className="block rounded-lg border p-3 hover:bg-muted/50 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{e.title}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                            <span>
                              {e.start_date &&
                                new Date(e.start_date).toLocaleDateString("de-CH", {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "short",
                                })}
                            </span>
                            {e.location_name && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {e.location_name}
                              </span>
                            )}
                            {e.role_on_job && <span>· {e.role_on_job}</span>}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* My todos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-muted-foreground" />
                Meine offenen Todos {todoCount > 0 && `(${todoCount})`}
              </span>
              <Link
                href="/todos"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Alle ansehen
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {myTodos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine offenen Todos. 🎉
              </p>
            ) : (
              <ul className="space-y-1.5">
                {myTodos.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 text-sm">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-foreground/40 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{t.title}</span>
                      {t.due_date && (
                        <span className="text-xs text-muted-foreground">
                          fällig{" "}
                          {new Date(t.due_date).toLocaleDateString("de-CH", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Reports due */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Rapporte ausstehend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reportsDue.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Alle Rapporte sind erledigt. 👌
              </p>
            ) : (
              <ul className="space-y-2">
                {reportsDue.map((r) => (
                  <li key={r.job_id}>
                    <Link
                      href={`/rapporte/neu?job=${r.job_id}`}
                      className="block rounded-lg border p-2.5 hover:bg-muted/50 transition"
                    >
                      <p className="text-sm font-medium truncate">{r.title}</p>
                      {r.end_date && (
                        <p className="text-xs text-muted-foreground">
                          Event-Ende:{" "}
                          {new Date(r.end_date).toLocaleDateString("de-CH", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Admin-only stats */}
      {isAdmin && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Übersicht (Admin)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link href="/auftraege">
              <Card className="hover:bg-muted/30 transition cursor-pointer">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Neue Vermietentwürfe</p>
                      <p className="text-2xl font-bold mt-1">
                        {adminStats.neueAnfragen}
                      </p>
                    </div>
                    <Inbox className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/kalender">
              <Card className="hover:bg-muted/30 transition cursor-pointer">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Events heute</p>
                      <p className="text-2xl font-bold mt-1">
                        {adminStats.eventsHeute}
                      </p>
                    </div>
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/auftraege">
              <Card className="hover:bg-muted/30 transition cursor-pointer">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Events diese Woche
                      </p>
                      <p className="text-2xl font-bold mt-1">
                        {adminStats.eventsDieseWoche}
                      </p>
                    </div>
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
