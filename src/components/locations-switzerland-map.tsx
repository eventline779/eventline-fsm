"use client";

/**
 * Schweizer Karte mit Punkten fuer alle Verwaltungen + Raeume.
 *
 * Leaflet + react-leaflet, OpenStreetMap-Tiles. SSR ist explizit deaktiviert,
 * weil leaflet beim Modul-Load auf `window` zugreift und in Next.js sonst
 * im Server-Build crasht — der Map-Inhalt wird via dynamic-import geladen.
 *
 * City-/ZIP-Lookup ist hart-codiert fuer die wichtigsten Schweizer Staedte
 * + ZIP-Praefix-Fallback. Reicht fuer Eventline-Skala (CH-fokussiert);
 * fuer mehrere hundert Locations international waere echtes Geocoding sinnvoll.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
// Leaflet-CSS muss statisch importiert werden — Turbopack kann CSS nicht
// via runtime-import laden. Greift kein window an, daher SSR-safe.
import "leaflet/dist/leaflet.css";

// City -> [lat, lng] Lookup. Erweitern bei Bedarf.
const CITY_COORDS: Record<string, [number, number]> = {
  basel: [47.5596, 7.5886],
  zürich: [47.3769, 8.5417],
  zurich: [47.3769, 8.5417],
  bern: [46.9481, 7.4474],
  genf: [46.2044, 6.1432],
  geneva: [46.2044, 6.1432],
  genève: [46.2044, 6.1432],
  lausanne: [46.5197, 6.6323],
  luzern: [47.0502, 8.3093],
  lucerne: [47.0502, 8.3093],
  "st. gallen": [47.4245, 9.3767],
  "st gallen": [47.4245, 9.3767],
  winterthur: [47.5022, 8.7386],
  lugano: [46.0037, 8.9511],
  biel: [47.1368, 7.2466],
  thun: [46.7580, 7.6280],
  zug: [47.1662, 8.5155],
  schaffhausen: [47.6963, 8.6347],
  fribourg: [46.8065, 7.1619],
  neuenburg: [46.9930, 6.9311],
  neuchâtel: [46.9930, 6.9311],
  chur: [46.8499, 9.5320],
  sion: [46.2276, 7.3608],
  reinach: [47.4965, 7.5897],
  pratteln: [47.5210, 7.6952],
  bättwil: [47.4775, 7.5314],
  münchenstein: [47.5197, 7.6177],
};

// ZIP-Praefix-Center als Fallback wenn die Stadt nicht im Lookup ist.
const ZIP_CENTERS: Record<string, [number, number]> = {
  "1": [46.5, 6.5],   // Westschweiz
  "2": [47.0, 7.0],   // Jura/Neuenburg
  "3": [46.95, 7.45], // Bern
  "4": [47.5, 7.6],   // Basel/Nordwest
  "5": [47.4, 8.05],  // Aargau
  "6": [47.05, 8.3],  // Innerschweiz/Tessin
  "7": [46.85, 9.5],  // Graubünden
  "8": [47.37, 8.55], // Zürich
  "9": [47.42, 9.37], // Ostschweiz
};

function lookupCoords(city: string | null, zip: string | null): [number, number] | null {
  if (city) {
    const key = city.toLowerCase().trim();
    if (CITY_COORDS[key]) return CITY_COORDS[key];
  }
  if (zip) {
    const first = zip.charAt(0);
    if (ZIP_CENTERS[first]) return ZIP_CENTERS[first];
  }
  return null;
}

type MapItem = {
  id: string;
  name: string;
  type: "standort" | "raum";
  coords: [number, number];
};

// Innere Map-Komponente — wird via dynamic() ohne SSR geladen weil leaflet
// auf window beim Modul-Load zugreift. Eigene file-import via dynamic geht nicht
// trivial fuer named exports, daher Inline mit ssr:false.
const MapInner = dynamic(
  async () => {
    const { MapContainer, TileLayer, CircleMarker, Tooltip } = await import("react-leaflet");
    function Inner({ items }: { items: MapItem[] }) {
      return (
        <MapContainer
          center={[46.8, 8.2]}
          zoom={7}
          minZoom={7}
          maxZoom={12}
          maxBounds={[[45.5, 5.5], [48.0, 11.0]]}
          style={{ height: "320px", width: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap-Mitwirkende'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {items.map((item) => (
            <CircleMarker
              key={`${item.type}-${item.id}`}
              center={item.coords}
              radius={7}
              pathOptions={{
                color: item.type === "standort" ? "#dc2626" : "#2563eb",
                fillColor: item.type === "standort" ? "#dc2626" : "#2563eb",
                fillOpacity: 0.75,
                weight: 2,
              }}
            >
              <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                <span className="text-xs font-medium">{item.name}</span>
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      );
    }
    return Inner;
  },
  { ssr: false, loading: () => <div className="h-[320px] bg-muted animate-pulse" /> },
);

export function LocationsSwitzerlandMap() {
  const [items, setItems] = useState<MapItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const [locsRes, roomsRes] = await Promise.all([
        supabase.from("locations").select("id, name, address_zip, address_city").eq("is_active", true),
        supabase.from("rooms").select("id, name, address_zip, address_city").eq("is_active", true),
      ]);
      const result: MapItem[] = [];
      for (const l of (locsRes.data ?? []) as { id: string; name: string; address_zip: string | null; address_city: string | null }[]) {
        const coords = lookupCoords(l.address_city, l.address_zip);
        if (coords) result.push({ id: l.id, name: l.name, type: "standort", coords });
      }
      for (const r of (roomsRes.data ?? []) as { id: string; name: string; address_zip: string | null; address_city: string | null }[]) {
        const coords = lookupCoords(r.address_city, r.address_zip);
        if (coords) result.push({ id: r.id, name: r.name, type: "raum", coords });
      }
      setItems(result);
      setLoading(false);
    }
    load();
  }, []);

  if (loading || items.length === 0) return null;

  const standortCount = items.filter((i) => i.type === "standort").length;
  const raumCount = items.filter((i) => i.type === "raum").length;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Mini-Legende oben rechts ueberlagert (per absolute Position) */}
      <div className="relative">
        <MapInner items={items} />
        <div className="absolute top-2 right-2 z-[400] bg-card/95 dark:bg-card/95 border rounded-lg px-2.5 py-1.5 text-[10px] flex items-center gap-3 shadow-sm">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-600" />
            {standortCount} {standortCount === 1 ? "Verwaltung" : "Verwaltungen"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-600" />
            {raumCount} {raumCount === 1 ? "Raum" : "Räume"}
          </span>
        </div>
      </div>
    </div>
  );
}
