import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bexioContactUrl } from "@/lib/bexio";
import { requireUser } from "@/lib/api-auth";

// POST { customerId, bexioContactId }
//
// Verknuepft einen Eventline-Kunden mit einem existierenden Bexio-Kontakt.
// Wird vom Match-Modal aufgerufen wenn der User einen Kandidaten auswaehlt
// statt neu anzulegen.
//
// Service-Role-Update damit RLS nicht blockt.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser();
    if (auth.error) return auth.error;
    const { customerId, bexioContactId } = await request.json();
    if (!customerId || !bexioContactId) {
      return NextResponse.json(
        { success: false, error: "customerId + bexioContactId noetig" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("customers")
      .update({ bexio_contact_id: String(bexioContactId) })
      .eq("id", customerId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      bexioContactUrl: bexioContactUrl(parseInt(String(bexioContactId), 10)),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unbekannter Fehler";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
