import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/api-auth";
import { logError } from "@/lib/log";

// POST /api/tickets/{id}/reject-beleg — Beleg-Ticket ablehnen.
// Setzt status='abgelehnt' + resolution_note + resolved_at/by atomar.
//
// Permission: abrechnung:edit (gleicher Permission-Pool wie mark-filed).
//
// Body: { reason: string } — Pflicht, max 500 Zeichen. Wird als
// resolution_note gespeichert damit der Mitarbeiter im Ticket-Detail
// sieht warum der Beleg abgelehnt wurde.

interface Body {
  reason?: unknown;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("abrechnung:edit");
  if (auth.error) return auth.error;
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as Body | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ success: false, error: "Begründung ist Pflicht" }, { status: 400 });
  }
  if (reason.length > 500) {
    return NextResponse.json({ success: false, error: "Begründung zu lang (max 500 Zeichen)" }, { status: 400 });
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
    return NextResponse.json({ success: false, error: "Beleg ist bereits abgelehnt" }, { status: 400 });
  }
  if (existing.filed_at) {
    return NextResponse.json({ success: false, error: "Bereits abgelegte Belege koennen nicht abgelehnt werden" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("tickets")
    .update({
      status: "abgelehnt",
      resolved_at: nowIso,
      resolved_by: auth.user.id,
      resolution_note: reason,
    })
    .eq("id", id);

  if (error) {
    logError("api.tickets.reject-beleg", error, { userId: auth.user.id, ticketId: id });
    return NextResponse.json({ success: false, error: "Speichern fehlgeschlagen" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
