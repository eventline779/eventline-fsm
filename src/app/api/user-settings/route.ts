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

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ quick_links: [] });

  const supabase = createAdminClient();
  const { data } = await supabase.from("profiles").select("settings").eq("id", userId).single();
  const settings = parseSettings(data?.settings);
  return NextResponse.json({ quick_links: settings.quick_links ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { userId, quick_links } = await request.json() as { userId?: string; quick_links?: QuickLink[] };
  if (!userId) return NextResponse.json({ success: false }, { status: 400 });

  // Trust-Boundary: User darf NUR seine eigenen Settings ueberschreiben.
  // Vorher: Body-userId wurde ungeprueft genommen — jeder konnte fremde
  // quick_links plattmachen.
  if (userId !== auth.user.id) {
    return NextResponse.json({ success: false, error: "Nicht erlaubt" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // Load existing settings — andere Felder darin nicht ueberschreiben.
  const { data: existing } = await supabase.from("profiles").select("settings").eq("id", userId).single();
  const settings = parseSettings(existing?.settings);
  settings.quick_links = quick_links ?? [];

  const { error } = await supabase.from("profiles").update({ settings }).eq("id", userId);
  if (error) return NextResponse.json({ success: false, error: "Speichern fehlgeschlagen" }, { status: 500 });

  return NextResponse.json({ success: true });
}
