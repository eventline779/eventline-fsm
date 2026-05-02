import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";

export async function POST() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const supabase = createAdminClient();
  let fixed = 0;
  let shiftsCreated = 0;

  // 1. Fix appointments without assigned_to: set to job's project_lead_id
  const { data: unassigned } = await supabase
    .from("job_appointments")
    .select("id, job_id, title, start_time, end_time")
    .is("assigned_to", null);

  if (unassigned) {
    for (const appt of unassigned) {
      const { data: job } = await supabase
        .from("jobs")
        .select("project_lead_id")
        .eq("id", appt.job_id)
        .single();

      if (job?.project_lead_id) {
        await supabase
          .from("job_appointments")
          .update({ assigned_to: job.project_lead_id })
          .eq("id", appt.id);
        fixed++;
      }
    }
  }

  // 2. Create calendar_events (shifts) for all appointments that don't have one yet
  const { data: allAppts } = await supabase
    .from("job_appointments")
    .select("id, title, start_time, end_time, assigned_to, job:jobs(title)");

  if (allAppts) {
    for (const appt of allAppts as any[]) {
      if (!appt.assigned_to) continue;

      const dateStr = appt.start_time.split("T")[0];
      const jobTitle = `Auftrag: ${appt.title} (${appt.job?.title || ""})`;

      // Check if shift already exists for this person on this day
      const { data: existing } = await supabase
        .from("calendar_events")
        .select("id")
        .eq("profile_id", appt.assigned_to)
        .gte("start_time", dateStr + "T00:00:00")
        .lte("start_time", dateStr + "T23:59:59")
        .ilike("title", `%${appt.title}%`)
        .maybeSingle();

      if (!existing) {
        await supabase.from("calendar_events").insert({
          title: jobTitle,
          start_time: appt.start_time,
          end_time: appt.end_time || appt.start_time,
          profile_id: appt.assigned_to,
          color: "#3b82f6",
          created_by: appt.assigned_to,
          all_day: false,
        });
        shiftsCreated++;
      }
    }
  }

  return NextResponse.json({ success: true, fixed, shiftsCreated });
}
