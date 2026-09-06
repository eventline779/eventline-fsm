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
// er hier rein und rollt die Aktion zurueck.
//
// Schutz gegen "Rechnungsnummer Monate spaeter stumm loeschen":
//   - Nur der User der die Rechnungsnummer gesetzt hat (invoiced_by=auth.uid)
//     ODER die Aktion muss innerhalb der letzten 5 Minuten passiert sein.
//   - Jede Ausfuehrung wird geloggt (audit-trail via logError-Kanal, damit
//     Vercel-Function-Logs die Nummer + Zeitstempel behalten).
//
// Permission: abrechnung:edit (Rechnungs-Aktionen).

const UNDO_WINDOW_MS = 5 * 60 * 1000;

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
    .select("id, invoiced_at, invoiced_by, invoice_number, is_deleted")
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

  // Ownership + Zeitfenster: Undo nur wenn der aufrufende User die Rechnung
  // selbst gesetzt hat, ODER es weniger als 5 Minuten her ist. Sonst kann
  // eine gesetzte Rechnungsnummer nicht stumm ueberschrieben werden.
  const isOwner = existing.invoiced_by === auth.user.id;
  const ageMs = Date.now() - new Date(existing.invoiced_at).getTime();
  const inWindow = ageMs >= 0 && ageMs <= UNDO_WINDOW_MS;
  if (!isOwner && !inWindow) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Rueckgaengig nur innerhalb 5 Minuten oder durch den User moeglich, der die Rechnung gesetzt hat.",
      },
      { status: 403 },
    );
  }

  // Atomarer Update: nur solange invoiced_at gesetzt UND unveraendert ist
  // (via .eq mit dem gelesenen Timestamp). Verhindert Race gegen parallelen
  // Undo/Re-Set.
  const { error, count } = await admin
    .from("jobs")
    .update(
      {
        invoiced_at: null,
        invoice_number: null,
        invoiced_by: null,
      },
      { count: "exact" },
    )
    .eq("id", id)
    .eq("invoiced_at", existing.invoiced_at);

  if (error) {
    logError("api.jobs.undo-mark-invoiced", error, { userId: auth.user.id, jobId: id });
    return NextResponse.json({ success: false, error: "Rueckgaengig fehlgeschlagen" }, { status: 500 });
  }
  if (count === 0) {
    return NextResponse.json(
      { success: false, error: "Zustand hat sich zwischenzeitlich geaendert. Bitte Seite neu laden." },
      { status: 409 },
    );
  }

  // Audit-Trail: das Rueckgaengig-Machen einer Rechnungsnummer ist eine
  // sensible Buchhaltungs-Aktion. Wir loggen sie ueber logError damit sie
  // in den Vercel-Function-Logs mit Kontext auftaucht (ctx-Tag + JSON).
  logError("api.jobs.undo-mark-invoiced.audit", new Error("undo-mark-invoiced"), {
    userId: auth.user.id,
    jobId: id,
    priorInvoiceNumber: existing.invoice_number,
    priorInvoicedAt: existing.invoiced_at,
    priorInvoicedBy: existing.invoiced_by,
    ageMs,
    reason: isOwner ? "owner" : "within-window",
  });

  return NextResponse.json({ success: true });
}
