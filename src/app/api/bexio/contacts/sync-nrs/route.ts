import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getContactById } from "@/lib/bexio";
import { requirePermission } from "@/lib/api-auth";

// POST — Backfill: holt fuer alle Kunden mit bexio_contact_id aber ohne bexio_nr
// die menschenlesbare Kundennummer aus Bexio nach. Wird vom "Synchronisieren"-
// Banner auf /kunden ausgeloest.
//
// Response: { updated: number, skipped: number, failed: number }
export async function POST() {
  const auth = await requirePermission("bexio:use");
  if (auth.error) return auth.error;

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("customers")
    .select("id, bexio_contact_id")
    .not("bexio_contact_id", "is", null)
    .is("bexio_nr", null)
    .eq("is_active", true);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ success: true, updated: 0, skipped: 0, failed: 0 });
  }

  const admin = createAdminClient();
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  // Sequenziell — Bexio-API hat Rate-Limits. Bei vielen Kunden lieber etwas
  // langsamer als 429-Fehler.
  for (const row of rows) {
    try {
      const contactId = parseInt(String(row.bexio_contact_id), 10);
      if (!Number.isFinite(contactId)) {
        failed++;
        continue;
      }
      const contact = await getContactById(contactId);
      if (!contact?.nr) {
        skipped++;
        continue;
      }
      const { error: upErr } = await admin
        .from("customers")
        .update({ bexio_nr: contact.nr })
        .eq("id", row.id);
      if (upErr) {
        failed++;
      } else {
        updated++;
      }
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ success: true, updated, skipped, failed });
}
