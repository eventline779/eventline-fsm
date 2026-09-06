import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/api-auth";
import { logError } from "@/lib/log";

// /api/auftraege/[id]/customer-contacted — Toggle "Kunde bereits kontaktiert"
// auf einem Auftrag (Tabelle public.jobs). Verhindert doppelte Anrufe,
// wenn mehrere Team-Member denselben Auftrag klaeren.
//
//   POST   → customer_contacted_at = now(), customer_contacted_by = auth.uid()
//            Idempotent: ist der Flag schon gesetzt, wird er MIT neuem
//            Timestamp+User ueberschrieben — "zuletzt kontaktiert von X"
//            ist wertvoller als "der erste steht fuer immer".
//   DELETE → beide Felder wieder auf NULL (Undo).
//
// Permission: auftraege:edit (Admins passen automatisch durch has_permission()).
//
// Response bei Erfolg:
//   { success: true, customer_contacted_at, customer_contacted_by }

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("auftraege:edit");
  if (auth.error) return auth.error;
  const { id } = await params;

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("jobs")
    .select("id, is_deleted")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ success: false, error: "Auftrag nicht gefunden" }, { status: 404 });
  }
  if (existing.is_deleted) {
    return NextResponse.json({ success: false, error: "Auftrag ist gelöscht" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { data: updated, error } = await admin
    .from("jobs")
    .update({
      customer_contacted_at: now,
      customer_contacted_by: auth.user.id,
    })
    .eq("id", id)
    .select("customer_contacted_at, customer_contacted_by")
    .single();

  if (error) {
    logError("api.auftraege.customer-contacted.post", error, { userId: auth.user.id, jobId: id });
    return NextResponse.json({ success: false, error: "Speichern fehlgeschlagen" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    customer_contacted_at: updated.customer_contacted_at,
    customer_contacted_by: updated.customer_contacted_by,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("auftraege:edit");
  if (auth.error) return auth.error;
  const { id } = await params;

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("jobs")
    .select("id, is_deleted")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ success: false, error: "Auftrag nicht gefunden" }, { status: 404 });
  }
  if (existing.is_deleted) {
    return NextResponse.json({ success: false, error: "Auftrag ist gelöscht" }, { status: 400 });
  }

  const { error } = await admin
    .from("jobs")
    .update({
      customer_contacted_at: null,
      customer_contacted_by: null,
    })
    .eq("id", id);

  if (error) {
    logError("api.auftraege.customer-contacted.delete", error, { userId: auth.user.id, jobId: id });
    return NextResponse.json({ success: false, error: "Rueckgaengig fehlgeschlagen" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    customer_contacted_at: null,
    customer_contacted_by: null,
  });
}
