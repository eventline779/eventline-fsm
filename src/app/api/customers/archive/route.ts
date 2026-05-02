import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/api-auth";

// POST { customerId }
// Archiviert einen Kunden: setzt archived_at = NOW(). Standard-Listen filtern
// auf archived_at IS NULL, der Kunde verschwindet also aus der Ansicht. Alle
// FK-Beziehungen (Auftraege, Dokumente, Standorte) bleiben unveraendert.
//
// Permission: kunden:archive (separat von kunden:edit — Admin kann
// Archive-Recht erteilen ohne Edit-Recht und umgekehrt).
export async function POST(request: NextRequest) {
  const auth = await requirePermission("kunden:archive");
  if (auth.error) return auth.error;

  const { customerId } = await request.json();
  if (!customerId) {
    return NextResponse.json({ success: false, error: "customerId fehlt" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customers")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", customerId)
    .is("archived_at", null)
    .select("id");

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json(
      { success: false, error: "Kunde nicht gefunden oder schon archiviert" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
