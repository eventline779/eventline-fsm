/**
 * iCal-Feed (RFC 5545) — Aufträge + Termine als abonnierbarer Kalender.
 * Google Calendar / Apple Calendar / Outlook etc koennen via "Add by URL"
 * den Eventline-Kalender abonnieren und automatisch synchronisieren.
 *
 * Hinweis: Public Endpoint ohne Auth — externe Kalender-Clients koennen
 * keine Auth-Headers senden. Wer die URL hat sieht die Daten. Wenn das ein
 * Problem wird: Token-basierte Filterung pro User einbauen.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// Cache fuer 10 Minuten — Google Calendar pollt alle paar Stunden, das
// reicht. So muss nicht jeder Poll die DB neu durchforsten.
export const revalidate = 600;

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

export async function GET() {
  const supabase = createAdminClient();

  // Aufträge + Vermietungen — alle nicht-stornierten mit start_date
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, job_number, title, status, start_date, end_date, customer:customers(name), location:locations(name)")
    .neq("is_deleted", true)
    .neq("status", "storniert")
    .not("start_date", "is", null);

  // Termine
  const { data: appts } = await supabase
    .from("job_appointments")
    .select("id, title, start_time, end_time, job:jobs(id, status, job_number, title, is_deleted)")
    .not("start_time", "is", null);

  const now = formatDate(new Date(), false);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Eventline FSM//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Eventline",
    "X-WR-TIMEZONE:Europe/Zurich",
  ];

  for (const j of jobs ?? []) {
    if (!j.start_date) continue;
    const start = new Date(j.start_date);
    const end = new Date(j.end_date ?? j.start_date);
    // ICS DTEND ist exklusiv — fuer All-Day-Events 1 Tag drauf.
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
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;VALUE=DATE:${formatDate(start, true)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDate(end, true)}`);
    lines.push(`SUMMARY:${escapeICS(summary)}`);
    if (description) lines.push(`DESCRIPTION:${escapeICS(description)}`);
    if (loc?.name) lines.push(`LOCATION:${escapeICS(loc.name)}`);
    lines.push("END:VEVENT");
  }

  for (const a of appts ?? []) {
    if (!a.start_time) continue;
    const job = Array.isArray(a.job) ? a.job[0] : a.job;
    // Termine stornierter / geloeschter Auftraege ueberspringen
    if (job && (job.status === "storniert" || job.is_deleted)) continue;
    const start = new Date(a.start_time);
    const end = a.end_time ? new Date(a.end_time) : new Date(start.getTime() + 60 * 60 * 1000);
    const summary = job?.job_number
      ? `${a.title} (INT-${job.job_number})`
      : a.title;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:appt-${a.id}@eventline-basel.com`);
    lines.push(`DTSTAMP:${now}`);
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
      "Cache-Control": "public, max-age=600, s-maxage=600",
    },
  });
}
