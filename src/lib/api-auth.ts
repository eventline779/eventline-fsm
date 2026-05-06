// Helper zum Absichern von API-Routen.
// Pattern in jeder Route die nicht explizit oeffentlich ist:
//
//   const auth = await requireUser();
//   if (auth.error) return auth.error;
//   // ab hier ist auth.user garantiert nicht null
//
// Fuer admin-only Routen:
//
//   const auth = await requireAdmin();
//   if (auth.error) return auth.error;
//
// Ohne diese Pruefung koennte jeder mit der URL die Route triggern und
// damit z.B. Mails versenden, Daten loeschen oder Notifications anlegen
// (alle nutzen createAdminClient() der RLS umgeht).
//
// Routen die absichtlich oeffentlich sind (Customer-Confirm-Links, Cron-
// Webhooks, OAuth-Callbacks) brauchen das nicht — sie haben eigene
// Token-/Secret-Pruefung.

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json(
        { success: false, error: "Nicht authentifiziert" },
        { status: 401 },
      ),
    };
  }
  return { user, error: null };
}

export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json(
        { success: false, error: "Nicht authentifiziert" },
        { status: 401 },
      ),
    };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return {
      user: null,
      error: NextResponse.json(
        { success: false, error: "Nur fuer Administratoren" },
        { status: 403 },
      ),
    };
  }
  return { user, error: null };
}

// requirePermission(perm): nutzt die SQL-Funktion has_permission() — Admin
// passt automatisch durch (im Function definiert), andere Rollen muessen
// die Permission in ihrer roles.permissions-Liste haben.
//
// Pattern fuer API-Routen die createAdminClient() nutzen (RLS-Bypass):
//   const auth = await requirePermission("kunden:archive");
//   if (auth.error) return auth.error;
//
// Auf Routen die nur den User-Client nutzen wird die Permission ueber
// die RLS-Policy direkt geprueft — diese Helfer-Funktion ist nur noetig
// wo wir die RLS umgehen.
export async function requirePermission(perm: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json(
        { success: false, error: "Nicht authentifiziert" },
        { status: 401 },
      ),
    };
  }
  const { data, error } = await supabase.rpc("has_permission", { perm });
  if (error || data !== true) {
    return {
      user: null,
      error: NextResponse.json(
        { success: false, error: `Keine Berechtigung: ${perm}` },
        { status: 403 },
      ),
    };
  }
  return { user, error: null };
}
