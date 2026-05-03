// Toggle Admin/Techniker-Rolle eines Profils. Admin-only.
//
// WICHTIG: dieser Endpoint flippt nur ZWISCHEN admin und techniker.
// Wenn ein User eine Custom-Rolle hat (z.B. "sales", "einsatzleiter"),
// wuerde der einfache Toggle "!= admin → admin" diese unbeabsichtigt zu
// Admin befoerdern (Privilege-Escalation). Daher: Custom-Rollen lehnen
// wir hier ab — die muessen ueber das normale User-Edit-Modal geaendert
// werden, wo der Admin explizit eine Ziel-Rolle waehlt.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/log";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const { profileId } = body as { profileId?: string };
  if (!profileId) {
    return NextResponse.json({ success: false, error: "profileId fehlt" }, { status: 400 });
  }

  // Selbstschutz: Admin darf sich nicht selbst zu Techniker degradieren.
  // Wenn er einziger Admin ist, hat er sonst keinen Admin-Zugang mehr.
  if (auth.user.id === profileId) {
    return NextResponse.json(
      { success: false, error: "Du kannst deine eigene Rolle nicht togglen" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: target, error: fetchErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", profileId)
    .single();
  if (fetchErr || !target) {
    return NextResponse.json({ success: false, error: "Profil nicht gefunden" }, { status: 404 });
  }

  // Nur die System-Rollen sind via Toggle steuerbar. Bei Custom-Rollen
  // (sales, einsatzleiter, etc.) muss der Admin explizit ueber das User-
  // Edit-Modal die Rolle setzen — sonst wuerden Custom-Rollen pauschal
  // zu Admin werden.
  if (target.role !== "admin" && target.role !== "techniker") {
    return NextResponse.json(
      {
        success: false,
        error: `Toggle ist nur fuer admin/techniker. Rolle "${target.role}" bitte ueber das Bearbeiten-Menue aendern.`,
      },
      { status: 400 },
    );
  }

  const newRole = target.role === "admin" ? "techniker" : "admin";
  const { error: updateErr } = await admin
    .from("profiles")
    .update({ role: newRole })
    .eq("id", profileId);
  if (updateErr) {
    logError("team.toggle-role.update", updateErr, { profileId });
    return NextResponse.json({ success: false, error: "Update fehlgeschlagen" }, { status: 500 });
  }

  return NextResponse.json({ success: true, role: newRole });
}
