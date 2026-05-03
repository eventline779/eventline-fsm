/**
 * Stempel-Reminder — laeuft alle 30 Minuten via Vercel Cron.
 *
 * Logik: fuer jeden offenen time_entry (clock_out IS NULL) der mit einem
 * Auftrag verknuepft ist, schaut wann der LETZTE job_appointment auf
 * diesem Auftrag zu Ende war. Wenn der Termin schon mehr als 2h vorbei
 * ist und wir noch nicht erinnert haben → in-app Notification.
 *
 * Der Cut-off von 2h ist Leo's Vorgabe — nicht starr 18:00, sondern
 * "termingebunden": wer um 14h einen Termin bis 16h hat, kriegt um 18h
 * den Reminder. Wer nachts arbeitet, kriegt den Reminder nachts.
 *
 * Dedup: pro time_entry hoechstens eine Reminder-Notification (geprueft
 * via notifications.resource_type='time_entry' + resource_id).
 *
 * Auftrag ohne Termine → kein Reminder. Auftrag mit Termin in der
 * Zukunft (oder noch nicht 2h vorbei) → kein Reminder.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { logError } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Cron-Secret HARD-PFLICHT — siehe reminders/route.ts. Wenn ENV fehlt,
  // 503 statt durchlassen.
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET fehlt in der Server-Config" }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const { data: openEntries, error: entriesErr } = await supabase
    .from("time_entries")
    .select("id, user_id, job_id, clock_in")
    .is("clock_out", null)
    .not("job_id", "is", null);

  if (entriesErr) {
    logError("cron.stempel-reminder.entries", entriesErr);
    return NextResponse.json({ error: "Konnte time_entries nicht laden" }, { status: 500 });
  }

  if (!openEntries || openEntries.length === 0) {
    return NextResponse.json({ success: true, sent: 0, message: "Keine offenen Stempel" });
  }

  const sent: string[] = [];
  const skipped: string[] = [];

  for (const entry of openEntries) {
    if (!entry.job_id) continue;

    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("resource_type", "time_entry")
      .eq("resource_id", entry.id)
      .eq("type", "stempel_reminder")
      .limit(1)
      .maybeSingle();

    if (existing) {
      skipped.push(`${entry.id}: bereits erinnert`);
      continue;
    }

    const { data: appts } = await supabase
      .from("job_appointments")
      .select("end_time")
      .eq("job_id", entry.job_id)
      .not("end_time", "is", null)
      .order("end_time", { ascending: false })
      .limit(1);

    const latestEnd = appts?.[0]?.end_time ? new Date(appts[0].end_time) : null;
    if (!latestEnd) {
      skipped.push(`${entry.id}: kein Termin auf Auftrag`);
      continue;
    }

    if (latestEnd > twoHoursAgo) {
      skipped.push(`${entry.id}: Termin endete erst ${latestEnd.toISOString()} — noch keine 2h`);
      continue;
    }

    const { data: job } = await supabase
      .from("jobs")
      .select("job_number, title")
      .eq("id", entry.job_id)
      .maybeSingle();

    const jobLabel = job?.job_number ? `INT-${job.job_number}` : (job?.title ?? "Auftrag");
    const endStr = latestEnd.toLocaleString("de-CH", {
      timeZone: "Europe/Zurich",
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });

    const { error: notifErr } = await supabase.from("notifications").insert({
      user_id: entry.user_id,
      type: "stempel_reminder",
      title: `Stempeluhr läuft noch: ${jobLabel}`,
      message: `Termin endete ${endStr} — bitte ausstempeln falls die Arbeit fertig ist.`,
      link: "/stempel",
      resource_type: "time_entry",
      resource_id: entry.id,
    });

    if (notifErr) {
      logError("cron.stempel-reminder.insert", notifErr, { entryId: entry.id });
      skipped.push(`${entry.id}: insert-Fehler`);
      continue;
    }

    sent.push(`${entry.user_id} → ${jobLabel} (Termin-Ende ${endStr})`);
  }

  return NextResponse.json({
    success: true,
    sent: sent.length,
    skipped: skipped.length,
    details: { sent, skipped },
  });
}
