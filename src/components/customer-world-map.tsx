"use client";

/**
 * Europa-Karte mit Kunden-Heatmap pro Land. Faerbt nur europaeische Laender,
 * der Rest der Welt wird transparent gerendert. Das SVG der Library wird
 * gross gerendert (2400px) und absolut positioniert in einem kleineren
 * Wrapper, sodass nur der Europa-Ausschnitt sichtbar ist.
 */

import { useEffect, useState } from "react";
import { WorldMap } from "react-svg-worldmap";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "next-themes";

type CountryDatum = { country: string; value: number };

// Europa (inkl. UK + EFTA + Westbalkan + Tuerkei). Russland bewusst ausgelassen
// (sonst zoomt die Karte zu weit raus). Anpassbar wenn Kundenkreis sich aendert.
const EUROPE_ISO = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GR",
  "HR", "HU", "IE", "IS", "IT", "LT", "LU", "LV", "MT", "NL", "NO", "PL", "PT",
  "RO", "SE", "SI", "SK", "CH", "LI",
  "AL", "BA", "BY", "MD", "ME", "MK", "RS", "UA", "XK", "TR",
]);

// Karten-Layout — fixe Pixel-Werte, damit die Europa-Position deterministisch
// ist. SVG wird auf 2400 Pixel breit gerendert; Offsets verschieben den
// Europa-Bereich in die Mitte des sichtbaren Wrappers.
const SVG_WIDTH = 2400;
const SVG_HEIGHT = SVG_WIDTH * 0.75; // = 1800, lib's heightRatio
const VIEW_HEIGHT = 360;
// Europa-Mittelpunkt im 2400×1800-Mercator (longitude ~12°, latitude ~52°):
// x = (12+180)/360 * 2400 = 1280, y = ~525 (visuell justiert)
// Wrapper soll Europa zentrieren — d.h. center-of-europe minus halbe wrapper-dim.
const EUROPE_CENTER_X = 1280;
const EUROPE_CENTER_Y = 525;

export function CustomerWorldMap() {
  const [data, setData] = useState<CountryDatum[]>([]);
  const [loading, setLoading] = useState(true);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: rows } = await supabase
        .from("customers")
        .select("address_country")
        .eq("is_active", true)
        .is("archived_at", null);
      const counts = new Map<string, number>();
      for (const r of (rows ?? []) as { address_country: string | null }[]) {
        if (!r.address_country) continue;
        const code = r.address_country.toUpperCase();
        if (!EUROPE_ISO.has(code)) continue;
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
      setData(Array.from(counts.entries()).map(([country, value]) => ({ country, value })));
      setLoading(false);
    }
    load();

    const handler = () => load();
    window.addEventListener("customers:invalidate", handler);
    return () => window.removeEventListener("customers:invalidate", handler);
  }, []);

  if (loading || data.length === 0) return null;

  // Theme-abhaengige Farben
  const baseLand = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const baseStroke = isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)";
  const activeColor = isDark ? "248, 113, 113" : "220, 38, 38"; // red-400 / red-600

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Wrapper: feste Hoehe, max. Breite, overflow:hidden — clipped auf Europa.
          Mittelpunkt-Offsets sind in JS-Konstanten oben definiert. */}
      <div
        className="relative overflow-hidden mx-auto"
        style={{ height: VIEW_HEIGHT, maxWidth: 900 }}
      >
        {/* Wrapper-Breite kennen wir nicht (responsiv) — wir verschieben das
            grosse SVG so, dass Europa in der wrapper-Mitte landet. transform:
            translate dynamisch via inline style mit calc auf 50%. */}
        <div
          className="absolute"
          style={{
            width: SVG_WIDTH,
            height: SVG_HEIGHT,
            // Europa-Mittelpunkt soll auf wrapper-Mittelpunkt landen:
            // left so, dass EUROPE_CENTER_X auf 50% der Wrapper-Breite faellt
            left: `calc(50% - ${EUROPE_CENTER_X}px)`,
            top: -(EUROPE_CENTER_Y - VIEW_HEIGHT / 2),
          }}
        >
          <WorldMap
            color="transparent"
            backgroundColor="transparent"
            size={SVG_WIDTH}
            data={data as Parameters<typeof WorldMap>[0]["data"]}
            styleFunction={(ctx) => {
              const isEurope = EUROPE_ISO.has(ctx.countryCode);
              if (!isEurope) {
                return { fill: "transparent", stroke: "transparent" };
              }
              const v = Number(ctx.countryValue ?? 0);
              const maxV = Math.max(Number(ctx.maxValue) || 0, 1);
              if (v <= 0) {
                return { fill: baseLand, stroke: baseStroke, strokeWidth: 0.5 };
              }
              // Linear-Schattierung: 0.3 (min) bis 1.0 (max) — auch 1-Kunden-Laender
              // sind klar sichtbar.
              const intensity = 0.3 + (v / maxV) * 0.7;
              return {
                fill: `rgba(${activeColor}, ${intensity})`,
                stroke: baseStroke,
                strokeWidth: 0.5,
              };
            }}
            tooltipTextFunction={(ctx) =>
              `${ctx.countryName}: ${ctx.countryValue ?? 0} ${(ctx.countryValue ?? 0) === 1 ? "Kunde" : "Kunden"}`
            }
          />
        </div>
      </div>
    </div>
  );
}
