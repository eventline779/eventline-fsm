import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/api-auth";
import { logError } from "@/lib/log";

// POST /api/jobs/{id}/mark-invoiced — Auftrag als "Rechnung gestellt"
// markieren. Setzt invoiced_at, invoice_number, invoiced_by atomar.
//
// Permission: abrechnung:edit (Admins haben automatisch durch).
//
// Validation:
//   - invoice_number: nicht leer, max 64 Zeichen, Format frei (Strings wie
//     "RE-2026-001" oder "RE-001/2026" sind beide valid). RE-Prefix wird
//     vom Client mitgeschickt — wir nehmen den String 1:1 als Speicher-Wert.
//   - Job muss existieren, status='abgeschlossen' sein, noch nicht abgerechnet
//     (sonst koennte ein doppelter Submit eine alte Nummer ueberschreiben).

interface Body {
  invoice_number?: unknown;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("abrechnung:edit");
  if (auth.error) return auth.error;
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as Body | null;
  const raw = typeof body?.invoice_number === "string" ? body.invoice_number.trim() : "";
  if (!raw) {
    return NextResponse.json({ success: false, error: "Rechnungsnummer ist Pflicht" }, { status: 400 });
  }
  if (raw.length > 64) {
    return NextResponse.json({ success: false, error: "Rechnungsnummer zu lang (max 64 Zeichen)" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Pre-Check: Job muss existieren + abgeschlossen + noch nicht abgerechnet.
  // Race-Schutz gegen doppelten Submit (zwei Tabs, beide klicken kurz nacheinander).
  const { data: existing } = await admin
    .from("jobs")
    .select("id, status, invoiced_at, is_deleted")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ success: false, error: "Auftrag nicht gefunden" }, { status: 404 });
  }
  if (existing.is_deleted) {
    return NextResponse.json({ success: false, error: "Auftrag ist gelöscht" }, { status: 400 });
  }
  if (existing.status !== "abgeschlossen") {
    return NextResponse.json({ success: false, error: "Auftrag ist nicht abgeschlossen" }, { status: 400 });
  }
  if (existing.invoiced_at) {
    return NextResponse.json({ success: false, error: "Auftrag wurde bereits als abgerechnet markiert" }, { status: 400 });
  }

  const { error } = await admin
    .from("jobs")
    .update({
      invoiced_at: new Date().toISOString(),
      invoice_number: raw,
      invoiced_by: auth.user.id,
    })
    .eq("id", id);

  if (error) {
    logError("api.jobs.mark-invoiced", error, { userId: auth.user.id, jobId: id });
    return NextResponse.json({ success: false, error: "Speichern fehlgeschlagen" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
