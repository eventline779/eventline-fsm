/**
 * iCal-Feed (RFC 5545) — Aufträge + Termine als abonnierbarer Kalender.
 * Google Calendar / Apple Calendar / Outlook etc koennen via "Add by URL"
 * den Eventline-Kalender abonnieren und automatisch synchronisieren.
 *
 * Token-basierter Zugang: jeder User hat seinen persoenlichen
 * profiles.calendar_feed_token (uuid). Dieser kommt als ?token=... in
 * der URL — der Endpoint mappt zurueck auf den User und zeigt nur was
 * der User auch in der App sehen darf:
 *   - Aufträge in denen er Project-Lead oder via job_assignments dabei ist
 *   - Termine bei denen er als assigned_to gelistet ist ODER auf einem
 *     Auftrag wo er drauf ist
 *
 * Admins sehen auch hier alles. Normale Mitarbeiter sehen nur ihre
 * eigenen Auftraege/Termine.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";

// Cache fuer 10 Minuten — Google Calendar pollt alle paar Stunden, das
// reicht. So muss nicht jeder Poll die DB neu durchforsten. Aber:
// pro User unterschiedlicher Inhalt → Cache muss vom Token abhaengen.
// Cache-Control auf 'private' damit kein Shared-CDN das eine User-
// Antwort an einen anderen ausliefert.
export const revalidate = 600;
export const dynamic = "force-dynamic";

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatDate(d: Date, allDay: boolean): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  if (allDay) return `${y}${m}${day}`;
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return new NextResponse("Token fehlt — Link aus den Einstellungen verwenden", { status: 401 });
  }

  const supabase = createAdminClient();

  // Token → User. Nur aktive Profile akzeptieren — deaktivierte User
  // sollen keinen Feed mehr bekommen.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, is_active, full_name")
    .eq("calendar_feed_token", token)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    return new NextResponse("Token ungueltig", { status: 401 });
  }

  const userId = profile.id;
  const isAdmin = profile.role === "admin";

  // Welche Job-IDs darf der User sehen?
  // - Admin: alle nicht-geloeschten, nicht-stornierten
  // - Mitarbeiter: alle bei denen er project_lead_id ist ODER via
  //   job_assignments verknuepft.
  let allowedJobIds: Set<string> | null = null;
  if (!isAdmin) {
    const [{ data: leadJobs }, { data: assignedJobs }] = await Promise.all([
      supabase.from("jobs").select("id").eq("project_lead_id", userId).neq("is_deleted", true),
      supabase.from("job_assignments").select("job_id").eq("profile_id", userId),
    ]);
    allowedJobIds = new Set<string>();
    for (const j of leadJobs ?? []) allowedJobIds.add(j.id);
    for (const a of assignedJobs ?? []) if (a.job_id) allowedJobIds.add(a.job_id);
  }

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, job_number, title, status, start_date, end_date, customer:customers(name), location:locations(name)")
    .neq("is_deleted", true)
    .neq("status", "storniert")
    .not("start_date", "is", null);

  const filteredJobs = (jobs ?? []).filter((j) => allowedJobIds === null || allowedJobIds.has(j.id));

  const { data: appts } = await supabase
    .from("job_appointments")
    .select("id, title, start_time, end_time, assigned_to, job:jobs(id, status, job_number, title, is_deleted)")
    .not("start_time", "is", null);

  // Termine: User sieht den Termin wenn er assigned_to ist ODER der
  // zugehoerige Job in seiner allowed-Liste ist (Admin sieht alles).
  const filteredAppts = (appts ?? []).filter((a) => {
    if (isAdmin) return true;
    if (a.assigned_to === userId) return true;
    const job = Array.isArray(a.job) ? a.job[0] : a.job;
    if (!job) return false;
    return allowedJobIds!.has(job.id);
  });

  const nowStr = formatDate(new Date(), false);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Eventline FSM//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Eventline — ${escapeICS(profile.full_name ?? "Mein Kalender")}`,
    "X-WR-TIMEZONE:Europe/Zurich",
  ];

  for (const j of filteredJobs) {
    if (!j.start_date) continue;
    const start = new Date(j.start_date);
    const end = new Date(j.end_date ?? j.start_date);
    end.setUTCDate(end.getUTCDate() + 1);
    const cust = Array.isArray(j.customer) ? j.customer[0] : j.customer;
    const loc = Array.isArray(j.location) ? j.location[0] : j.location;
    const summary = j.job_number ? `INT-${j.job_number} | ${j.title}` : j.title;
    const description = [
      cust?.name && `Kunde: ${cust.name}`,
      loc?.name && `Standort: ${loc.name}`,
      `Status: ${j.status}`,
    ].filter(Boolean).join("\n");

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:job-${j.id}@eventline-basel.com`);
    lines.push(`DTSTAMP:${nowStr}`);
    lines.push(`DTSTART;VALUE=DATE:${formatDate(start, true)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDate(end, true)}`);
    lines.push(`SUMMARY:${escapeICS(summary)}`);
    if (description) lines.push(`DESCRIPTION:${escapeICS(description)}`);
    if (loc?.name) lines.push(`LOCATION:${escapeICS(loc.name)}`);
    lines.push("END:VEVENT");
  }

  for (const a of filteredAppts) {
    if (!a.start_time) continue;
    const job = Array.isArray(a.job) ? a.job[0] : a.job;
    if (job && (job.status === "storniert" || job.is_deleted)) continue;
    const start = new Date(a.start_time);
    const end = a.end_time ? new Date(a.end_time) : new Date(start.getTime() + 60 * 60 * 1000);
    const summary = job?.job_number
      ? `${a.title} (INT-${job.job_number})`
      : a.title;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:appt-${a.id}@eventline-basel.com`);
    lines.push(`DTSTAMP:${nowStr}`);
    lines.push(`DTSTART:${formatDate(start, false)}`);
    lines.push(`DTEND:${formatDate(end, false)}`);
    lines.push(`SUMMARY:${escapeICS(summary)}`);
    if (job?.title) lines.push(`DESCRIPTION:${escapeICS(job.title)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // private weil pro User unterschiedlich; max-age=600 fuer Browser/
      // App-Cache, kein s-maxage damit CDNs nichts shared cachen.
      "Cache-Control": "private, max-age=600",
    },
  });
}
