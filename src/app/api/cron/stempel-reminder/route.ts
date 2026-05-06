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
 * Performance: alles via Single-RPC `get_stempel_reminder_candidates(cutoff)`
 * + Bulk-INSERT. Vorher N+1 (3 Queries pro offenem Stempel) → bei 100 MA
 * mit 50 offenen Stempeln × 48 Runs/Tag waeren das 21k+ Queries; jetzt
 * 2 Queries pro Run, scaling-stabil.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { logError } from "@/lib/log";

export const dynamic = "force-dynamic";

interface ReminderCandidate {
  entry_id: string;
  user_id: string;
  job_id: string;
  latest_end: string;
  job_number: number | null;
  job_title: string | null;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET fehlt in der Server-Config" }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  // Single-Query-RPC: liefert nur die Kandidaten die wirklich erinnert
  // werden muessen — Termin-Ende > 2h vorbei UND noch kein Reminder gesetzt.
  const { data, error } = await supabase.rpc("get_stempel_reminder_candidates", { cutoff });
  if (error) {
    logError("cron.stempel-reminder.rpc", error);
    return NextResponse.json({ error: "RPC fehlgeschlagen" }, { status: 500 });
  }

  const candidates = (data ?? []) as ReminderCandidate[];
  if (candidates.length === 0) {
    return NextResponse.json({ success: true, sent: 0 });
  }

  // Bulk-INSERT — ein Roundtrip statt einer pro Eintrag.
  const rows = candidates.map((c) => {
    const jobLabel = c.job_number ? `INT-${c.job_number}` : (c.job_title ?? "Auftrag");
    const endStr = new Date(c.latest_end).toLocaleString("de-CH", {
      timeZone: "Europe/Zurich",
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
    return {
      user_id: c.user_id,
      type: "stempel_reminder" as const,
      title: `Stempeluhr läuft noch: ${jobLabel}`,
      message: `Termin endete ${endStr} — bitte ausstempeln falls die Arbeit fertig ist.`,
      link: "/stempel",
      resource_type: "time_entry",
      resource_id: c.entry_id,
    };
  });

  const { error: insertErr } = await supabase.from("notifications").insert(rows);
  if (insertErr) {
    logError("cron.stempel-reminder.insert", insertErr, { count: rows.length });
    return NextResponse.json({ error: "Bulk-Insert fehlgeschlagen" }, { status: 500 });
  }

  return NextResponse.json({ success: true, sent: rows.length });
}
