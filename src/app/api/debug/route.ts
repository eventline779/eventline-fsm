import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const supabase = createAdminClient();

  const now = new Date();
  // Month range
  const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  // Exact same queries as TeamOverview
  const jobsRes = await supabase.from("job_assignments").select("profile_id, job:jobs(id, title, status, start_date, end_date, customer:customers(name))");
  const apptsRes = await supabase.from("job_appointments").select("assigned_to, title, start_time, end_time, is_done, job_id, job:jobs(title)").gte("start_time", startDate + "T00:00:00").lte("start_time", endDate + "T23:59:59");
  const leadJobs = await supabase.from("jobs").select("id, title, status, start_date, end_date, project_lead_id, customer:customers(name)").not("project_lead_id", "is", null);
  const profiles = await supabase.from("profiles").select("id, full_name, role");

  // Build result same as TeamOverview
  const result: Record<string, any> = {};
  for (const p of (profiles.data || []) as any[]) {
    const personJobs: any[] = [];
    const seenJobIds = new Set<string>();

    if (jobsRes.data) {
      for (const a of jobsRes.data as any[]) {
        if (a.profile_id === p.id && a.job && !seenJobIds.has(a.job.id)) {
          personJobs.push(a.job);
          seenJobIds.add(a.job.id);
        }
      }
    }
    if (leadJobs.data) {
      for (const j of leadJobs.data as any[]) {
        if (j.project_lead_id === p.id && !seenJobIds.has(j.id)) {
          personJobs.push(j);
          seenJobIds.add(j.id);
        }
      }
    }
    const personAppts = (apptsRes.data as any[] || []).filter((a: any) => a.assigned_to === p.id);

    result[p.full_name] = { jobs: personJobs.length, appointments: personAppts.length, jobDetails: personJobs, apptDetails: personAppts };
  }

  return NextResponse.json({
    dateRange: { startDate, endDate },
    jobsResError: jobsRes.error,
    apptsResError: apptsRes.error,
    jobsResCount: jobsRes.data?.length,
    apptsResCount: apptsRes.data?.length,
    leadJobsCount: leadJobs.data?.length,
    perPerson: result,
  });
}
