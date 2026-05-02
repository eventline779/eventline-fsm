// Backfill-Endpoint: geocoded alle locations + rooms die noch keine
// latitude/longitude haben. Throttled auf 1.1s pro Aufruf wegen Nominatim's
// 1-req/sec Policy.
//
// POST ohne Body. Antwort listet pro Tabelle ok/fail/skip-Counts.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodeAddress } from "@/lib/geocode";

const NOMINATIM_THROTTLE_MS = 1100;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const result = {
    locations: { processed: 0, ok: 0, fail: 0 },
    rooms: { processed: 0, ok: 0, fail: 0 },
  };

  for (const table of ["locations", "rooms"] as const) {
    const { data: rows } = await admin
      .from(table)
      .select("id, address_street, address_zip, address_city")
      .is("latitude", null);

    for (const row of (rows ?? []) as Array<{
      id: string;
      address_street: string | null;
      address_zip: string | null;
      address_city: string | null;
    }>) {
      result[table].processed += 1;
      const coords = await geocodeAddress(row.address_street, row.address_zip, row.address_city);
      if (coords) {
        await admin
          .from(table)
          .update({ latitude: coords.lat, longitude: coords.lng })
          .eq("id", row.id);
        result[table].ok += 1;
      } else {
        result[table].fail += 1;
      }
      await sleep(NOMINATIM_THROTTLE_MS);
    }
  }

  return NextResponse.json({ ok: true, result });
}
