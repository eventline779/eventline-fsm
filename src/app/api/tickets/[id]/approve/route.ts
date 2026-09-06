import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/api-auth";
import { logError } from "@/lib/log";

// POST /api/tickets/{id}/approve — Ein-Klick-Genehmigen fuer
// Stempel-Aenderung-Tickets.
//
// Wrapper um die apply_ticket-RPC, damit der neue Ein-Klick-Flow
// (Icon-Button in Liste + Detail) keinen Confirm-Dialog braucht und
// idempotent aufgerufen werden kann (Undo-Toast → Zweit-Klick liefert
// deterministisch 200 statt 4xx).
//
// Scope bewusst schmal: NUR type='stempel_aenderung'. Belege haben ihre
// eigene Route (mark-filed / reject-beleg), IT- und Material-Tickets
// werden nicht via Ein-Klick approved (koennten aber trivial erweitert
// werden).
//
// Optional Body: { corrected_job_id?: string, resolution_note?: string }.
//   - corrected_job_id: analog SearchableSelect im Detail — UUID oder
//     "ANDERE_ARBEIT". NULL/omitted → apply_ticket nutzt data.job_id.
//   - resolution_note: optionale Notiz an den Ersteller.
//
// Permission: tickets:manage (Admin passt via has_permission durch).
// Die apply_ticket-RPC prueft SELBST nochmal — der Wrapper hier ist die
// erste Verteidigungslinie, damit wir vor dem RPC-Roundtrip abbrechen.

interface Body {
  corrected_job_id?: unknown;
  resolution_note?: unknown;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("tickets:manage");
  if (auth.error) return auth.error;
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as Body | null;
  const correctedJobId =
    typeof body?.corrected_job_id === "string" && body.corrected_job_id.trim() !== ""
      ? body.corrected_job_id.trim()
      : null;
  const resolutionNote =
    typeof body?.resolution_note === "string" && body.resolution_note.trim() !== ""
      ? body.resolution_note.trim()
      : null;

  const admin = createAdminClient();

  // Ticket laden — Typ + Status pruefen ohne Row zu locken (das macht die
  // RPC selbst nochmal via SELECT ... FOR UPDATE).
  const { data: existing } = await admin
    .from("tickets")
    .select("id, type, status, ticket_number")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ success: false, error: "Ticket nicht gefunden" }, { status: 404 });
  }
  if (existing.type !== "stempel_aenderung") {
    return NextResponse.json(
      { success: false, error: "Auto-Approve nur für Stempeltickets" },
      { status: 400 },
    );
  }
  // Idempotenz: bereits erledigt/abgelehnt → 200 no-op. Der Undo-Toast
  // kann so gefahrlos doppelt gefeuert werden, und ein Reload+Zweit-Klick
  // erzeugt keinen verwirrenden Fehler.
  if (existing.status === "erledigt") {
    return NextResponse.json({
      success: true,
      already: true,
      ticket_number: existing.ticket_number,
    });
  }
  if (existing.status === "abgelehnt") {
    return NextResponse.json(
      { success: false, error: "Ticket ist bereits abgelehnt" },
      { status: 409 },
    );
  }

  // RPC-Aufruf ueber den User-Client, damit auth.uid() innerhalb der
  // SECURITY-DEFINER-Function den echten resolver liefert. Das ist wichtig
  // fuer resolved_by und fuer den has_permission-Check innerhalb der RPC.
  const supabase = await createClient();
  const rpcArgs: Record<string, unknown> = {
    p_ticket_id: id,
    p_new_status: "erledigt",
    p_resolution_note: resolutionNote,
  };
  if (correctedJobId) rpcArgs.p_corrected_job_id = correctedJobId;

  const { error } = await supabase.rpc("apply_ticket", rpcArgs);
  if (error) {
    logError("api.tickets.approve", error, {
      userId: auth.user.id,
      ticketId: id,
      correctedJobId,
    });
    return NextResponse.json(
      { success: false, error: "Genehmigen fehlgeschlagen" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    ticket_number: existing.ticket_number,
  });
}
