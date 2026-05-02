// POST /api/admin/users — neuen User anlegen.
// Flow: Admin gibt Email + Name + Rolle ein → Auth-User wird erstellt
// (mit Zufalls-Passwort, das der User nie sieht), Profil-Row wird angelegt,
// dann wird eine Reset-Mail an den User geschickt damit er sich selbst
// ein Passwort setzt. Der Reset-Link landet auf /passwort-reset.

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Resend } from "resend";
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

  // Pre-Check: existiert die Email schon? profiles.email hat einen
  // UNIQUE-Index, der "Wahrheits-Quelle" fuer "User existiert" ist.
  // Vorher ohne den Check gab der Auth-Trigger einen cryptic "Internal
  // Server Error" weil der INSERT in profiles wegen email-unique scheiterte.
  const { data: existing } = await admin
    .from("profiles")
    .select("id, email, is_active")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      {
        success: false,
        error: `Es gibt bereits einen Benutzer mit Email ${email}${existing.is_active ? "" : " (deaktiviert)"}. Falls Passwort-Reset gewünscht, nutze den "Passwort zurücksetzen"-Knopf in der User-Liste.`,
      },
      { status: 400 },
    );
  }

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

  // 3. Setup-Mail mit Reset-Link via Resend — Supabase's Default-Mailer
  //    ist unzuverlaessig (Rate-Limit, Spam-Filter). Wir generieren den
  //    Recovery-Link via Auth-Admin-API und schicken die Mail dann selbst
  //    ueber Resend, das die App eh schon fuer Termin-Mails nutzt.
  await sendSetupMail({ supabaseUrl, serviceKey, email, fullName: full_name });

  return NextResponse.json({ success: true, user_id: created.id });
  } catch (err) {
    // Statt generic 500 → konkrete Meldung zurueck. Hilft beim Debugging
    // von Edge-Cases (Service-Role-Key falsch, Trigger-Konflikte, etc.)
    const message = err instanceof Error ? err.message : "Unbekannter Fehler beim Anlegen";
    logError("admin.users.create.exception", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// Generiert via Auth-Admin-API einen Recovery-Link und schickt eine
// Setup-Mail via Resend (zuverlaessiger als Supabase's Default-Mailer).
// Bei Fehler nur loggen — User ist im Auth-System schon angelegt, der
// Admin kann den Reset bei Bedarf ueber den "Passwort zuruecksetzen"-
// Button erneut ausloesen.
export async function sendSetupMail(opts: {
  supabaseUrl: string;
  serviceKey: string;
  email: string;
  fullName: string;
}): Promise<{ success: boolean; error?: string }> {
  const { supabaseUrl, serviceKey, email, fullName } = opts;
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    logError("admin.users.setupmail.no-resend-key", null, { email });
    return { success: false, error: "RESEND_API_KEY fehlt" };
  }

  // Recovery-Link generieren via Auth-Admin-API (direkter fetch).
  const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      type: "recovery",
      email,
      options: { redirect_to: appUrl("/passwort-reset") },
    }),
  });
  if (!linkRes.ok) {
    const body = await linkRes.text().catch(() => "");
    logError("admin.users.setupmail.link", { status: linkRes.status, body }, { email });
    return { success: false, error: `Link-Generation fehlgeschlagen: ${body}` };
  }
  const linkData = await linkRes.json() as {
    properties?: { action_link?: string };
    action_link?: string;
  };
  const actionLink = linkData.properties?.action_link ?? linkData.action_link;
  if (!actionLink) {
    logError("admin.users.setupmail.no-link", linkData, { email });
    return { success: false, error: "Kein action_link in der Antwort" };
  }

  // Mail ueber Resend schicken — gleiche Optik wie restliche App-Mails.
  const resend = new Resend(resendKey);
  try {
    await resend.emails.send({
      from: "EVENTLINE FSM <noreply@eventline-basel.com>",
      to: email,
      subject: "Willkommen bei EVENTLINE — Passwort setzen",
      html: `
        <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto">
          <div style="background:#1a1a1a;padding:20px 24px;border-radius:12px 12px 0 0">
            <h2 style="color:white;margin:0;font-size:16px">EVENTLINE GmbH</h2>
          </div>
          <div style="background:white;padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
            <p style="margin:0 0 12px">Hallo ${fullName},</p>
            <p style="margin:0 0 16px">Ein Admin hat dich bei EVENTLINE FSM hinzugefügt. Klicke auf den Button um dein Passwort zu setzen und dich einzuloggen:</p>
            <p style="margin:0 0 16px;text-align:center">
              <a href="${actionLink}" style="display:inline-block;background:#dc2626;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Passwort setzen</a>
            </p>
            <p style="margin:0 0 8px;color:#999;font-size:13px">Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:</p>
            <p style="margin:0 0 16px;color:#666;font-size:12px;word-break:break-all">${actionLink}</p>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
            <p style="margin:0;color:#bbb;font-size:11px">EVENTLINE GmbH · St. Jakobs-Strasse 200 · CH-4052 Basel</p>
          </div>
        </div>
      `,
    });
    return { success: true };
  } catch (err) {
    logError("admin.users.setupmail.send", err, { email });
    return { success: false, error: err instanceof Error ? err.message : "Resend-Fehler" };
  }
}
