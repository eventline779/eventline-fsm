// POST /api/admin/users — neuen User anlegen.
// Flow: Admin gibt Email + Name + Rolle ein → Auth-User wird erstellt
// (mit Zufalls-Passwort, das der User nie sieht), Profil-Row wird angelegt,
// dann wird eine Reset-Mail an den User geschickt damit er sich selbst
// ein Passwort setzt. Der Reset-Link landet auf /passwort-reset.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";
import { appUrl } from "@/lib/app-url";
import { logError } from "@/lib/log";

export async function POST(request: Request) {
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

  // 1. Auth-User anlegen. email_confirm:true ueberspringt die Email-
  //    Bestaetigung. Random-Passwort weil's der User eh per Reset-Link
  //    selbst setzt. WICHTIG: full_name UND role landen via user_metadata
  //    in raw_user_meta_data — der Postgres-Trigger handle_new_user()
  //    feuert auf jedem auth.users-Insert und legt dann eigenstaendig
  //    eine profiles-Row mit diesen Werten an. Wuerden wir hier noch
  //    eine zweite profiles.insert() machen, gaebe es einen PK-Konflikt.
  const tempPassword = crypto.randomUUID() + "-" + crypto.randomUUID();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name, role },
  });
  if (createErr || !created.user) {
    return NextResponse.json(
      { success: false, error: createErr?.message ?? "User-Erstellung fehlgeschlagen" },
      { status: 400 },
    );
  }

  // 2. Sicherheitshalber das Profil nachschaerfen — falls der Trigger
  //    aus irgendeinem Grund die Rolle nicht uebernommen hat, oder der
  //    Trigger irgendwann anders aussieht. Idempotent: setzt nur was
  //    der Trigger bereits gesetzt hat oder noch fehlt.
  const { error: profileErr } = await admin
    .from("profiles")
    .update({ role, full_name, is_active: true })
    .eq("id", created.user.id);
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    logError("admin.users.create.profile-update", profileErr, { email });
    return NextResponse.json({ success: false, error: profileErr.message }, { status: 500 });
  }

  // 3. Reset-Mail senden — der User klickt darauf, landet auf /passwort-reset
  //    und setzt sich sein eigenes Passwort.
  const { error: resetErr } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: appUrl("/passwort-reset"),
  });
  if (resetErr) {
    // User ist trotzdem angelegt — Admin kann nochmal "Passwort zuruecksetzen"
    // klicken um die Mail erneut zu schicken. Nur loggen, nicht abbrechen.
    logError("admin.users.create.reset", resetErr, { email });
  }

  return NextResponse.json({ success: true, user_id: created.user.id });
}
