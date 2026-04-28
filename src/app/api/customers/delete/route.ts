import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

// Soft-Delete: is_active=false statt hartem DELETE.
// Begründung: customers.id wird per FK aus jobs / documents / locations /
// rental_requests referenziert (alle ON DELETE NO ACTION). Ein Hard-Delete
// scheitert immer wenn der Kunde irgendwo erwähnt ist — bisher hat die UI
// trotzdem "gelöscht" gemeldet, weil der Frontend-Filter den Kunden lokal
// rauswarf, der DB-State aber unveraendert blieb. Mit Soft-Delete bleibt die
// Auftragshistorie konsistent und der Kunde verschwindet sauber aus der
// Liste (alle Listen-Queries filtern auf is_active=true).
export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const { customerId, code } = await request.json();

  if (code !== "5225") {
    return NextResponse.json({ success: false, error: "Falscher Code" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("customers")
    .update({ is_active: false })
    .eq("id", customerId)
    .select("id");

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json(
      { success: false, error: "Kunde nicht gefunden oder schon entfernt" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
