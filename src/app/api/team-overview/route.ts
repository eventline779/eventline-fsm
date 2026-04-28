import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

// Liefert Mitarbeiter-Uebersicht (Aufträge, Termine, Stunden) fuer einen
// gewaehlten Zeitraum. Zwei Modi:
//  - filter=woche|monat -> { profiles, data: { [profileId]: {...} } }
//  - filter=archiv      -> { archivedJobs: [...] }
//
// Frueher hatte die Implementation in der Inner-Loop O(N×M) Filter ueber alle
// Assignments/Termine/Time-Entries. Jetzt: einmal nach profile_id gruppieren,
// dann O(1) Lookup im Loop. Skaliert linear mit Mitarbeiterzahl.

interface JoinedJob {
  id: string;
  title: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  customer?: { name: string } | { name: string }[] | null;
}

interface AssignmentRow {
  profile_id: string;
  job: JoinedJob | null;
}

interface AppointmentRow {
  assigned_to: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  is_done: boolean;
  job_id: string | null;
  job?: { title: string } | { title: string }[] | null;
}

interface TimeEntryRow {
  profile_id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number | null;
}

interface LeadJobRow extends JoinedJob {
  project_lead_id: string;
}

interface PersonOverview {
  jobs: JoinedJob[];
  appointments: AppointmentRow[];
  hours: number;
  plannedHours: number;
}

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const filter = request.nextUrl.searchParams.get("filter") || "monat";
  const supabase = createAdminClient();

  const now = new Date();
  let startDate: string;
  let endDate: string;

  if (filter === "woche") {
    const dayOfWeek = (now.getDay() + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    startDate = monday.toLocaleDateString("sv-SE");
    endDate = sunday.toLocaleDateString("sv-SE");
  } else {
    startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString("sv-SE");
  }

  // Archiv-Pfad: vollstaendig separat, kein Profile-Mapping noetig.
  if (filter === "archiv") {
    const { data: archived } = await supabase
      .from("jobs")
      .select("id, title, job_number, status, start_date, end_date, customer:customers(name)")
      .in("status", ["abgeschlossen", "storniert"])
      .neq("is_deleted", true)
      .order("updated_at", { ascending: false })
      .limit(50);
    return NextResponse.json({ archivedJobs: archived || [] });
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .order("full_name");

  const [jobsRes, apptsRes, timeRes, leadJobsRes] = await Promise.all([
    supabase
      .from("job_assignments")
      .select("profile_id, job:jobs(id, title, status, start_date, end_date, customer:customers(name))"),
    supabase
      .from("job_appointments")
      .select("assigned_to, title, start_time, end_time, is_done, job_id, job:jobs(title)")
      .gte("start_time", startDate + "T00:00:00")
      .lte("start_time", endDate + "T23:59:59"),
    supabase
      .from("time_entries")
      .select("profile_id, clock_in, clock_out, break_minutes")
      .gte("clock_in", startDate + "T00:00:00")
      .lte("clock_in", endDate + "T23:59:59")
      .not("clock_out", "is", null),
    supabase
      .from("jobs")
      .select("id, title, status, start_date, end_date, project_lead_id, customer:customers(name)")
      .not("project_lead_id", "is", null),
  ]);

  // Pre-Gruppierung nach profile_id — ein Pass durch jede Liste, danach
  // O(1)-Lookup im Profile-Loop statt O(N×M) Filter-Pass.
  const jobsByProfile = new Map<string, JoinedJob[]>();
  const seenByProfile = new Map<string, Set<string>>();
  for (const row of (jobsRes.data ?? []) as unknown as AssignmentRow[]) {
    if (!row.job) continue;
    const arr = jobsByProfile.get(row.profile_id) ?? [];
    const seen = seenByProfile.get(row.profile_id) ?? new Set<string>();
    if (!seen.has(row.job.id)) {
      arr.push(row.job);
      seen.add(row.job.id);
      jobsByProfile.set(row.profile_id, arr);
      seenByProfile.set(row.profile_id, seen);
    }
  }
  for (const row of (leadJobsRes.data ?? []) as unknown as LeadJobRow[]) {
    if (!row.project_lead_id) continue;
    const arr = jobsByProfile.get(row.project_lead_id) ?? [];
    const seen = seenByProfile.get(row.project_lead_id) ?? new Set<string>();
    if (!seen.has(row.id)) {
      arr.push(row);
      seen.add(row.id);
      jobsByProfile.set(row.project_lead_id, arr);
      seenByProfile.set(row.project_lead_id, seen);
    }
  }

  const apptsByProfile = new Map<string, AppointmentRow[]>();
  for (const a of (apptsRes.data ?? []) as unknown as AppointmentRow[]) {
    const arr = apptsByProfile.get(a.assigned_to) ?? [];
    arr.push(a);
    apptsByProfile.set(a.assigned_to, arr);
  }

  const minutesByProfile = new Map<string, number>();
  for (const t of (timeRes.data ?? []) as unknown as TimeEntryRow[]) {
    if (!t.clock_out) continue;
    const min = (new Date(t.clock_out).getTime() - new Date(t.clock_in).getTime()) / 60000
      - (t.break_minutes ?? 0);
    minutesByProfile.set(t.profile_id, (minutesByProfile.get(t.profile_id) ?? 0) + min);
  }

  const result: Record<string, PersonOverview> = {};
  for (const p of profiles ?? []) {
    const personAppts = apptsByProfile.get(p.id) ?? [];
    let plannedMin = 0;
    for (const a of personAppts) {
      if (a.start_time && a.end_time) {
        plannedMin += (new Date(a.end_time).getTime() - new Date(a.start_time).getTime()) / 60000;
      }
    }
    result[p.id] = {
      jobs: jobsByProfile.get(p.id) ?? [],
      appointments: personAppts,
      hours: Math.round((minutesByProfile.get(p.id) ?? 0) / 60 * 10) / 10,
      plannedHours: Math.round(plannedMin / 60 * 10) / 10,
    };
  }

  return NextResponse.json({ profiles, data: result });
}
