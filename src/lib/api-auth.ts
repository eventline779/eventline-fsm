// Helper zum Absichern von API-Routen.
// Pattern in jeder Route die nicht explizit oeffentlich ist:
//
//   const auth = await requireUser();
//   if (auth.error) return auth.error;
//   // ab hier ist auth.user garantiert nicht null
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
