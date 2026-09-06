/**
 * POST /api/auth/passkey/register-verify
 * Body: { response: RegistrationResponseJSON, nickname?: string }
 *
 * Verifiziert die vom Browser zurückgegebene Registrierungs-Antwort gegen
 * die zuvor gespeicherte Challenge, speichert credential_id + public_key
 * + counter in user_passkeys. Ab jetzt kann sich der User damit einloggen.
 */

import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api-auth";
import { passkeyOrigin, passkeyRpId } from "@/lib/passkey";

interface Body {
  response?: RegistrationResponseJSON;
  nickname?: string;
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const user = auth.user;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ success: false, error: "Ungültiger Body" }, { status: 400 });
  }

  const response = body.response;
  if (!response) {
    return NextResponse.json({ success: false, error: "response fehlt" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Passende Challenge suchen — letzte offene register-Challenge für diesen User.
  const { data: chalRow } = await admin
    .from("user_passkey_challenges")
    .select("id, challenge, expires_at")
    .eq("user_id", user.id)
    .eq("kind", "register")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!chalRow) {
    return NextResponse.json(
      { success: false, error: "Keine gültige Challenge — bitte Registrierung neu starten." },
      { status: 400 },
    );
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: chalRow.challenge,
      expectedOrigin: passkeyOrigin(),
      expectedRPID: passkeyRpId(),
      requireUserVerification: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unbekannter Fehler";
    return NextResponse.json({ success: false, error: "Verifikation fehlgeschlagen: " + msg }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ success: false, error: "Verifikation fehlgeschlagen." }, { status: 400 });
  }

  const info = verification.registrationInfo;
  const cred = info.credential;

  // public_key ist Uint8Array — als Base64URL speichern (kompakt & URL-safe).
  const publicKeyB64 = Buffer.from(cred.publicKey).toString("base64url");

  const nickname = (body.nickname ?? "").trim().slice(0, 60) || null;

  // transports kommen 1:1 vom Client — Runtime-Whitelist (nicht nur
  // TS-Cast), damit kein beliebiger String in unserer DB landet.
  const ALLOWED_TRANSPORTS = ["internal", "hybrid", "usb", "nfc", "ble"] as const;
  type AllowedTransport = (typeof ALLOWED_TRANSPORTS)[number];
  const rawTransports = Array.isArray(cred.transports) ? cred.transports : [];
  const cleanTransports = rawTransports.filter(
    (t): t is AllowedTransport =>
      typeof t === "string" && (ALLOWED_TRANSPORTS as readonly string[]).includes(t),
  );

  const { error: insErr } = await admin.from("user_passkeys").insert({
    user_id: user.id,
    credential_id: cred.id,
    public_key: publicKeyB64,
    counter: cred.counter ?? 0,
    device_type: info.credentialDeviceType,
    backed_up: info.credentialBackedUp,
    transports: cleanTransports.length > 0 ? cleanTransports : null,
    nickname,
  });

  if (insErr) {
    // Wahrscheinlichster Fehler: unique-Verletzung, wenn derselbe Passkey
    // schon registriert war. Für User verständlich formulieren.
    if (insErr.code === "23505") {
      return NextResponse.json(
        { success: false, error: "Dieser Passkey ist bereits registriert." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { success: false, error: "Speichern fehlgeschlagen: " + insErr.message },
      { status: 500 },
    );
  }

  // Challenge verbrauchen (Replay-Schutz).
  await admin.from("user_passkey_challenges").delete().eq("id", chalRow.id);

  return NextResponse.json({ success: true });
}
