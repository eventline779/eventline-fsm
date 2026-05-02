// POST /api/admin/users — neuen User anlegen.
// Flow: Admin gibt Email + Name + Rolle ein → Auth-User wird erstellt
// (mit Zufalls-Passwort, das der User nie sieht), Profil-Row wird angelegt,
// dann wird eine Reset-Mail an den User geschickt damit er sich selbst
// ein Passwort setzt. Der Reset-Link landet auf /passwort-reset.

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";
import { appUrl } from "@/lib/app-url";
import { logError } from "@/lib/log";

export async function POST(request: Request) {
  try {
    // Env-Vars upfront pruefen damit ein fehlender Key sofort eine
    // klare Meldung liefert statt einem cryptic Internal Server Error.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      logError("admin.users.create.env", { hasUrl: !!supabaseUrl, hasKey: !!serviceKey });
      return NextResponse.json(
        { success: false, error: "Server-Konfiguration unvollstaendig (SUPABASE-ENV fehlt)" },
        { status: 500 },
      );
    }

  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ success: false, error: "Ungueltiger Body" }, { status: 400 });

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const full_name = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const requestedRole = typeof body.role === "string" ? body.role : "techniker";

  if (!email || !full_name) {
    return NextResponse.json({ success: false, error: "Email und Name sind Pflicht" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ success: false, error: "Ungueltige Email-Adresse" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Rolle muss in der roles-Tabelle existieren — sonst kann der User
  // spaeter nicht aufgeloest werden.
  const { data: roleRow } = await admin.from("roles").select("slug").eq("slug", requestedRole).single();
  const role = roleRow?.slug ?? "techniker";

  // 1. Auth-User anlegen. Wir umgehen das supabase-js SDK und rufen die
  //    Auth-Admin-API direkt per fetch — das SDK ist im Next.js-Server-
  //    Runtime mit "AuthApiError: Internal Server Error" gescheitert,
  //    obwohl derselbe Payload direkt per curl gegen Supabase funktioniert.
  //    Direkter Fetch ist robuster, weniger Schichten dazwischen.
  //    email_confirm:true → keine Bestaetigungsmail; Random-Passwort weil
  //    der User's eh per Reset-Link selbst setzt.
  //    WICHTIG: full_name + role landen via user_metadata in der
  //    raw_user_meta_data — der Postgres-Trigger handle_new_user() liest
  //    das aus und legt damit selbst die profiles-Row an.
  const tempPassword = randomUUID() + "-" + randomUUID();
  const authRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name, role },
    }),
  });

  if (!authRes.ok) {
    // Body als Text holen damit auch Non-JSON-Antworten lesbar sind.
    const rawBody = await authRes.text().catch(() => "");
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(rawBody) as Record<string, unknown>; } catch {}
    const msg = (parsed.msg as string | undefined)
            ?? (parsed.message as string | undefined)
            ?? (parsed.error_description as string | undefined)
            ?? rawBody
            ?? "User-Erstellung fehlgeschlagen";
    const friendlier = /already (been )?registered|already exists|duplicate|email_exists/i.test(msg)
      ? `Es gibt bereits einen Benutzer mit Email ${email}`
      : msg;
    logError("admin.users.create.auth", { status: authRes.status, body: rawBody }, { email });
    // Debug-Info im Response damit wir sehen was Supabase sagt
    return NextResponse.json(
      { success: false, error: friendlier, debug: { status: authRes.status, supabase_body: parsed } },
      { status: 400 },
    );
  }

  const created = await authRes.json() as { id: string; email: string };

  // 2. Sicherheitshalber das Profil nachschaerfen — falls der Trigger
  //    die Rolle nicht uebernommen hat. Idempotent.
  const { error: profileErr } = await admin
    .from("profiles")
    .update({ role, full_name, is_active: true })
    .eq("id", created.id);
  if (profileErr) {
    // Cleanup falls Update fehlschlaegt — aber via direkten Auth-API-Call.
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${created.id}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    logError("admin.users.create.profile-update", profileErr, { email });
    return NextResponse.json({ success: false, error: profileErr.message }, { status: 500 });
  }

  // 3. Reset-Mail senden — User klickt drauf, landet auf /passwort-reset
  //    und setzt sich sein eigenes Passwort. Auch hier direkt per fetch
  //    (recover-Endpoint) — robuster als das SDK.
  const recoverRes = await fetch(`${supabaseUrl}/auth/v1/recover`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ email, redirect_to: appUrl("/passwort-reset") }),
  });
  if (!recoverRes.ok) {
    const errBody = await recoverRes.json().catch(() => ({}));
    logError("admin.users.create.reset", errBody, { email });
    // User ist angelegt — Admin kann nochmal "Passwort zuruecksetzen"
    // klicken um die Mail erneut zu schicken. Nur loggen, nicht abbrechen.
  }

  return NextResponse.json({ success: true, user_id: created.id });
  } catch (err) {
    // Statt generic 500 → konkrete Meldung zurueck. Hilft beim Debugging
    // von Edge-Cases (Service-Role-Key falsch, Trigger-Konflikte, etc.)
    const message = err instanceof Error ? err.message : "Unbekannter Fehler beim Anlegen";
    logError("admin.users.create.exception", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
