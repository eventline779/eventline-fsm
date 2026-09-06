/**
 * POST /api/auth/passkey/auth-challenge
 * Body: { email?: string }
 *
 * Startet einen Passkey-Login. Wir laufen IMMER im "discoverable"-Flow:
 * der Browser bietet ALLE für diese Domain registrierten Passkeys zur
 * Auswahl (setzt residentKey=preferred bei Registrierung voraus — das
 * machen wir). Wir geben BEWUSST NIE allowCredentials aus, auch wenn
 * eine Email mitkommt, damit die Response-Shape keine Rueckschluesse
 * erlaubt (Enumeration-Schutz):
 *   - existierender User mit Passkey vs.
 *   - existierender User ohne Passkey vs.
 *   - Email unbekannt
 * saehen sonst anhand der Laenge/Existenz von allowCredentials
 * unterschiedlich aus. So sind alle drei Faelle identisch.
 *
 * Die Email im Body wird ignoriert (nur akzeptiert damit alte Clients
 * nicht scheitern) — kein DB-Lookup mehr auf profiles/user_passkeys.
 *
 * Antwort: WebAuthn-Auth-Optionen (mit Challenge). Client ruft damit
 * `startAuthentication()` und schickt das Ergebnis an /auth-verify.
 */

import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { passkeyRpId } from "@/lib/passkey";

export async function POST(request: Request) {
  // Body wird geparst aber nicht ausgewertet — bewusst discoverable flow.
  try {
    await request.json();
  } catch {
    // Body ist optional — leerer Body ist ok.
  }

  const admin = createAdminClient();

  const options = await generateAuthenticationOptions({
    rpID: passkeyRpId(),
    userVerification: "preferred",
    // allowCredentials bewusst weglassen → discoverable flow, keine
    // Credential-Preisgabe, keine Enumeration ueber die Response-Shape.
  });

  await admin.rpc("cleanup_expired_passkey_challenges");

  // Challenge ohne user_id speichern — der Server weiß beim Auth-Start
  // vielleicht noch nicht, wer der User ist (discoverable flow). Beim
  // Verify wird der User aus dem credential_id abgeleitet.
  const { error: chalErr } = await admin
    .from("user_passkey_challenges")
    .insert({ challenge: options.challenge, kind: "auth", user_id: null });

  if (chalErr) {
    return NextResponse.json(
      { success: false, error: "Konnte Challenge nicht speichern: " + chalErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, options });
}
