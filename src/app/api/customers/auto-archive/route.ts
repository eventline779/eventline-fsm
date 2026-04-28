import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api-auth";

// POST — Auto-Archiv: Kunden, die mindestens einen Auftrag hatten, aber seit
// ueber einem Jahr keinen neuen mehr, werden ins Archiv verschoben.
//
// Verwaltungs-Customers (locations.customer_id) sind ausgenommen — sie sind
// auch ohne direkten Auftrag operativ aktiv (Eventline betreibt z.B. einen
// Standort fuer sie ohne taeglich neue Auftraege zu schreiben).
//
// Wird vom /kunden-Page beim Laden ausgeloest (idempotent — fasst bereits
// archivierte Kunden nicht an dank archived_at IS NULL Filter).
export async function POST() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const admin = createAdminClient();

  // Direkte SQL waere am elegantesten; via PostgREST machen wir das in zwei
  // Schritten: erst die zu archivierenden IDs ermitteln, dann updaten.
  // RPC waere alternativer Weg, aber vermeidet Stored-Procedure-Setup.

  // Aktive Kunden (archived_at IS NULL), nicht Verwaltung, mit mindestens
  // einem Auftrag, aber ohne juengsten Auftrag innerhalb der letzten 365 Tage.
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

  // Schritt 1: alle aktiven, nicht-Verwaltungs-Kunden mit Aufträgen holen,
  // die KEINEN juengsten Auftrag haben. Wir laden Kunden + ihren neuesten
  // Auftrag-Datum via Aggregation in einem Schritt.
  // PostgREST: Customer mit jobs!inner und max(start_date) ist nicht direkt
  // moeglich. Einfacher: alle aktiven Kunden laden, dann pro Kunde den
  // letzten Job-Datum querien. Bei wenigen Kunden OK, bei tausenden zu teuer.
  //
  // Pragmatisch: laden Kunden-IDs mit aelteren Auftraegen via einer
  // Filter-Query (latest start_date < cutoff). Auftraege haben start_date.

  // Wir holen alle Kunden-IDs die einen Auftrag haben — und checken pro ID
  // ob der juengste vor cutoff liegt. Sequentiell waere langsam, also bulk:

  // 1) Alle aktiven, nicht-archivierten, nicht-Verwaltungs-Kunden
  //    Verwaltung = es existiert eine Zeile in locations mit customer_id = c.id.
  const { data: candidates, error: candErr } = await admin
    .from("customers")
    .select("id, locations:locations!locations_customer_id_fkey(id)")
    .is("archived_at", null);
  if (candErr) {
    return NextResponse.json({ success: false, error: candErr.message }, { status: 500 });
  }

  // Filter: nur die ohne Verwaltungs-Verknuepfung
  type Cand = { id: string; locations: { id: string }[] | null };
  const nonAdmin = ((candidates ?? []) as Cand[]).filter(
    (c) => !c.locations || c.locations.length === 0,
  );
  if (nonAdmin.length === 0) {
    return NextResponse.json({ success: true, archived: 0 });
  }

  // 2) Pro Kandidat juengsten Auftrag-Datum ermitteln. Bulk-Query:
  //    alle Auftraege fuer die Kandidaten-IDs, gruppiert nach customer_id mit max(start_date).
  //    PostgREST hat keinen direkten GROUP BY — aber wir koennen alle Auftraege laden
  //    und client-seitig gruppieren. Bei zehntausenden Auftraegen wird das gross.
  //    Fuer Eventline-Skala (Hunderte aktive Kunden) ist das fein.
  const candidateIds = nonAdmin.map((c) => c.id);
  const { data: jobs, error: jobsErr } = await admin
    .from("jobs")
    .select("customer_id, start_date")
    .in("customer_id", candidateIds)
    .neq("is_deleted", true);
  if (jobsErr) {
    return NextResponse.json({ success: false, error: jobsErr.message }, { status: 500 });
  }

  // Map customer_id -> juengstes start_date (oder null wenn kein job)
  const latestByCustomer = new Map<string, string | null>();
  for (const id of candidateIds) latestByCustomer.set(id, null);
  for (const j of (jobs ?? []) as { customer_id: string | null; start_date: string | null }[]) {
    if (!j.customer_id) continue;
    const cur = latestByCustomer.get(j.customer_id);
    const candDate = j.start_date;
    if (!candDate) continue;
    if (!cur || candDate > cur) latestByCustomer.set(j.customer_id, candDate);
  }

  // Zu archivierende IDs: mindestens ein Auftrag (latest != null) UND latest < oneYearAgo.
  const toArchive: string[] = [];
  for (const [cid, latest] of latestByCustomer.entries()) {
    if (!latest) continue;
    if (latest < oneYearAgo) toArchive.push(cid);
  }

  if (toArchive.length === 0) {
    return NextResponse.json({ success: true, archived: 0 });
  }

  const { error: upErr } = await admin
    .from("customers")
    .update({ archived_at: new Date().toISOString() })
    .in("id", toArchive);
  if (upErr) {
    return NextResponse.json({ success: false, error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, archived: toArchive.length });
}
