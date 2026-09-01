import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/api-auth";
import { getConnection } from "@/lib/bexio";
import { logError } from "@/lib/log";

// POST /api/bexio/create-invoice — Rechnung in Bexio anlegen aus einem
// abgeschlossenen Auftrag (Bruecke Abrechnung -> Bexio).
//
// Aktueller Scope (Audit Thema 2 / Bruecke 3):
//   - Endpoint existiert und ist an die Berechtigung + UI verdrahtet.
//   - Wenn Bexio nicht via OAuth verbunden ist -> 501 mit klarer Meldung.
//   - Wenn Bexio verbunden ist: liest Rapport-Daten (time_ranges, Kunde,
//     Job-Meta) fuer die Positions-Vorschlaege, aber die eigentliche
//     POST /2.0/kb_invoice-Anbindung wird bewusst noch NICHT ausgeloest —
//     dazu fehlen produktions-verlaessliche Entscheidungen (Kunden-ID-
//     Mapping, Stundensatz-Quelle, MwSt-Set, KontoNr, Rundungslogik).
//     Der Endpoint gibt daher 501 "Rechnungs-Erstellung noch nicht
//     implementiert" zurueck, samt dem berechneten Positions-Vorschlag im
//     Response-Body — Frontend zeigt den Vorschlag als Toast.
//
// Nachgelagerte Arbeit (Owner: naechster Bexio-Sprint):
//   1. Kunden-ID -> bexio_contact_id via customers.bexio_contact_id lookup
//      (schon vorhanden); Fallback: neu anlegen ueber /2.0/contact.
//   2. Stundensatz-Quelle festlegen (locations.hourly_rate? profile-basiert?).
//   3. MwSt-Set / KontoNr aus company_settings holen.
//   4. POST /2.0/kb_invoice: header + positions[] + tax_id.
//   5. Bei Erfolg jobs.bexio_invoice_id + jobs.invoiced_at setzen (Spalte
//      muss noch per Migration angelegt werden).
//
// Permission: abrechnung:edit (Rechnungs-Aktionen).

interface Body {
  job_id?: unknown;
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("abrechnung:edit");
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => null)) as Body | null;
  const jobId = typeof body?.job_id === "string" ? body.job_id : "";
  if (!jobId) {
    return NextResponse.json({ success: false, error: "job_id fehlt" }, { status: 400 });
  }

  // Bexio-Anbindung pruefen. Wenn nicht verbunden -> ehrlicher 501.
  const conn = await getConnection();
  if (!conn) {
    return NextResponse.json(
      {
        success: false,
        error: "Bexio nicht verbunden — bitte zuerst in den Einstellungen verbinden.",
      },
      { status: 501 },
    );
  }

  // Job + Rapport-Daten laden (fuer den Positions-Vorschlag). Admin-Client,
  // damit RLS nicht im Weg steht — Permission-Check hat oben schon geklappt.
  const admin = createAdminClient();
  const { data: job, error: jobErr } = await admin
    .from("jobs")
    .select(
      "id, job_number, title, status, invoiced_at, customer:customers(id, name, bexio_contact_id), service_reports(id, time_ranges)",
    )
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr) {
    logError("api.bexio.create-invoice.load", jobErr, { jobId });
    return NextResponse.json({ success: false, error: "Auftrag konnte nicht geladen werden" }, { status: 500 });
  }
  if (!job) {
    return NextResponse.json({ success: false, error: "Auftrag nicht gefunden" }, { status: 404 });
  }
  if (job.status !== "abgeschlossen") {
    return NextResponse.json({ success: false, error: "Auftrag ist nicht abgeschlossen" }, { status: 400 });
  }
  if (job.invoiced_at) {
    return NextResponse.json({ success: false, error: "Auftrag ist bereits abgerechnet" }, { status: 400 });
  }

  // Positions-Vorschlag aus time_ranges bauen (Summe der Minuten pro
  // Techniker, ohne not_billable). Stundensatz-Platzhalter — die echte
  // Quelle wird im naechsten Sprint definiert.
  type TR = { date: string; start: string; end: string; pause?: number; technician_id?: string; not_billable?: boolean };
  const reports = (job.service_reports as { time_ranges: TR[] | null }[] | null) ?? [];
  let totalBillableMinutes = 0;
  for (const r of reports) {
    for (const tr of r.time_ranges ?? []) {
      if (tr.not_billable) continue;
      if (!tr.date || !tr.start || !tr.end) continue;
      const start = new Date(`${tr.date}T${tr.start}:00`);
      const end = new Date(`${tr.date}T${tr.end}:00`);
      const raw = Math.round((end.getTime() - start.getTime()) / 60000);
      totalBillableMinutes += Math.max(0, raw - (tr.pause || 0));
    }
  }
  const totalHours = Math.round((totalBillableMinutes / 60) * 100) / 100;

  return NextResponse.json(
    {
      success: false,
      error:
        "Rechnungs-Erstellung in Bexio noch nicht produktiv freigegeben. Bitte via 'Rechnung gestellt' die Nummer manuell hinterlegen.",
      preview: {
        job_number: (job as { job_number: number | null }).job_number,
        title: (job as { title: string }).title,
        billable_hours: totalHours,
        // customer kann als array oder object zurueckkommen (Supabase Join-Shape),
        // deshalb defensive Extraktion.
        customer_name: (() => {
          const c = (job as { customer: { name?: string } | { name?: string }[] | null }).customer;
          if (!c) return null;
          const first = Array.isArray(c) ? c[0] : c;
          return first?.name ?? null;
        })(),
      },
    },
    { status: 501 },
  );
}
