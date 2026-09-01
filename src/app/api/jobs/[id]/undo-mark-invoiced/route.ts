import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/api-auth";
import { logError } from "@/lib/log";

// POST /api/jobs/{id}/undo-mark-invoiced — 5-Sekunden-Undo fuer die
// "Rechnung gestellt"-Aktion (Bruecke Abrechnung, Toast-Action).
//
// Setzt invoiced_at + invoice_number + invoiced_by wieder auf NULL, sodass
// der Auftrag in der Abrechnungs-Liste wieder auftaucht.
//
// Absicht: der User klickt versehentlich "Rechnung gestellt" oder tippt
// die falsche Nummer — solange der Undo-Toast noch offen ist (5s), kommt
// er hier rein und rollt die Aktion zurueck. Der Endpoint selbst hat
// KEINEN Zeit-Fenster-Check (der lebt im Frontend-Toast-Timer) — Admins
// koennen damit auch spaeter noch eine falsch gesetzte Rechnungsnummer
// zuruecknehmen falls das mal noetig wird.
//
// Permission: abrechnung:edit (Rechnungs-Aktionen).

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("abrechnung:edit");
  if (auth.error) return auth.error;
  const { id } = await params;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("jobs")
    .select("id, invoiced_at, is_deleted")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ success: false, error: "Auftrag nicht gefunden" }, { status: 404 });
  }
  if (existing.is_deleted) {
    return NextResponse.json({ success: false, error: "Auftrag ist gelöscht" }, { status: 400 });
  }
  if (!existing.invoiced_at) {
    // Nicht als abgerechnet markiert — nichts zu tun, aber wir geben
    // success zurueck damit der Client keinen Fehler-Toast zeigt (idempotent).
    return NextResponse.json({ success: true, already: true });
  }

  const { error } = await admin
    .from("jobs")
    .update({
      invoiced_at: null,
      invoice_number: null,
      invoiced_by: null,
    })
    .eq("id", id);

  if (error) {
    logError("api.jobs.undo-mark-invoiced", error, { userId: auth.user.id, jobId: id });
    return NextResponse.json({ success: false, error: "Rueckgaengig fehlgeschlagen" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
