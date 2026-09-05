import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Sichere relative Pfade fuer den next-Parameter — verhindert Open-Redirect.
// "//evil.com" ist ein protocol-relative URL → Browser interpretiert das als
// Ziel-Hostname und schickt den User auf evil.com. Wir lassen nur "/x" durch.
function safeNext(next: string | null): string {
  if (!next) return "/dashboard";
  if (!next.startsWith("/")) return "/dashboard";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/dashboard";
  return next;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
    } catch {
      // Netz-/Supabase-Fehler beim Code-Exchange: statt 500 landet der
      // User auf /login mit ?error=auth — die Login-Page zeigt bereits
      // eine generische Fehler-Meldung und der User kann's neu versuchen.
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
