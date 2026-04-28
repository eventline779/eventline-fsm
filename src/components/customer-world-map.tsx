"use client";

/**
 * Weltkarte mit Kunden-Heatmap pro Land. Lädt einmalig die address_country-
 * Spalte aller aktiven Kunden, gruppiert client-seitig nach ISO-2-Code und
 * faerbt Laender per react-svg-worldmap (Choropleth, kein Tile-Server).
 *
 * Skaliert: holt nur die Country-Spalte (klein), gruppiert in O(N) im Map.
 * Bei 10k+ Kunden waere ein server-seitiges GROUP BY via RPC sinnvoller —
 * fuer aktuelle Skala reicht client-aggregation.
 */

import { useEffect, useState } from "react";
import { WorldMap } from "react-svg-worldmap";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "next-themes";

type CountryDatum = { country: string; value: number };

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
        counts.set(code, (counts.get(code) ?? 0) + 1);
        totalCount++;
      }
      setData(Array.from(counts.entries()).map(([country, value]) => ({ country, value })));
      setTotal(totalCount);
      setLoading(false);
    }
    load();

    // Bei Aenderungen an Kunden-Daten neu laden (anlegen/archivieren/loeschen)
    const handler = () => load();
    window.addEventListener("customers:invalidate", handler);
    return () => window.removeEventListener("customers:invalidate", handler);
  }, []);

  if (loading || data.length === 0) return null;

  const countryCount = data.length;

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
      <div className="flex justify-center p-2">
        <WorldMap
          color={isDark ? "#f87171" : "#dc2626"}
          backgroundColor="transparent"
          borderColor={isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}
          size="responsive"
          data={data as Parameters<typeof WorldMap>[0]["data"]}
          tooltipTextFunction={(ctx) =>
            `${ctx.countryName}: ${ctx.countryValue ?? 0} ${(ctx.countryValue ?? 0) === 1 ? "Kunde" : "Kunden"}`
          }
        />
      </div>
    </div>
  );
}
