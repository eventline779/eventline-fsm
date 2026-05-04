import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/api-auth";
import { logError } from "@/lib/log";

// POST /api/time-off/{id}/decide — Genehmiger entscheidet ueber den Antrag.
// Body: { decision: 'genehmigen' | 'ablehnen', note?: string }
// Setzt status, approved_by, approved_at, decision_note atomar.
//
// Permission: ferien:approve. Bei 'ablehnen' ist note Pflicht damit der
// Mitarbeiter eine Begruendung hat.

interface Body {
  decision?: unknown;
  note?: unknown;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("ferien:approve");
  if (auth.error) return auth.error;
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as Body | null;
  const decision = typeof body?.decision === "string" ? body.decision : "";
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : "";

  if (decision !== "genehmigen" && decision !== "ablehnen") {
    return NextResponse.json({ success: false, error: "decision muss 'genehmigen' oder 'ablehnen' sein" }, { status: 400 });
  }
  if (decision === "ablehnen" && !note) {
    return NextResponse.json({ success: false, error: "Begründung beim Ablehnen ist Pflicht" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("time_off")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ success: false, error: "Antrag nicht gefunden" }, { status: 404 });
  }
  if (existing.status !== "beantragt") {
    return NextResponse.json({ success: false, error: `Antrag wurde bereits ${existing.status}` }, { status: 400 });
  }

  const newStatus = decision === "genehmigen" ? "genehmigt" : "abgelehnt";
  const { error } = await admin
    .from("time_off")
    .update({
      status: newStatus,
      approved_by: auth.user.id,
      approved_at: new Date().toISOString(),
      decision_note: note || null,
    })
    .eq("id", id);

  if (error) {
    logError("api.time-off.decide", error, { userId: auth.user.id, id, decision });
    return NextResponse.json({ success: false, error: "Speichern fehlgeschlagen" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
