/**
 * POST /api/auth/passkey/auth-verify
 * Body: { response: AuthenticationResponseJSON }
 *
 * Verifiziert die vom Browser signierte Antwort gegen den gespeicherten
 * Public-Key + die Challenge. Bei Erfolg:
 *   1. counter der Credential-Row hochschreiben (Replay-Schutz)
 *   2. last_used_at setzen
 *   3. Supabase-Session für den User erzeugen und an den Client zurück-
 *      geben, damit er sich mit verifyOtp() einloggen kann.
 *
 * ============================================================
 * SESSION-ERZEUGUNG — offiziell empfohlener Workaround
 * ============================================================
 * NICHT REFACTOREN. Dieser Magic-Link-Umweg ist bewusst so gewählt.
 * Er ist der offiziell empfohlene Pfad für Custom-Auth (WebAuthn/
 * Passkey), solange Supabase keine native WebAuthn-Integration hat
 * (siehe supabase/gotrue Discussions + Supabase-Docs "Custom Auth").
 *
 * Ablauf:
 *   admin.generateLink({ type: 'magiclink', email }) → hashed_token
 *   (die Mail wird NICHT verschickt — generateLink sendet nie).
 *   Client ruft supabase.auth.verifyOtp({ token_hash, type: 'email' })
 *   → echte Supabase-Session (access_token + refresh_token, Cookies
 *   werden über die SSR-Bridge gesetzt).
 *
 * Sicher, weil:
 *   - Der Passkey-Verify oben ist der Auth-Anker (nur wer den privaten
 *     Schlüssel besitzt, kommt bis hier durch).
 *   - Der hashed_token ist einmal verwendbar und läuft schnell ab.
 *   - Der Server enthüllt die Email nur, wenn Passkey-Verify durchging.
 *
 * Geprüfte Alternativen (alle abgelehnt):
 *   A) admin.auth.admin.signInWithId / createSession → existiert im
 *      supabase-js v2 NICHT (keine Admin-API die eine Session ausstellt).
 *   B) Custom-JWT + setSession({ access_token, refresh_token }) mit
 *      SUPABASE_JWT_SECRET → nur access_token selbst-signierbar; ein
 *      selbst-signierter refresh_token wird von GoTrue abgelehnt →
 *      Session stirbt nach ~1h. Workaround wäre direkter INSERT in
 *      auth.sessions + auth.refresh_tokens (interne GoTrue-Tabellen,
 *      Schema bricht bei Supabase-Updates — verstößt gegen "robust
 *      by default" / "auf lange Sicht bauen").
 *   D) Eigene Session-Cookies + Middleware → bricht RLS (auth.uid()
 *      bleibt null), ~40 Files umschreiben. Overkill.
 *
 * Kosmetische Nebenwirkung des Magic-Link-Wegs: Supabase legt einen
 * Auth-Log-Entry "user_magiclink_requested" an und zählt gegen das
 * Magiclink-Rate-Limit (default 30/h/Email — pro User beim Login
 * unerreichbar). Kein Ops-Problem.
 *
 * Neu evaluieren erst wenn: (a) supabase-js eine offizielle
 * admin.createSession-API bekommt (siehe Roadmap-Issues auf GitHub),
 * ODER (b) >100 Mitarbeiter Passkey nutzen und Log-Rauschen spürbar.
 */

import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { passkeyOrigin, passkeyRpId } from "@/lib/passkey";

