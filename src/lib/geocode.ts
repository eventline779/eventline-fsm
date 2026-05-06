/**
 * Server-seitiger Geocoder via Nominatim (OpenStreetMap, free, kein API-Key).
 *
 * Nominatim Usage Policy:
 * - max 1 req/sec — bei Backfill MUSS throttled werden
 * - User-Agent ist verpflichtend (sonst HTTP 403)
 * - countrycodes=ch eingrenzen damit "Bahnhofstrasse 1" nicht in Wien landet
 *
 * Bewusst nur fuer Server-Side gedacht (api/geocode/*) — vom Client aus
 * wuerde jeder Browser einzeln raten und das Rate-Limit treffen.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Eventline-FSM/1.0 (leo@eventline-basel.com)";

export type GeocodeResult = { lat: number; lng: number };

export async function geocodeAddress(
  street: string | null,
  zip: string | null,
  city: string | null,
): Promise<GeocodeResult | null> {
  // Ohne Stadt nichts geocoden — sonst landen wir bei "irgendwo in CH"
  // mit unscharfem Punkt. Stadt allein reicht aber als Fallback.
  if (!city) return null;

  const parts = [street, zip, city].filter((p) => p && p.trim()).join(", ");
  const params = new URLSearchParams({
    q: parts,
    format: "json",
    limit: "1",
    countrycodes: "ch",
    addressdetails: "0",
  });

  try {
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "de" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
