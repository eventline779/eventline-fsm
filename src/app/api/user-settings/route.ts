import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ quick_links: [] });

  const supabase = createAdminClient();
  const { data } = await supabase.from("profiles").select("settings").eq("id", userId).single();

  let quickLinks: any[] = [];
  if (data?.settings) {
    try {
      const parsed = typeof data.settings === "string" ? JSON.parse(data.settings) : data.settings;
      quickLinks = parsed.quick_links || [];
    } catch {}
  }

  return NextResponse.json({ quick_links: quickLinks });
}

export async function POST(request: NextRequest) {
  const { userId, quick_links } = await request.json();
  if (!userId) return NextResponse.json({ success: false }, { status: 400 });

  const supabase = createAdminClient();

  // Load existing settings
  const { data: existing } = await supabase.from("profiles").select("settings").eq("id", userId).single();
  let settings: any = {};
  if (existing?.settings) {
    try {
      settings = typeof existing.settings === "string" ? JSON.parse(existing.settings) : existing.settings;
    } catch {}
  }

  settings.quick_links = quick_links;

  const { error } = await supabase.from("profiles").update({ settings }).eq("id", userId);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
