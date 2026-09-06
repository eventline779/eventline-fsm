// /api/dev/toggle — Admin schaltet Developer-Mode-Flag auf sich selbst
// an/aus (profiles.developer_mode_enabled).
//
//   POST body { enabled: boolean }
//
// Nur Admins koennen das Flag setzen. Beim Ausschalten wird zusaetzlich
// das Impersonation-Cookie geloescht, damit kein "Verwaister" View-As-
// State zurueckbleibt.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin, IMPERSONATE_COOKIE } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const enabled = (body as { enabled?: unknown } | null)?.enabled;
  if (typeof enabled !== "boolean") {
    return NextResponse.json(
      { success: false, error: "enabled (boolean) fehlt" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ developer_mode_enabled: enabled })
    .eq("id", auth.user.id);
  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  // Beim Ausschalten auch das aktive Impersonation-Cookie loeschen.
  if (!enabled) {
    const store = await cookies();
    store.delete(IMPERSONATE_COOKIE);
  }

  return NextResponse.json({ success: true, enabled });
}
