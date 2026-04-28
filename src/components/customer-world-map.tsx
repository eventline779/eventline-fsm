"use client";

/**
 * Auflistung der Laender aus denen unsere Kunden kommen — Flagge + Land + Anzahl.
 * Sortiert nach Kundenzahl (haeufigste zuerst). Flaggen via Emoji (Regional-
 * Indicator-Codepoints), keine externen Assets noetig.
 *
 * Komponentenname bleibt "CustomerWorldMap" fuer Import-Kompatibilitaet —
 * die Karte selbst war zu fragil bei den Cropping-Math, eine Liste ist
 * deterministisch und skaliert.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type CountryDatum = { country: string; count: number };

// ISO-2 → Emoji-Flag via Regional-Indicator-Symbol (U+1F1E6 + Buchstabe-A-Offset).
function flagEmoji(iso: string): string {
  if (!iso || iso.length !== 2) return "";
  return iso
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

// Lokalisiert via Intl — kein externes Mapping noetig. Fallback: ISO-Code.
const REGION_NAMES = typeof Intl !== "undefined" && "DisplayNames" in Intl
  ? new Intl.DisplayNames(["de"], { type: "region" })
  : null;

function countryName(iso: string): string {
  return REGION_NAMES?.of(iso.toUpperCase()) ?? iso;
}

export function CustomerWorldMap() {
  const [data, setData] = useState<CountryDatum[]>([]);
  const [loading, setLoading] = useState(true);

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
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
      const sorted: CountryDatum[] = Array.from(counts.entries())
        .map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
      setData(sorted);
      setLoading(false);
    }
    load();

    const handler = () => load();
    window.addEventListener("customers:invalidate", handler);
    return () => window.removeEventListener("customers:invalidate", handler);
  }, []);

  if (loading || data.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="flex flex-wrap gap-2">
        {data.map((d) => (
          <div
            key={d.country}
            className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-muted/50 text-sm"
            title={`${countryName(d.country)}: ${d.count} ${d.count === 1 ? "Kunde" : "Kunden"}`}
          >
            <span className="text-base leading-none" aria-hidden>{flagEmoji(d.country)}</span>
            <span className="font-medium">{countryName(d.country)}</span>
            <span className="text-muted-foreground tabular-nums text-xs">
              {d.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
