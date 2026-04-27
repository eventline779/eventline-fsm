import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, saveConnection } from "@/lib/bexio";
import { createClient } from "@/lib/supabase/server";

// OAuth-Callback. Bexio leitet den User mit ?code=...&state=... hierher zurueck.
// Wir vergleichen state mit dem Cookie (CSRF-Schutz), tauschen den Code gegen
// Tokens und speichern sie. Danach Redirect zurueck zu /einstellungen?bexio=connected.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const errorDesc = request.nextUrl.searchParams.get("error_description");

  if (error) {
    return NextResponse.redirect(
      new URL(`/einstellungen?tab=integrationen&bexio=error&msg=${encodeURIComponent(errorDesc ?? error)}`, request.url),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/einstellungen?tab=integrationen&bexio=error&msg=Fehlende+Parameter", request.url),
    );
  }

  const cookieState = request.cookies.get("bexio_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(
      new URL("/einstellungen?tab=integrationen&bexio=error&msg=Ungueltiger+State", request.url),
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    // Wer's verbunden hat — fuer Audit. Wir holen den eingeloggten Eventline-User.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Optional: aus dem id_token / userinfo den Bexio-Login-User extrahieren.
    // Tun wir hier light: wenn id_token kommt, decoden wir das email-Claim.
    let bexioEmail: string | null = null;
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(
          Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8"),
        );
        bexioEmail = payload.email ?? null;
      } catch {}
    }

    // Bexio-User-ID gleich mitfetchen — wird beim Kontakt-Anlegen als
    // user_id + owner_id (Pflichtfelder) gebraucht.
    let bexioUserId: number | null = null;
    try {
      const meRes = await fetch("https://api.bexio.com/3.0/users/me", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: "application/json",
        },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        bexioUserId = me?.id ?? null;
      }
    } catch {
      // Wenn das hier scheitert: Verbindung trotzdem speichern. createContact
      // fetched die ID dann beim ersten Anlegen via getBexioUserId().
    }

    await saveConnection(tokens, user?.id ?? null, { email: bexioEmail, userId: bexioUserId });

    const res = NextResponse.redirect(
      new URL("/einstellungen?tab=integrationen&bexio=connected", request.url),
    );
    res.cookies.delete("bexio_oauth_state");
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unbekannter Fehler";
    return NextResponse.redirect(
      new URL(`/einstellungen?tab=integrationen&bexio=error&msg=${encodeURIComponent(msg)}`, request.url),
    );
  }
}
