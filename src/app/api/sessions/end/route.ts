import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/log";

// POST /api/sessions/end
//
// Wird beim expliziten Logout gerufen oder wenn der Client merkt dass der
// Inaktivitaets-Timer abgelaufen ist. Markiert die aktive Session als
// beendet mit dem angegebenen Grund.
//
// Body: { reason: 'logout' | 'inactive' }

interface Body {
  reason?: unknown;
}

const ALLOWED_REASONS = new Set(["logout", "inactive"]);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Nicht authentifiziert" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const reason = typeof body?.reason === "string" && ALLOWED_REASONS.has(body.reason)
    ? body.reason
    : "logout";

  try {
    const { data: active } = await supabase
      .from("user_sessions")
      .select("id")
      .eq("user_id", user.id)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (active) {
      await supabase
        .from("user_sessions")
        .update({
          ended_at: new Date().toISOString(),
          end_reason: reason,
        })
        .eq("id", active.id);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    logError("api.sessions.end", e, { userId: user.id, reason });
    return NextResponse.json({ success: false, error: "Interner Fehler" }, { status: 500 });
  }
}
