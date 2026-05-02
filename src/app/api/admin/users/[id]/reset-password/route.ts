// POST /api/admin/users/[id]/reset-password — schickt einen Passwort-
// Reset-Link an die Mail-Adresse des Users. Klickt der User darauf, landet
// er auf /passwort-reset und kann sich selbst ein neues Passwort setzen.
// Admin sieht das Passwort nie.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api-auth";
import { appUrl } from "@/lib/app-url";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("email")
    .eq("id", id)
    .single();

  if (profErr || !profile?.email) {
    return NextResponse.json({ success: false, error: "Profil nicht gefunden" }, { status: 404 });
  }

  const { error } = await admin.auth.resetPasswordForEmail(profile.email, {
    redirectTo: appUrl("/passwort-reset"),
  });
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, email: profile.email });
}
