"use client";

/**
 * Europa-Karte mit Kunden-Heatmap pro Land. Faerbt nur europaeische Laender,
 * crop t per CSS-Scale auf den Europa-Ausschnitt — die zugrundeliegende
 * react-svg-worldmap rendert zwar weiterhin alle Laender, alle nicht-EU-Laender
 * werden ueber styleFunction transparent gesetzt.
 *
 * Skaliert client-seitig durch Gruppieren der address_country-Spalte aller
 * aktiven Kunden. Bei 10k+ Kunden waere ein DB-Aggregat (RPC) sinnvoller.
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

export function CustomerWorldMap() {
  const [data, setData] = useState<CountryDatum[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
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
      let totalCount = 0;
      for (const r of (rows ?? []) as { address_country: string | null }[]) {
        if (!r.address_country) continue;
        const code = r.address_country.toUpperCase();
        if (!EUROPE_ISO.has(code)) continue; // nicht-EU ignorieren in Heatmap
        counts.set(code, (counts.get(code) ?? 0) + 1);
        totalCount++;
      }
      setData(Array.from(counts.entries()).map(([country, value]) => ({ country, value })));
      setTotal(totalCount);
      setLoading(false);
    }
    load();

    const handler = () => load();
    window.addEventListener("customers:invalidate", handler);
    return () => window.removeEventListener("customers:invalidate", handler);
  }, []);

  if (loading || data.length === 0) return null;

  const countryCount = data.length;

  // Theme-abhaengige Farben
  const baseLand = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const baseStroke = isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)";
  const activeColor = isDark ? "248, 113, 113" : "220, 38, 38"; // red-400 / red-600

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Wo unsere Kunden sind
        </h3>
        <span className="text-[10px] text-muted-foreground">
          {total} {total === 1 ? "Kunde" : "Kunden"} in {countryCount} {countryCount === 1 ? "Land" : "Ländern"}
        </span>
      </div>
      {/* CSS-Crop auf den Europa-Bereich der Mercator-Weltkarte: scale + Origin
          auf ~Mitte Europa. Wrapper hat overflow:hidden, sodass nur der gezoomte
          Ausschnitt sichtbar ist. Hoehe so gewaehlt, dass Europa von Skandinavien
          bis Mittelmeer reinpasst. */}
      <div className="relative overflow-hidden" style={{ height: 360 }}>
        <div
          className="absolute inset-0"
          style={{
            transform: "scale(2.6)",
            transformOrigin: "53% 30%",
          }}
        >
          <WorldMap
            color="transparent"
            backgroundColor="transparent"
            size="responsive"
            data={data as Parameters<typeof WorldMap>[0]["data"]}
            styleFunction={(ctx) => {
              const isEurope = EUROPE_ISO.has(ctx.countryCode);
              if (!isEurope) {
                return { fill: "transparent", stroke: "transparent" };
              }
              // ctx.countryValue ist generisch (string | number) — cast zu number
              // weil unsere Daten Counts sind.
              const v = Number(ctx.countryValue ?? 0);
              const maxV = Math.max(Number(ctx.maxValue) || 0, 1);
              if (v <= 0) {
                return { fill: baseLand, stroke: baseStroke, strokeWidth: 0.5 };
              }
              // Linear-Schattierung: 0.3 (min) bis 1.0 (max). Sorgt dafuer dass
              // auch Laender mit 1 Kunden klar sichtbar sind.
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
