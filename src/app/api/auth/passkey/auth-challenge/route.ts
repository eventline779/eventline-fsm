/**
 * POST /api/auth/passkey/auth-challenge
 * Body: { email?: string }
 *
 * Startet einen Passkey-Login. Wenn eine Email angegeben wurde,
 * beschränken wir die erlaubten Credentials auf die des Users → der
 * Browser zeigt gezielt nur diese Passkeys an. Ohne Email läuft der
 * "discoverable"-Flow: der Browser bietet ALLE für diese Domain
 * registrierten Passkeys zur Auswahl (setzt residentKey=preferred bei
 * Registrierung voraus — das machen wir).
 *
 * Antwort: WebAuthn-Auth-Optionen (mit Challenge). Client ruft damit
 * `startAuthentication()` und schickt das Ergebnis an /auth-verify.
 */

import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { passkeyRpId } from "@/lib/passkey";

interface Body {
  email?: string;
}

export async function POST(request: Request) {
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    // Body ist optional — leerer Body ist ok (discoverable flow).
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const admin = createAdminClient();

  let allowCredentials: { id: string; transports?: ("internal" | "hybrid" | "usb" | "nfc" | "ble")[] }[] | undefined;

  if (email) {
    // User via Email auflösen, dann seine Credentials laden. Wir geben
    // BEWUSST nicht preis, ob die Email existiert (kein Enumeration-
    // Vector): wenn kein User → leere Liste aber trotzdem eine Challenge
    // ausliefern, damit sich das Response-Timing nicht verrät.
    // Über profiles.email — skaliert (Index), im Gegensatz zu
    // listUsers() das bei 100+ Mitarbeitern langsam wird.
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (profile) {
      const { data: creds } = await admin
        .from("user_passkeys")
        .select("credential_id, transports")
        .eq("user_id", profile.id);
      allowCredentials = (creds ?? []).map((c) => ({
        id: c.credential_id as string,
        transports: (c.transports ?? undefined) as
          | ("internal" | "hybrid" | "usb" | "nfc" | "ble")[]
          | undefined,
      }));
    } else {
      allowCredentials = [];
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: passkeyRpId(),
    userVerification: "preferred",
    allowCredentials,
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
