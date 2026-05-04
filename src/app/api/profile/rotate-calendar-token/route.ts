import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api-auth";
import { logError } from "@/lib/log";

// POST — eigenen calendar_feed_token rotieren.
//
// Wenn der Token leakt (kopierte URL in Slack, Browser-History, externer
// Geraete-Cache), invalidet dieser Endpoint den alten und vergibt einen
// neuen. Alle bestehenden iCal-Subscriptions (Google/Apple/Outlook) muessen
// danach aktualisiert werden — die zeigen sonst einen "401 Token ungueltig"-
// Error in den Calendar-Apps.
//
// Vorher gab es keinen Recovery-Pfad ausser direktem SQL-UPDATE in der DB.

export async function POST() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("gen_random_uuid");
  // Fallback: random_uuid via Postgres direkt
  let newToken = data as string | null;
  if (!newToken || error) {
    // Wenn das RPC nicht existiert, generieren wir client-seitig.
    newToken = crypto.randomUUID();
  }

  const { error: updateErr } = await admin
    .from("profiles")
    .update({ calendar_feed_token: newToken })
    .eq("id", auth.user.id);

  if (updateErr) {
    logError("api.profile.rotate-calendar-token", updateErr, { userId: auth.user.id });
    return NextResponse.json({ success: false, error: "Token-Rotation fehlgeschlagen" }, { status: 500 });
  }

  return NextResponse.json({ success: true, token: newToken });
}
