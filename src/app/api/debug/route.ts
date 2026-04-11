import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createAdminClient();

  const now = new Date();
  const monday = new Date(now);
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
  monday.setDate(now.getDate() - dayOfWeek);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const startDate = monday.toISOString().split("T")[0];
  const endDate = sunday.toISOString().split("T")[0];

  const [appts, events, profiles, assignments] = await Promise.all([
    supabase.from("job_appointments").select("id, title, start_time, end_time, assigned_to, job_id, is_done"),
    supabase.from("calendar_events").select("id, title, start_time, end_time, profile_id"),
    supabase.from("profiles").select("id, full_name, email"),
    supabase.from("job_assignments").select("profile_id, job_id"),
  ]);

  // Also check what the team page query returns
  const weekAppts = await supabase
    .from("job_appointments")
    .select("assigned_to, title, start_time, end_time, is_done, job_id, job:jobs(title)")
    .gte("start_time", startDate + "T00:00:00")
    .lte("start_time", endDate + "T23:59:59");

  return NextResponse.json({
    dateRange: { startDate, endDate },
    appointments: appts.data,
    calendarEvents: events.data,
    profiles: profiles.data,
    jobAssignments: assignments.data,
    weekAppointments: weekAppts.data,
  });
}
