// /api/dashboard/overrides — persoenliche Dashboard-Anpassungen des eingeloggten Users.
//
//   GET    -> { success, hidden: string[], widget_order: string[],
//               widget_spans: Record<string, number> }
//             leerer Default falls kein Eintrag existiert.
//   PUT    -> body { hidden: string[], widget_order: string[],
//                    widget_spans?: Record<string, number> }
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
// Erlaubte col-span-Werte im 12-col-Grid. 4=1/3, 6=1/2, 8=2/3, 12=voll.
const ALLOWED_SPANS = new Set([4, 6, 8, 12]);

/** String-Array aus body herausziehen und auf Registry-bekannte IDs
 *  reduzieren. Unbekannte silently droppen — siehe Kopf-Doku. */
function sanitizeIdList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const cap = KNOWN_WIDGET_IDS.size;
  for (const item of v) {
    if (typeof item !== "string") continue;
    if (!KNOWN_WIDGET_IDS.has(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}

/** widget_spans-Map validieren — nur bekannte IDs, nur erlaubte span-Werte,
 *  Anzahl-Cap. Alles ausserhalb wird silently gedroppt (gleiche Toleranz-
 *  Regel wie bei den ID-Listen). */
function sanitizeSpans(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, number> = {};
  let count = 0;
  const cap = KNOWN_WIDGET_IDS.size;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!KNOWN_WIDGET_IDS.has(k)) continue;
    if (typeof val !== "number" || !ALLOWED_SPANS.has(val)) continue;
    out[k] = val;
    count++;
    if (count >= cap) break;
  }
  return out;
}

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_dashboard_overrides")
    .select("hidden, widget_order, widget_spans")
    // dev-mode: effective user
    .eq("user_id", auth.effectiveUserId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json(
    {
      success: true,
      hidden: (data?.hidden ?? []) as string[],
      widget_order: (data?.widget_order ?? []) as string[],
      widget_spans: (data?.widget_spans ?? {}) as Record<string, number>,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Ungültiger Body" }, { status: 400 });
  }
  const hidden = sanitizeIdList((body as { hidden?: unknown }).hidden);
  const widget_order = sanitizeIdList((body as { widget_order?: unknown }).widget_order);
  const widget_spans = sanitizeSpans((body as { widget_spans?: unknown }).widget_spans);

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_dashboard_overrides")
    .upsert(
      {
        // dev-mode: effective user
        user_id: auth.effectiveUserId,
        hidden,
        widget_order,
        widget_spans,
      },
      { onConflict: "user_id" },
    );
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, hidden, widget_order, widget_spans });
}

export async function DELETE() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_dashboard_overrides")
    .delete()
    // dev-mode: effective user
    .eq("user_id", auth.effectiveUserId);
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
