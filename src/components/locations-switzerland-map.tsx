"use client";

/**
 * Schweizer Karte: CartoDB nolabels-Tiles (light_nolabels Tag, dark_nolabels
 * Nacht — beides effektiv schwarz/weiss mit Strassen, Fluessen, Terrain) +
 * eine kraeftige Schweizer Grenz-Linie obendrueber.
 *
 *   - Outline aus @geo-maps/countries-land-100m, einmalig extrahiert nach
 *     src/data/swiss-boundary.json. Nur Outer-Ring (~2570 Punkte) — Inner
 *     Lake-Rings sind weggefiltert sonst rendert Leaflet jeden Lake als
 *     extra Stroke-Schleife = visueller Laerm.
 *   - 5 Orientierungs-Staedte als Custom Text-Labels (Tiles haben keine).
 *   - Daten-Marker via leaflet.markercluster: distanz-basiertes Clustering,
 *     loest sich beim Reinzoomen auf. Kein Spiderfy, keine Linien zwischen
 *     Punkten — gleicher-Coord-Cluster oeffnet Popup mit Liste statt sinnlos
 *     zu zoomen.
 *
 * SSR deaktiviert weil leaflet auf window beim Modul-Load zugreift.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import swissBoundary from "@/data/swiss-boundary.json";
import type { MarkerCluster as LMarkerCluster } from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
// Types muessen geladen werden damit LMarkerCluster zur Compile-Time
// existiert (Augmentation des leaflet-Moduls aus @types/leaflet.markercluster).
import type {} from "leaflet.markercluster";

// Schweizer Aussengrenze aus @geo-maps/countries-land-100m (Build-time
// extrahiert, ~2570 Punkte fuer die Hauptkontur — feingenug bis Zoom 13).
// Render direkt als Polygon ohne Fill, nur Stroke = die echte Grenzlinie.
const SWISS_BOUNDARY = swissBoundary as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

// 5 Orientierungs-Staedte. Tiles sind nolabels — diese Labels rendern wir selbst.
const MAJOR_CITIES: Array<{ name: string; coords: [number, number] }> = [
  { name: "Basel", coords: [47.5596, 7.5886] },
  { name: "Zürich", coords: [47.3769, 8.5417] },
  { name: "Bern", coords: [46.9481, 7.4474] },
  { name: "Genf", coords: [46.2044, 6.1432] },
  { name: "Lausanne", coords: [46.5197, 6.6323] },
];

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

const SWISS_BOUNDS: [[number, number], [number, number]] = [[45.85, 5.95], [47.85, 10.55]];
const SWISS_BOUNDS_PADDING: [number, number] = [12, 12];
const MAP_MAX_BOUNDS: [[number, number], [number, number]] = [[45.5, 5.5], [48.05, 11.0]];

type MapItem = {
  id: string;
  name: string;
  type: "standort" | "raum";
  coords: [number, number];
};

const MapInner = dynamic(
  async () => {
    const RL = await import("react-leaflet");
    const L = (await import("leaflet")).default;
    // Side-effect: extended L mit L.markerClusterGroup. CSS ist top-level oben.
    await import("leaflet.markercluster");
    // Side-effect: registriert smoothWheelZoom-Handler auf L.Map. Default-
    // scrollWheelZoom ist step-basiert mit Animation pro Wheel-Tick → ruckelt
    // unter schnellem Scrollen. Plugin macht es kontinuierlich/stufenlos.
    await import("@luomus/leaflet-smooth-wheel-zoom");

    const { MapContainer, TileLayer, Marker, GeoJSON, useMap } = RL;

    function makeCityLabel(name: string, isDark: boolean) {
      const fg = isDark ? "rgba(255,255,255,0.55)" : "#666";
      const stroke = isDark ? "#0a0a0a" : "white";
      return L.divIcon({
        className: "",
        html: `<div style="font-size:10px;font-weight:600;color:${fg};letter-spacing:0.5px;text-transform:uppercase;text-shadow:0 0 3px ${stroke},0 0 3px ${stroke},0 0 3px ${stroke};pointer-events:none;white-space:nowrap;">${name}</div>`,
        iconSize: [80, 14],
        iconAnchor: [40, -10],
      });
    }

    function makeSingleIcon(item: MapItem, isDark: boolean) {
      const colorRgb = item.type === "standort" ? "239, 68, 68" : "59, 130, 246";
      const innerColor = `rgb(${colorRgb})`;
      const borderColor = isDark ? "#0a0a0a" : "white";
      const size = 18;
      const html = `<div class="eventline-cluster-marker eventline-cluster-inner" style="width:${size}px;height:${size}px;border-radius:50%;background:${innerColor};border:2.5px solid ${borderColor};box-shadow:0 2px 8px rgba(0,0,0,.28);"></div>`;
      return L.divIcon({ className: "", html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    }

    function makeClusterDivIcon(items: MapItem[], isDark: boolean) {
      const standortCount = items.filter((i) => i.type === "standort").length;
      const total = items.length;
      const colorRgb = standortCount > 0 ? "239, 68, 68" : "59, 130, 246";
      const innerColor = `rgb(${colorRgb})`;
      const ringColor = `rgba(${colorRgb}, 0.35)`;
      const innerSize = Math.min(22 + Math.sqrt(total) * 4, 36);
      const outerSize = innerSize + 14;
      const innerBorder = isDark ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.95)";
      const html = `<div class="eventline-cluster-marker" style="width:${outerSize}px;height:${outerSize}px;border-radius:50%;background:${ringColor};display:flex;align-items:center;justify-content:center;"><div class="eventline-cluster-inner" style="width:${innerSize}px;height:${innerSize}px;border-radius:50%;background:${innerColor};color:white;font-size:12px;font-weight:700;letter-spacing:-0.02em;display:flex;align-items:center;justify-content:center;border:2px solid ${innerBorder};box-shadow:0 2px 6px rgba(0,0,0,.22);">${total}</div></div>`;
      return L.divIcon({ className: "", html, iconSize: L.point(outerSize, outerSize) });
    }

    function ClusterLayer({ items, isDark }: { items: MapItem[]; isDark: boolean }) {
      const map = useMap();
      const router = useRouter();
      useEffect(() => {
        // WeakMap traegt das item zum jeweiligen Marker; im iconCreateFunction
        // bekommen wir aus cluster.getAllChildMarkers() die rohen L.Marker-
        // Instanzen und schauen die Items hier raus.
        const itemByMarker = new WeakMap<L.Marker, MapItem>();
        const group = L.markerClusterGroup({
          // Kein Spiderfy, keine Linien — Leo's Wunsch. Punkte mit gleichen
          // Coords bleiben permanent als Cluster mit Count.
          spiderfyOnMaxZoom: false,
          showCoverageOnHover: false,
          // Wir handhaben Click selbst (langsamer flyTo, Popup bei Same-Coord-
          // Cluster). Default-Setup wuerde sofort raus-zoomen.
          zoomToBoundsOnClick: false,
          // Distanz in Pixeln bei der noch geclustert wird. 60 = etwas enger als
          // Default 80, sodass Cluster sich frueher aufloesen beim Reinzoomen.
          maxClusterRadius: 60,
          iconCreateFunction: (cluster) => {
            const childMarkers = cluster.getAllChildMarkers() as L.Marker[];
            const childItems = childMarkers
              .map((m) => itemByMarker.get(m))
              .filter((x): x is MapItem => x !== undefined);
            return makeClusterDivIcon(childItems, isDark);
          },
        });

        function detailUrl(item: MapItem): string {
          return item.type === "standort" ? `/standorte/${item.id}` : `/raeume/${item.id}`;
        }
        function tooltipRow(item: MapItem): string {
          const icon = item.type === "standort" ? "🏢" : "🚪";
          return `<div class="eventline-tooltip-row">${icon} ${item.name}</div>`;
        }

        // Cluster-Click: smooth flyToBounds wenn die Bounds raum-groesser sind,
        // sonst Popup mit Detail-Links (Same-Coord-Cluster wie BAU3+Barakuba —
        // Reinzoomen wuerde sie nie trennen, also gleich Auswahl anbieten).
        group.on("clusterclick", (e: L.LeafletEvent) => {
          const cluster = (e as unknown as { layer: LMarkerCluster }).layer;
          const bounds = cluster.getBounds();
          const ne = bounds.getNorthEast();
          const sw = bounds.getSouthWest();
          const isPoint = Math.abs(ne.lat - sw.lat) < 1e-6 && Math.abs(ne.lng - sw.lng) < 1e-6;
          const childItems = cluster
            .getAllChildMarkers()
            .map((m) => itemByMarker.get(m as L.Marker))
            .filter((x): x is MapItem => x !== undefined);

          if (isPoint) {
            const html = childItems.map((i) => {
              const icon = i.type === "standort" ? "🏢" : "🚪";
              return `<a href="${detailUrl(i)}" class="eventline-popup-link" data-eventline-href="${detailUrl(i)}">${icon} <span>${i.name}</span></a>`;
            }).join("");
            cluster.unbindTooltip();
            cluster
              .bindPopup(html, {
                className: "eventline-map-popup",
                closeButton: false,
                offset: L.point(0, -8),
                // Autopan damit Popup nicht aus dem (overflow:hidden) Wrapper
                // raus-clippt. Padding gibt Atemluft zum Rand.
                autoPan: true,
                autoPanPadding: L.point(20, 24),
                keepInView: true,
              })
              .openPopup();
          } else {
            // duration 1.0s + maxZoom 13 + padding [60,60]: smooth, kein
            // ueber-Reinzoomen, Punkte haben Kontext rundherum.
            map.flyToBounds(bounds, {
              duration: 1.0,
              padding: [60, 60],
              maxZoom: 13,
              easeLinearity: 0.25,
            });
          }
        });

        // Cluster-Hover: dynamischer Tooltip mit allen enthaltenen Items.
        // Skip wenn Popup bereits offen ist — sonst tauscht der Tooltip das
        // Popup aus sobald Maus uebers Cluster wandert.
        group.on("clustermouseover", (e: L.LeafletEvent) => {
          const cluster = (e as unknown as { layer: LMarkerCluster }).layer;
          if (cluster.getPopup()?.isOpen()) return;
          const childItems = cluster
            .getAllChildMarkers()
            .map((m) => itemByMarker.get(m as L.Marker))
            .filter((x): x is MapItem => x !== undefined);
          cluster.unbindTooltip();
          cluster
            .bindTooltip(childItems.map(tooltipRow).join(""), {
              className: "eventline-map-tooltip",
              // direction: "auto" → Leaflet flippt automatisch nach unten/seitlich
              // wenn am Top-Edge sonst clipping. Offset (16,-4) gibt horizontal
              // genug Luft fuer die Cluster-Halo (bis ~22px Radius), vertikal
              // leichten Lift fuer top/bottom.
              direction: "auto",
              offset: L.point(16, -4),
            })
            .openTooltip();
        });

        // SPA-Navigation in Cluster-Popups: data-eventline-href Anchors
        // intercepten und ueber Next-Router routen statt full-page reload.
        group.on("popupopen", (e: L.PopupEvent) => {
          const el = e.popup.getElement();
          if (!el) return;
          el.querySelectorAll<HTMLAnchorElement>("a[data-eventline-href]").forEach((a) => {
            a.addEventListener("click", (ev) => {
              ev.preventDefault();
              router.push(a.dataset.eventlineHref ?? "/");
            });
          });
        });

        for (const item of items) {
          const marker = L.marker(item.coords, {
            icon: makeSingleIcon(item, isDark),
          });
          marker.bindTooltip(tooltipRow(item), {
            className: "eventline-map-tooltip",
            // Single-Marker (18px Durchmesser, ~9px Radius) — kleinerer
            // Offset reicht. direction:auto flippt am Top-Edge nach unten.
            direction: "auto",
            offset: L.point(10, -2),
          });
          marker.on("click", () => router.push(detailUrl(item)));
          itemByMarker.set(marker, item);
          group.addLayer(marker);
        }

        map.addLayer(group);
        return () => {
          map.removeLayer(group);
        };
        // router ist stabil in einer Session — keine Dep noetig.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [items, isDark, map]);
      return null;
    }

    function Inner({ items, isDark }: { items: MapItem[]; isDark: boolean }) {
      // CartoDB nolabels-Tiles: Strassen, Fluesse, Terrain — alles drin, nur
      // ohne baked-in Stadtnamen. Theme-Switch via key-Prop fuehrt Remount.
      const tileUrl = isDark
        ? "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";
      return (
        <MapContainer
          bounds={SWISS_BOUNDS}
          boundsOptions={{ padding: SWISS_BOUNDS_PADDING }}
          minZoom={7}
          maxZoom={18}
          maxBounds={MAP_MAX_BOUNDS}
          maxBoundsViscosity={1.0}
          zoomSnap={0}
          zoomDelta={0.5}
          style={{ height: "280px", width: "100%", background: isDark ? "#0a0a0a" : "#f5f5f7" }}
          scrollWheelZoom={false}
          attributionControl={false}
          zoomControl={true}
          // SmoothWheelZoom-Handler vom Plugin — kontinuierliche Zoom-
          // Animation statt step-basierter Wheel-Events.
          smoothWheelZoom={true}
          smoothSensitivity={1}
        >
          <TileLayer
            key={tileUrl}
            url={tileUrl}
            subdomains="abcd"
            maxZoom={20}
          />
          {/* Schweizer Grenz-Linie auf 100m-Praezision als kontinuierliche
              Kontur ueber den Tiles — nur Outer-Ring, kein Fill, klare Linie. */}
          <GeoJSON
            key={`border-${isDark ? "d" : "l"}`}
            data={SWISS_BOUNDARY}
            style={() => ({
              color: isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.7)",
              weight: 1.8,
              fill: false,
              lineCap: "round",
              lineJoin: "round",
            })}
            interactive={false}
          />
          {MAJOR_CITIES.map((c) => (
            <Marker
              key={`city-${c.name}`}
              position={c.coords}
              icon={makeCityLabel(c.name, isDark)}
              interactive={false}
            />
          ))}
          <ClusterLayer items={items} isDark={isDark} />
        </MapContainer>
      );
    }
    return Inner;
  },
  { ssr: false, loading: () => <div className="h-[280px] bg-muted animate-pulse rounded-xl" /> }, // muss mit MapContainer.style.height oben uebereinstimmen
);

