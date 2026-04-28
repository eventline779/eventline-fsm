"use client";

/**
 * Auflistung der Laender aus denen unsere Kunden kommen — Flagge + Land + Anzahl.
 * Sortiert nach Kundenzahl (haeufigste zuerst).
 *
 * Flaggen via flag-icons (CSS, selbst-gehostet) — nicht via Emoji, weil Windows
 * keine Flag-Emoji-Font hat und die Codepoints stattdessen als ISO-Buchstaben-
 * paare gerendert werden.
 *
 * Komponentenname bleibt "CustomerWorldMap" fuer Import-Kompatibilitaet — die
 * urspruengliche Karte war zu fragil bei der Crop-Math, Liste ist deterministisch.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import "flag-icons/css/flag-icons.min.css";

type CountryDatum = { country: string; count: number };

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
            {/* flag-icons CSS-Klasse: fi-{iso2-lowercase}, default 4:3-Verhaeltnis.
                Inline-block mit fester em-Breite damit alle Flaggen gleich gross
                erscheinen unabhaengig vom rendering. */}
            <span
              className={`fi fi-${d.country.toLowerCase()} inline-block shrink-0 rounded-sm shadow-sm`}
              style={{ width: "1.4em", height: "1.05em" }}
              aria-hidden
            />
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
