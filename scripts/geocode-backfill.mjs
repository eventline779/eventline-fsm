// One-Shot Geocode-Backfill fuer locations + rooms via Nominatim.
// Aufruf: node scripts/geocode-backfill.mjs
//
// Liest .env.local fuer SUPABASE_URL + SERVICE_ROLE_KEY. Throttled auf
// 1.1s pro Aufruf (Nominatim Policy 1 req/sec).

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

// .env.local naiv parsen — keine Library, kein dotenv noetig
const envPath = path.join(process.cwd(), ".env.local");
const envText = fs.readFileSync(envPath, "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Eventline-FSM/1.0 (leo@eventline-basel.com)";
const THROTTLE_MS = 1100;

async function geocode(street, zip, city) {
  if (!city) return null;
  const q = [street, zip, city].filter(Boolean).join(", ");
  const params = new URLSearchParams({
    q, format: "json", limit: "1", countrycodes: "ch",
  });
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "de" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const table of ["locations", "rooms"]) {
  const { data: rows, error } = await supabase
    .from(table)
    .select("id, name, address_street, address_zip, address_city")
    .is("latitude", null);
  if (error) {
    console.error(`[${table}] fetch error:`, error.message);
    continue;
  }
  console.log(`[${table}] ${rows.length} Zeilen ohne Coords`);
  for (const row of rows) {
    process.stdout.write(`  - ${row.name} ... `);
    const coords = await geocode(row.address_street, row.address_zip, row.address_city);
    if (!coords) {
      console.log("not found");
    } else {
      const { error: upErr } = await supabase
        .from(table)
        .update({ latitude: coords.lat, longitude: coords.lng })
        .eq("id", row.id);
      if (upErr) console.log("update error:", upErr.message);
      else console.log(`${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
    }
    await sleep(THROTTLE_MS);
  }
}
console.log("done");