interface Body {
  response?: AuthenticationResponseJSON;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ success: false, error: "Ungültiger Body" }, { status: 400 });
  }

  const response = body.response;
  if (!response || !response.id) {
    return NextResponse.json({ success: false, error: "response fehlt" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1) Credential aus DB laden — via credential_id (base64url).
  const { data: credRow } = await admin
    .from("user_passkeys")
    .select("id, user_id, public_key, counter, transports")
    .eq("credential_id", response.id)
    .maybeSingle();

  if (!credRow) {
    return NextResponse.json(
      { success: false, error: "Passkey unbekannt — bitte klassisch einloggen." },
      { status: 401 },
    );
  }

  // 2) Passende, noch gültige Auth-Challenge suchen (die wir bei
  // /auth-challenge angelegt haben). Frueher haben wir bis zu 20 offene
  // Challenges nacheinander durchprobiert — das ist eine DoS-Angriffs-
  // flaeche (jeder Verify ist teuer). Stattdessen ziehen wir die exakte
  // Challenge aus dem clientDataJSON, das ohnehin base64url-codiert im
  // Response steckt (WebAuthn-spec: client uebermittelt genau die
  // Challenge die er signiert hat), und machen einen Equality-Lookup.
  // → EIN Verify statt bis zu 20, kein Amplification-Vector.
  let expectedChallenge: string;
  try {
    const clientDataJson = Buffer.from(
      response.response.clientDataJSON,
      "base64url",
    ).toString("utf8");
    const clientData = JSON.parse(clientDataJson) as { challenge?: unknown };
    if (typeof clientData.challenge !== "string" || clientData.challenge.length === 0) {
      throw new Error("challenge fehlt");
    }
    expectedChallenge = clientData.challenge;
  } catch {
    return NextResponse.json(
      { success: false, error: "Ungültige clientDataJSON." },
      { status: 400 },
    );
  }

  const { data: chalRow } = await admin
    .from("user_passkey_challenges")
    .select("id, challenge, expires_at")
    .eq("kind", "auth")
    .eq("challenge", expectedChallenge)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!chalRow) {
    return NextResponse.json(
      { success: false, error: "Keine gültige Challenge — bitte Login neu starten." },
      { status: 400 },
    );
  }

  let verified = false;
  let matchedChallenge: { id: string; challenge: string } | null = null;
  let newCounter = 0;

  try {
    const v = await verifyAuthenticationResponse({
      response,
      expectedChallenge: chalRow.challenge,
      expectedOrigin: passkeyOrigin(),
      expectedRPID: passkeyRpId(),
      credential: {
        id: response.id,
        publicKey: new Uint8Array(Buffer.from(credRow.public_key, "base64url")),
        counter: Number(credRow.counter ?? 0),
        transports: (credRow.transports ?? undefined) as
          | ("internal" | "hybrid" | "usb" | "nfc" | "ble")[]
          | undefined,
      },
      requireUserVerification: false,
    });
    if (v.verified) {
      verified = true;
      matchedChallenge = { id: chalRow.id as string, challenge: chalRow.challenge as string };
      newCounter = v.authenticationInfo.newCounter;
    }
  } catch {
    // verify wirft → schlicht als Fehlversuch behandeln
  }

  if (!verified || !matchedChallenge) {
    return NextResponse.json({ success: false, error: "Passkey-Verifikation fehlgeschlagen." }, { status: 401 });
  }

  // 3) Counter + last_used_at hochschreiben, Challenge verbrauchen.
  await admin
    .from("user_passkeys")
    .update({ counter: newCounter, last_used_at: new Date().toISOString() })
    .eq("id", credRow.id);
  await admin.from("user_passkey_challenges").delete().eq("id", matchedChallenge.id);

  // 4) User laden (Email + is_active + role prüfen).
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", credRow.user_id)
    .maybeSingle();

  if (!profile || profile.is_active === false) {
    return NextResponse.json(
      { success: false, error: "Dein Benutzer hat im Moment keinen Zugriff." },
      { status: 403 },
    );
  }

  const { data: authUser } = await admin.auth.admin.getUserById(credRow.user_id);
  const email = authUser?.user?.email;
  if (!email) {
    return NextResponse.json({ success: false, error: "User hat keine Email." }, { status: 500 });
  }

  // 5) Session-Handshake via Magic-Link-hashed_token (siehe Header-
  // Kommentar — offiziell empfohlener Workaround, KEIN echter Mail-
  // Versand). Client ruft supabase.auth.verifyOtp({ token_hash, type:
  // 'email' }) → damit werden die Auth-Cookies gesetzt.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (linkErr || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      { success: false, error: "Session-Erzeugung fehlgeschlagen: " + (linkErr?.message ?? "unknown") },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    email,
    token_hash: linkData.properties.hashed_token,
    role: profile.role,
  });
}
