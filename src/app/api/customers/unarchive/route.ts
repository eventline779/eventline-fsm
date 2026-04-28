import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api-auth";

// POST { customerId }
// Reaktiviert einen archivierten Kunden — archived_at = NULL.
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const { customerId } = await request.json();
  if (!customerId) {
    return NextResponse.json({ success: false, error: "customerId fehlt" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("customers")
    .update({ archived_at: null })
    .eq("id", customerId)
    .select("id");

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json(
      { success: false, error: "Kunde nicht gefunden" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
