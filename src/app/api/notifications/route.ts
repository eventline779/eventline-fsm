import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { logError } from "@/lib/log";

// POST: Notification fuer einen oder mehrere User anlegen.
//
// Admin-only: vorher konnte jeder authentifizierte User Notifications
// mit beliebigem Title/Link an JEDEN anderen User schreiben. Phishing-
// Vektor (gefakte "Login erforderlich"-Nachricht mit malicious Link).
// In-App-Notifications werden in Eventline ausschliesslich von Admins
// (oder DB-Triggern via Service-Role) ausgeloest — daher Admin-Gate.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { userIds, title, message, link } = await request.json();

  if (!userIds || !title) {
    return NextResponse.json({ success: false, error: "userIds und title sind erforderlich" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const ids = Array.isArray(userIds) ? userIds : [userIds];

  const rows = ids.map((userId: string) => ({
    user_id: userId,
    title,
    message: message || null,
    link: link || null,
  }));

  const { error } = await supabase.from("notifications").insert(rows);

  if (error) {
    logError("api.notifications.insert", error);
    return NextResponse.json({ success: false, error: "Notification konnte nicht erstellt werden" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
