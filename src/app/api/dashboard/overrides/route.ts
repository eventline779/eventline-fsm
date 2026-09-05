// /api/dashboard/overrides — persoenliche Dashboard-Anpassungen des eingeloggten Users.
//
//   GET    -> { success, hidden: string[], widget_order: string[] }
//             leerer Default falls kein Eintrag existiert.
//   PUT    -> body { hidden: string[], widget_order: string[] }
//             upsert (onConflict user_id). Unbekannte Widget-IDs werden
//             STILL gedroppt — kein 400, damit eine alte Client-Version nach
//             einem Registry-Umbau nicht plötzlich alle Speichervorgänge des
//             Users blockiert. Der User ID selbst wird server-seitig gesetzt
//             (auth.user.id), niemals aus dem Body.
//   DELETE -> loescht die Row = 'Auf Standard zuruecksetzen'.
//
// Sicherheit: RLS auf user_dashboard_overrides (Migration 207) gated auf
// auth.uid() = user_id. Wir nutzen hier trotzdem den Admin-Client, weil
// createClient() in Route-Handlers gelegentlich subtile Cookie-Sync-
// Probleme hat — dafuer filtern wir eq('user_id', auth.user.id) hart und
// setzen im PUT/DELETE dieselbe ID im Body/Query.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DASHBOARD_WIDGETS } from "@/lib/dashboard-widgets";

export const dynamic = "force-dynamic";

const KNOWN_WIDGET_IDS = new Set<string>(DASHBOARD_WIDGETS.map((w) => w.id));

/** String-Array aus body herausziehen und auf Registry-bekannte IDs
 *  reduzieren. Unbekannte silently droppen — siehe Kopf-Doku. */
function sanitizeIdList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    if (typeof item !== "string") continue;
    if (!KNOWN_WIDGET_IDS.has(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_dashboard_overrides")
    .select("hidden, widget_order")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json(
    {
      success: true,
      hidden: (data?.hidden ?? []) as string[],
      widget_order: (data?.widget_order ?? []) as string[],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Ungueltiger Body" }, { status: 400 });
  }
  const hidden = sanitizeIdList((body as { hidden?: unknown }).hidden);
  const widget_order = sanitizeIdList((body as { widget_order?: unknown }).widget_order);

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_dashboard_overrides")
    .upsert(
      {
        user_id: auth.user.id,
        hidden,
        widget_order,
      },
      { onConflict: "user_id" },
    );
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, hidden, widget_order });
}

export async function DELETE() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_dashboard_overrides")
    .delete()
    .eq("user_id", auth.user.id);
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
