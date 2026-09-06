/**
 * Job-Drafts-Auto-Archiv — laeuft taeglich um 03:00 via Vercel Cron.
 *
 * Soft-geloeschte Drafts (is_deleted = true) werden nach 30 Tagen
 * Inaktivitaet mit archived_at markiert (Soft-Archive, KEIN Purge).
 * Live-Queries koennen sie so sauber ausblenden.
 *
 * SQL-Function `archive_stale_job_drafts()` lebt in Migration 216
 * und liefert die Anzahl archivierter Zeilen als integer zurueck.
 *
 * Authorization wie andere Crons: Bearer CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET fehlt" }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("archive_stale_job_drafts");
  if (error) {
    logError("cron.job-drafts-archive", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const archived = typeof data === "number" ? data : Number(data ?? 0);
  return NextResponse.json({ archived });
}
