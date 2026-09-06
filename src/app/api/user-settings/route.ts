import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

// Quick-Link-Shape — wird im Profile.settings JSON-Feld gespeichert.
type QuickLink = { label: string; href: string; icon?: string };
type ProfileSettings = { quick_links?: QuickLink[]; [key: string]: unknown };

function parseSettings(raw: unknown): ProfileSettings {
  if (!raw) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as ProfileSettings; } catch { return {}; }
  }
  return raw as ProfileSettings;
}

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  // Trust-Boundary: IMMER nur die eigenen Settings zurueckgeben.
  // Vorher: der userId-Query-Param wurde ungeprueft genommen — jeder
  // authentifizierte User konnte fremde profiles.settings lesen (Audit-
  // Befund g1: fremde profile.settings lesbar).
  // dev-mode: effective user
  const userId = auth.effectiveUserId;

  const supabase = createAdminClient();
  const { data } = await supabase.from("profiles").select("settings").eq("id", userId).single();
  const settings = parseSettings(data?.settings);
  return NextResponse.json({ quick_links: settings.quick_links ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { quick_links } = await request.json() as { quick_links?: QuickLink[] };

  // Trust-Boundary: User darf NUR seine eigenen Settings ueberschreiben.
  // userId aus dem Body wird IGNORIERT — wir nutzen ausschliesslich
  // auth.user.id (Server-Seite ist die Quelle der Wahrheit).
  // dev-mode: effective user
  const userId = auth.effectiveUserId;

  const supabase = createAdminClient();

  // Load existing settings — andere Felder darin nicht ueberschreiben.
  const { data: existing } = await supabase.from("profiles").select("settings").eq("id", userId).single();
  const settings = parseSettings(existing?.settings);
  settings.quick_links = quick_links ?? [];

  const { error } = await supabase.from("profiles").update({ settings }).eq("id", userId);
  if (error) return NextResponse.json({ success: false, error: "Speichern fehlgeschlagen" }, { status: 500 });

  return NextResponse.json({ success: true });
}
