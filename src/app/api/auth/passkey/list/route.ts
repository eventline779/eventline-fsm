/**
 * GET  /api/auth/passkey/list      → eigene Passkeys (Mein-Konto-Liste)
 * DELETE /api/auth/passkey/list?id=… → einen eigenen Passkey löschen
 *
 * RLS in der DB stellt sicher, dass ein User nur seine eigenen Passkeys
 * sieht/löscht — wir gehen bewusst NICHT über den Admin-Client, damit die
 * RLS-Policies (passkeys_select_own / passkeys_delete_own) aktiv sind.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_passkeys")
    .select("id, nickname, device_type, backed_up, transports, created_at, last_used_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, passkeys: data ?? [] });
}

export async function DELETE(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, error: "id fehlt" }, { status: 400 });
  }

  const supabase = await createClient();
  // RLS erledigt die "own"-Prüfung — kein weiteres user_id-Check hier nötig.
  const { error, count } = await supabase
    .from("user_passkeys")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ success: false, error: "Nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