export function LocationsSwitzerlandMap() {
  const [items, setItems] = useState<MapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const [locsRes, roomsRes] = await Promise.all([
        supabase.from("locations").select("id, name, address_zip, address_city, latitude, longitude").eq("is_active", true),
        supabase.from("rooms").select("id, name, address_zip, address_city, latitude, longitude").eq("is_active", true),
      ]);
      type Row = {
        id: string; name: string;
        address_zip: string | null; address_city: string | null;
        latitude: number | null; longitude: number | null;
      };
      // Stored Coords (geocoded via Nominatim) bevorzugen, sonst Stadt-Center-
      // Fallback. Bei Fallback landen mehrere Adressen in derselben Stadt
      // zwingend auf einem Punkt — bei stored Coords zeigt der Punkt die
      // tatsaechliche Adresse.
      function pickCoords(r: Row): [number, number] | null {
        if (r.latitude != null && r.longitude != null) return [r.latitude, r.longitude];
        return lookupCoords(r.address_city, r.address_zip);
      }
      const result: MapItem[] = [];
      for (const l of (locsRes.data ?? []) as Row[]) {
        const coords = pickCoords(l);
        if (coords) result.push({ id: l.id, name: l.name, type: "standort", coords });
      }
      for (const r of (roomsRes.data ?? []) as Row[]) {
        const coords = pickCoords(r);
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
      <div className="relative">
        <MapInner items={items} isDark={isDark} />
        <div className="absolute top-2 right-2 z-[400] bg-card/95 dark:bg-card/95 border rounded-lg px-2.5 py-1.5 text-[10px] flex items-center gap-3 shadow-sm">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {standortCount} {standortCount === 1 ? "Verwaltung" : "Verwaltungen"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            {raumCount} {raumCount === 1 ? "Raum" : "Räume"}
          </span>
        </div>
      </div>
    </div>
  );
}
