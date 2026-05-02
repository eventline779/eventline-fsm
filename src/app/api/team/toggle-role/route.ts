// Toggle Admin/Techniker-Rolle eines Profils. Admin-only.
//
// Vorher direkt vom Browser: supabase.from("profiles").update({ role }).
// RLS auf profiles muesste das absichern — Server-Side Check ist
// expliziter und einfacher zu auditieren.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const { profileId } = body as { profileId?: string };
  if (!profileId) {
    return NextResponse.json({ ok: false, error: "profileId fehlt" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: target, error: fetchErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", profileId)
    .single();
  if (fetchErr || !target) {
    return NextResponse.json({ ok: false, error: "Profil nicht gefunden" }, { status: 404 });
  }

  const newRole = target.role === "admin" ? "techniker" : "admin";
  const { error: updateErr } = await admin
    .from("profiles")
    .update({ role: newRole })
    .eq("id", profileId);
  if (updateErr) {
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, role: newRole });
}
