import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

const CALENDAR_TOKEN = "eventline-cal-5225";

function escape(text: string): string {
  return (text || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function formatDateUTC(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function formatDateOnly(dateStr: string): string {
  return dateStr.split("T")[0].replace(/-/g, "");
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (token !== CALENDAR_TOKEN) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();

  const [jobsRes, rentalsRes, apptsRes] = await Promise.all([
    supabase.from("jobs").select("id, job_number, title, description, start_date, end_date, customer:customers(name), location:locations(name, address_street, address_zip, address_city)").neq("is_deleted", true).not("start_date", "is", null),
    supabase.from("rental_requests").select("id, event_date, event_end_date, event_type, customer:customers(name), location:locations(name, address_street, address_zip, address_city)").not("event_date", "is", null).neq("status", "abgelehnt"),
    supabase.from("job_appointments").select("id, title, description, start_time, end_time, assignee:profiles!assigned_to(full_name), job:jobs(title, job_number)"),
  ]);

  const events: string[] = [];
  const now = formatDateUTC(new Date());

  // Aufträge
  if (jobsRes.data) {
    for (const j of jobsRes.data as any[]) {
      const start = formatDateOnly(j.start_date);
      const endDate = j.end_date ? new Date(j.end_date) : new Date(j.start_date);
      endDate.setDate(endDate.getDate() + 1); // iCal: Enddatum exklusiv
      const end = endDate.toISOString().split("T")[0].replace(/-/g, "");
      const cust = j.customer?.name || "";
      const loc = j.location?.name || "";
      const locAddress = j.location ? [j.location.address_street, `${j.location.address_zip || ""} ${j.location.address_city || ""}`].filter((s) => s?.trim()).join(", ") : "";
      events.push([
        "BEGIN:VEVENT",
        `UID:job-${j.id}@eventline-basel.com`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${escape(`INT-${j.job_number} · ${j.title}`)}`,
        `DESCRIPTION:${escape([cust, j.description].filter(Boolean).join(" — "))}`,
        loc ? `LOCATION:${escape([loc, locAddress].filter(Boolean).join(", "))}` : "",
        "CATEGORIES:Auftrag",
        "END:VEVENT",
      ].filter(Boolean).join("\r\n"));
    }
  }

  // Vermietungen
  if (rentalsRes.data) {
    for (const r of rentalsRes.data as any[]) {
      const start = formatDateOnly(r.event_date);
      const endDate = r.event_end_date ? new Date(r.event_end_date) : new Date(r.event_date);
      endDate.setDate(endDate.getDate() + 1);
      const end = endDate.toISOString().split("T")[0].replace(/-/g, "");
      const cust = r.customer?.name || "";
      const loc = r.location?.name || "";
      const locAddress = r.location ? [r.location.address_street, `${r.location.address_zip || ""} ${r.location.address_city || ""}`].filter((s) => s?.trim()).join(", ") : "";
      events.push([
        "BEGIN:VEVENT",
        `UID:rental-${r.id}@eventline-basel.com`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${escape(`Vermietung: ${cust}`)}`,
        `DESCRIPTION:${escape([r.event_type, cust].filter(Boolean).join(" — "))}`,
        loc ? `LOCATION:${escape([loc, locAddress].filter(Boolean).join(", "))}` : "",
        "CATEGORIES:Vermietung",
        "END:VEVENT",
      ].filter(Boolean).join("\r\n"));
    }
  }

  // Termine
  if (apptsRes.data) {
    for (const a of apptsRes.data as any[]) {
      const start = formatDateUTC(new Date(a.start_time));
      const end = a.end_time ? formatDateUTC(new Date(a.end_time)) : start;
      const assignee = a.assignee?.full_name || "";
      const jobTitle = a.job?.title ? `INT-${a.job.job_number} · ${a.job.title}` : "";
      events.push([
        "BEGIN:VEVENT",
        `UID:appt-${a.id}@eventline-basel.com`,
        `DTSTAMP:${now}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${escape(a.title)}`,
        `DESCRIPTION:${escape([assignee ? `Zugewiesen: ${assignee}` : "", jobTitle, a.description].filter(Boolean).join(" — "))}`,
        "CATEGORIES:Termin",
        "END:VEVENT",
      ].filter(Boolean).join("\r\n"));
    }
  }

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Eventline FSM//Calendar//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:EVENTLINE FSM",
    "X-WR-TIMEZONE:Europe/Zurich",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="eventline.ics"',
      "Cache-Control": "public, max-age=300",
    },
  });
}
