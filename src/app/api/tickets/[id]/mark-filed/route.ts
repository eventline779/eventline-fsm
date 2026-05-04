import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/api-auth";
import { logError } from "@/lib/log";

// POST /api/tickets/{id}/mark-filed — Beleg-Ticket als "abgelegt" markieren.
// Setzt filed_at, filed_reference, filed_by atomar.
//
// Permission: abrechnung:edit (gleiche Permission wie /api/jobs/.../mark-invoiced
// — Buchhaltungs-User bekommen "abrechnung:edit", damit beide Aktionen).
//
// Validation:
//   - Ticket muss existieren, type='beleg' sein, noch nicht abgelegt,
//     status != 'abgelehnt' (abgelehnte Belege brauchen keine Ablage).
//   - filed_reference: Pflicht, max 64 Zeichen, frei strukturiert
//     (Bexio-Doc-Nr, Ordner-Ref, etc.). RE-Prefix-Pattern wird vom Client
//     mitgeschickt analog zu mark-invoiced.

interface Body {
  filed_reference?: unknown;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("abrechnung:edit");
  if (auth.error) return auth.error;
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as Body | null;
  const raw = typeof body?.filed_reference === "string" ? body.filed_reference.trim() : "";
  if (!raw) {
    return NextResponse.json({ success: false, error: "Ablage-Referenz ist Pflicht" }, { status: 400 });
  }
  // Format: 1-5 Ziffern (Bexio-Beleg-Nr-Konvention). Server-Check zusaetzlich
  // zur Frontend-Validation — schuetzt gegen manipulierte Requests.
  if (!/^\d{1,5}$/.test(raw)) {
    return NextResponse.json({ success: false, error: "Referenz muss 1–5 Ziffern sein" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("tickets")
    .select("id, type, status, filed_at")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ success: false, error: "Beleg nicht gefunden" }, { status: 404 });
  }
  if (existing.type !== "beleg") {
    return NextResponse.json({ success: false, error: "Ticket ist kein Beleg" }, { status: 400 });
  }
  if (existing.status === "abgelehnt") {
    return NextResponse.json({ success: false, error: "Abgelehnte Belege koennen nicht abgelegt werden" }, { status: 400 });
  }
  if (existing.filed_at) {
    return NextResponse.json({ success: false, error: "Beleg wurde bereits abgelegt" }, { status: 400 });
  }

  const { error } = await admin
    .from("tickets")
    .update({
      filed_at: new Date().toISOString(),
      filed_reference: raw,
      filed_by: auth.user.id,
    })
    .eq("id", id);

  if (error) {
    logError("api.tickets.mark-filed", error, { userId: auth.user.id, ticketId: id });
    return NextResponse.json({ success: false, error: "Speichern fehlgeschlagen" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
