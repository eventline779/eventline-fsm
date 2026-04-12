import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
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

  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email, role").order("full_name");

  const [jobsRes, apptsRes, timeRes] = await Promise.all([
    supabase.from("job_assignments").select("profile_id, job:jobs(id, title, status, start_date, end_date, customer:customers(name))"),
    supabase.from("job_appointments").select("assigned_to, title, start_time, end_time, is_done, job_id, job:jobs(title)").gte("start_time", startDate + "T00:00:00").lte("start_time", endDate + "T23:59:59"),
    supabase.from("time_entries").select("profile_id, clock_in, clock_out, break_minutes").gte("clock_in", startDate + "T00:00:00").lte("clock_in", endDate + "T23:59:59").not("clock_out", "is", null),
  ]);

  const { data: leadJobs } = await supabase.from("jobs").select("id, title, status, start_date, end_date, project_lead_id, customer:customers(name)").not("project_lead_id", "is", null);

  const result: Record<string, { jobs: any[]; appointments: any[]; hours: number; plannedHours: number }> = {};

  for (const p of (profiles || []) as any[]) {
    const personJobs: any[] = [];
    const seenJobIds = new Set<string>();

    if (jobsRes.data) {
      for (const a of jobsRes.data as any[]) {
        if (a.profile_id === p.id && a.job && !seenJobIds.has((a.job as any).id)) {
          personJobs.push(a.job);
          seenJobIds.add((a.job as any).id);
        }
      }
    }

    if (leadJobs) {
      for (const j of leadJobs as any[]) {
        if (j.project_lead_id === p.id && !seenJobIds.has(j.id)) {
          personJobs.push(j);
          seenJobIds.add(j.id);
        }
      }
    }

    const personAppts = (apptsRes.data as any[] || []).filter((a: any) => a.assigned_to === p.id);

    // Geplante Stunden aus Terminen berechnen
    let plannedMin = 0;
    for (const a of personAppts) {
      if (a.start_time && a.end_time) {
        plannedMin += (new Date(a.end_time).getTime() - new Date(a.start_time).getTime()) / 60000;
      }
    }

    // Gestempelte Stunden
    let workedMin = 0;
    if (timeRes.data) {
      for (const t of timeRes.data as any[]) {
        if (t.profile_id === p.id && t.clock_out) {
          workedMin += (new Date(t.clock_out).getTime() - new Date(t.clock_in).getTime()) / 60000 - (t.break_minutes || 0);
        }
      }
    }

    result[p.id] = {
      jobs: personJobs,
      appointments: personAppts,
      hours: Math.round(workedMin / 60 * 10) / 10,
      plannedHours: Math.round(plannedMin / 60 * 10) / 10,
    };
  }

  return NextResponse.json({ profiles, data: result });
}
