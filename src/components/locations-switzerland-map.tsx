"use client";

/**
 * Schlichte Schweizer Karte mit Punkten pro Verwaltung + Raum.
 *
 * Rendering:
 * - Leaflet mit CartoDB Positron-Tiles (grauzonen-minimal, keine bunten POIs).
 * - 5 Major-Cities (Basel/Zuerich/Bern/Genf/Lausanne) als Text-Labels fuer
 *   Orientierung — keine Marker-Pins, nur Beschriftung.
 * - Datenpunkte pro Verwaltung/Raum: rote bzw. blaue Kreise.
 * - Cluster: Punkte mit identischer Coord (Rundung auf 3 Decimal) werden
 *   zu einem groesseren Kreis mit Anzahl-Zahl drin zusammengefasst.
 *
 * SSR ist deaktiviert weil leaflet auf window beim Modul-Load zugreift.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import "leaflet/dist/leaflet.css";

// Major-Cities die als Orientierungs-Labels auf der Karte erscheinen.
const MAJOR_CITIES: Array<{ name: string; coords: [number, number] }> = [
  { name: "Basel", coords: [47.5596, 7.5886] },
  { name: "Zürich", coords: [47.3769, 8.5417] },
  { name: "Bern", coords: [46.9481, 7.4474] },
  { name: "Genf", coords: [46.2044, 6.1432] },
  { name: "Lausanne", coords: [46.5197, 6.6323] },
];

// City -> [lat, lng] Lookup fuer die Geocoding der Datenpunkte.
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
  neuchâtel: [46.9930, 6.9311],
  chur: [46.8499, 9.5320],
  sion: [46.2276, 7.3608],
  reinach: [47.4965, 7.5897],
  pratteln: [47.5210, 7.6952],
  bättwil: [47.4775, 7.5314],
  münchenstein: [47.5197, 7.6177],
};

const ZIP_CENTERS: Record<string, [number, number]> = {
  "1": [46.5, 6.5], "2": [47.0, 7.0], "3": [46.95, 7.45], "4": [47.5, 7.6],
  "5": [47.4, 8.05], "6": [47.05, 8.3], "7": [46.85, 9.5], "8": [47.37, 8.55],
  "9": [47.42, 9.37],
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

type Cluster = {
  coords: [number, number];
  items: MapItem[];
};

// Cluster-Logik: Punkte mit identischer Coord (auf 3 Decimal gerundet ~ 100m)
// werden zusammengefasst. Reicht praktisch fuer "selbe Stadt" weil unsere
// Coord-Aufloesung ohnehin Stadt-genau ist.
function clusterByCoords(items: MapItem[]): Cluster[] {
  const groups = new Map<string, MapItem[]>();
  for (const item of items) {
    const key = `${item.coords[0].toFixed(3)},${item.coords[1].toFixed(3)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return Array.from(groups.values()).map((items) => ({
    coords: items[0].coords,
    items,
  }));
}

// Inner-Map als dynamic-import ohne SSR — leaflet braucht window beim Module-Load.
const MapInner = dynamic(
  async () => {
    const { MapContainer, TileLayer, Marker } = await import("react-leaflet");
    const L = (await import("leaflet")).default;

    function makeDataIcon(cluster: Cluster) {
      const standortCount = cluster.items.filter((i) => i.type === "standort").length;
      const raumCount = cluster.items.filter((i) => i.type === "raum").length;
      const total = cluster.items.length;
      // Farbe: bei Mischung Standort dominant (Verwaltung wichtiger als Reference);
      // sonst die Farbe des einzigen Typs.
      const color = standortCount > 0 ? "#dc2626" : "#2563eb";
      const size = total === 1 ? 14 : Math.min(14 + Math.sqrt(total) * 6, 36);
      const html = total === 1
        ? `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3);"></div>`
        : `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:600;">${total}</div>`;
      const tooltip = cluster.items.map((i) => `${i.type === "standort" ? "🏢" : "🚪"} ${i.name}`).join("\n");
      return { icon: L.divIcon({ className: "", html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }), tooltip, standortCount, raumCount };
    }

    function makeCityLabel(name: string) {
      // Schlichtes Text-Label, nicht-interaktiv. pointer-events:none damit es
      // Klicks auf darunterliegende Marker nicht schluckt.
      return L.divIcon({
        className: "",
        html: `<div style="font-size:10px;font-weight:600;color:#666;letter-spacing:0.5px;text-transform:uppercase;text-shadow:0 0 3px white,0 0 3px white;pointer-events:none;white-space:nowrap;">${name}</div>`,
        iconSize: [80, 14],
        iconAnchor: [40, -10], // Label sitzt OBERHALB des Coord-Punkts
      });
    }

    function Inner({ clusters }: { clusters: Cluster[] }) {
      return (
        <MapContainer
          center={[46.8, 8.2]}
          zoom={7}
          minZoom={7}
          maxZoom={10}
          maxBounds={[[45.5, 5.5], [48.0, 11.0]]}
          style={{ height: "320px", width: "100%", background: "#f5f5f7" }}
          scrollWheelZoom={false}
          attributionControl={false}
          zoomControl={false}
        >
          {/* CartoDB Positron — minimaler grauzonen Hintergrund, keine bunten POIs */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap &copy; CARTO'
          />
          {/* 5 Major-City-Labels fuer Orientierung */}
          {MAJOR_CITIES.map((c) => (
            <Marker
              key={`city-${c.name}`}
              position={c.coords}
              icon={makeCityLabel(c.name)}
              interactive={false}
            />
          ))}
          {/* Datenpunkte / Cluster */}
          {clusters.map((cluster, idx) => {
            const { icon, tooltip } = makeDataIcon(cluster);
            return (
              <Marker
                key={`cluster-${idx}`}
                position={cluster.coords}
                icon={icon}
                title={tooltip}
              />
            );
          })}
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

  const clusters = clusterByCoords(items);
  const standortCount = items.filter((i) => i.type === "standort").length;
  const raumCount = items.filter((i) => i.type === "raum").length;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="relative">
        <MapInner clusters={clusters} />
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
