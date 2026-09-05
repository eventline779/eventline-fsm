/**
 * Passkey-Helfer — server-seitig geteilt zwischen allen /api/auth/passkey/*
 * Routen. Zentralisiert die WebAuthn-Relying-Party-Konfiguration und den
 * kleinen "credential resolver".
 *
 * Wichtig: RP-ID = registrable domain (z.B. "eventline-fsm.vercel.app"
 * oder "eventline-basel.com") — NIEMALS Protocol oder Pfad. Wir leiten
 * sie aus NEXT_PUBLIC_APP_URL ab (via appUrl()), das ist die stabile
 * Prod-URL. Für lokal / preview: automatisch "localhost".
 *
 * Ein Passkey der auf "eventline-fsm.vercel.app" erzeugt wurde funktioniert
 * NICHT auf "eventline-basel.com" — das ist Absicht (WebAuthn-Origin-Bindung).
 * Bei Domain-Wechsel müssen User einen neuen Passkey einrichten.
 */

import { appUrl } from "@/lib/app-url";

/** Origin des aktuellen Deployments — muss beim register/auth exakt matchen. */
export function passkeyOrigin(): string {
  return appUrl().replace(/\/$/, "");
}

/** RP-ID = Hostname ohne Port/Protocol/Pfad. WebAuthn-Vorgabe. */
export function passkeyRpId(): string {
  try {
    const url = new URL(passkeyOrigin());
    return url.hostname;
  } catch {
    return "localhost";
  }
}

/** Menschenlesbarer Name der im Browser-Dialog erscheint ("Anmelden bei ..."). */
export const PASSKEY_RP_NAME = "EVENTLINE";
