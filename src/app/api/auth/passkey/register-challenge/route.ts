/**
 * POST /api/auth/passkey/register-challenge
 *
 * User (eingeloggt) startet Registrierung eines neuen Passkeys. Server
 * erzeugt WebAuthn-Registrierungs-Optionen inkl. Challenge, speichert
 * die Challenge kurzlebig in user_passkey_challenges und schickt die
 * Optionen an den Browser. Browser ruft damit `startRegistration()` in
 * @simplewebauthn/browser, was Face-ID/Touch-ID/Windows-Hello promptet.
 *
 * Danach schickt der Client die Antwort an /register-verify.
 */

import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api-auth";
import { PASSKEY_RP_NAME, passkeyRpId } from "@/lib/passkey";

export async function POST() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const user = auth.user;

  const admin = createAdminClient();

  // Ausschluss-Liste: bereits registrierte Credentials nicht doppelt.
  const { data: existing } = await admin
    .from("user_passkeys")
    .select("credential_id, transports")
    .eq("user_id", user.id);

  const excludeCredentials = (existing ?? []).map((row) => ({
    id: row.credential_id as string,
    transports: (row.transports ?? undefined) as
      | ("internal" | "hybrid" | "usb" | "nfc" | "ble")[]
      | undefined,
  }));

  const rpID = passkeyRpId();

  // userID muss stabil pro User sein (der Authenticator merkt sich das
  // Konto darüber). Wir nehmen die auth.uid() als Bytes.
  const userIdBytes = new TextEncoder().encode(user.id);

  const options = await generateRegistrationOptions({
    rpName: PASSKEY_RP_NAME,
    rpID,
    userName: user.email ?? user.id,
    userID: userIdBytes,
    userDisplayName: user.email ?? "EVENTLINE",
    attestationType: "none",
    excludeCredentials,
    authenticatorSelection: {
      // "preferred": der Browser bietet nach Möglichkeit Platform-
      // Authenticator (Face-ID, Touch-ID, Windows-Hello) an, fällt aber
      // auf USB-Keys zurück wenn keiner da ist.
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  // Alte abgelaufene Challenges wegräumen (best-effort, kein error handling
  // nötig — nächster Call räumt eh wieder).
  await admin.rpc("cleanup_expired_passkey_challenges");

  const { error: chalErr } = await admin
    .from("user_passkey_challenges")
    .insert({
      challenge: options.challenge,
      user_id: user.id,
      kind: "register",
    });

  if (chalErr) {
    return NextResponse.json(
      { success: false, error: "Konnte Challenge nicht speichern: " + chalErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, options });
}
