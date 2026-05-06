import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";

// POST { customerId }
//
// Hard-Delete — funktioniert NUR wenn der Kunde keinerlei FK-Verknuepfungen
// hat (jobs, documents, locations als Verwaltung, rental_requests).
// Wenn doch: 409 mit { reason: "has-references", counts: {...} }, damit das
// Frontend stattdessen den Archive-Flow anbieten kann.
//
// Code-Bestaetigung wurde entfernt — Schutz wird spaeter via User-Rollen
// (RLS / Policy) gemacht.
export async function POST(request: Request) {
  const auth = await requirePermission("kunden:delete");
  if (auth.error) return auth.error;

  const { customerId } = await request.json();
  if (!customerId) {
    return NextResponse.json({ success: false, error: "customerId fehlt" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Erst zaehlen ob FK-Verknuepfungen bestehen — keine UPDATE-Spielereien,
  // einfach und transparent. Parallel ausfuehren.
  const [jobsRes, docsRes, locsRes, rrRes] = await Promise.all([
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
    supabase.from("locations").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
    supabase.from("rental_requests").select("id", { count: "exact", head: true }).eq("customer_id", customerId),
  ]);

  const counts = {
    jobs: jobsRes.count ?? 0,
    documents: docsRes.count ?? 0,
    locations: locsRes.count ?? 0,
    rental_requests: rrRes.count ?? 0,
  };
  const total = counts.jobs + counts.documents + counts.locations + counts.rental_requests;

  if (total > 0) {
    return NextResponse.json(
      { success: false, reason: "has-references", counts },
      { status: 409 },
    );
  }

  const { error } = await supabase.from("customers").delete().eq("id", customerId);
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
