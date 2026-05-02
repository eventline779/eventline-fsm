// PATCH /api/admin/users/[id] — Profil eines Users bearbeiten.
// Erlaubt sind full_name, role, is_active. Email wird nicht geaendert
// (das ist mit Auth-Layer gekoppelt — separater Flow waere noetig, wird
// bei euch selten gebraucht).
//
// is_active=false ist die "Soft-Delete"-Variante: der User kann sich nicht
// mehr einloggen, bleibt aber als Referenz auf alten Auftraegen (created_by,
// assigned_to, etc.) erhalten. Admin-Client bannt den Auth-User parallel.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ success: false, error: "Ungueltiger Body" }, { status: 400 });

  const admin = createAdminClient();

  const update: Record<string, unknown> = {};
  if (typeof body.full_name === "string" && body.full_name.trim()) {
    update.full_name = body.full_name.trim();
  }
  if (typeof body.role === "string") {
    // Rolle muss existieren.
    const { data: roleRow } = await admin.from("roles").select("slug").eq("slug", body.role).single();
    if (!roleRow) {
      return NextResponse.json({ success: false, error: "Rolle existiert nicht" }, { status: 400 });
    }
    update.role = roleRow.slug;
  }
  if (typeof body.is_active === "boolean") {
    update.is_active = body.is_active;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ success: false, error: "Keine Aenderungen" }, { status: 400 });
  }

  const { error: profErr } = await admin.from("profiles").update(update).eq("id", id);
  if (profErr) {
    return NextResponse.json({ success: false, error: profErr.message }, { status: 500 });
  }

  // Wenn is_active=false: Auth-User bannen damit Login nicht mehr geht.
  // Reaktivieren = ban_duration: "none".
  if (typeof body.is_active === "boolean") {
    const { error: banErr } = await admin.auth.admin.updateUserById(id, {
      ban_duration: body.is_active ? "none" : "876000h", // ~100 Jahre = effektiv permanent
    });
    if (banErr) {
      // Profil ist schon umgestellt — den Ban-Fehler nur zurueckmelden.
      return NextResponse.json({ success: false, error: banErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
