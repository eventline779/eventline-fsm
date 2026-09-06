// /api/dev/impersonate/candidates — Liste aller aktiven User als
// Auswahl-Kandidaten fuer das View-As-Overlay.
//
// Gruppiert nach Rolle damit der Admin im Picker schnell scannen kann:
// Admins, Techniker, Partner, weitere Rollen alphabetisch. Partner
// werden extra ausgewiesen, weil das Impersonieren eines Partners die
// Perspektive im Partnerportal simuliert (Leo-Anforderung).

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const admin = createAdminClient();
  // Auth-Check: nur wenn Developer-Mode aktiv, geben wir die Liste raus.
  const { data: profile } = await admin
    .from("profiles")
    .select("role, developer_mode_enabled")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (
    !profile ||
    profile.role !== "admin" ||
    profile.developer_mode_enabled !== true
  ) {
    return NextResponse.json(
      { success: false, error: "Developer Mode nicht aktiv" },
      { status: 403 },
    );
  }
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("is_active", true)
    .neq("id", auth.user.id)
    .order("role")
    .order("full_name");
  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true, users: data ?? [] });
}
