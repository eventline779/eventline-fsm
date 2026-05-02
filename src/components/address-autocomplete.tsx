"use client";

/**
 * Adress-Autocomplete für freie Ort-Eingaben.
 * Zeigt parallel:
 *   1. Eigene Locations aus der DB (z.B. "sc" → SCALA BASEL)
 *   2. Google Places Vorschläge (Strassenadressen mit PLZ + Ort)
 *
 * Google läuft nur, wenn NEXT_PUBLIC_GOOGLE_MAPS_API_KEY gesetzt ist.
 * Ohne Key funktionieren weiterhin die lokalen Locations.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, Building2, DoorOpen } from "lucide-react";

type LocalLocation = {
  id: string;
  name: string;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
};

// Raeume haben das gleiche Adress-Shape wie Locations — Type-Alias macht das explizit.
type LocalRoom = LocalLocation;

type Suggestion =
  | { kind: "location"; id: string; label: string; sub: string; value: string }
  | { kind: "room"; id: string; label: string; sub: string; value: string }
  | { kind: "google"; placeId: string; label: string; sub: string };

/** Strukturierter Adress-Block — Output an die Form wenn der Caller die einzelnen
 *  Felder (Strasse / PLZ / Ort / Land) braucht statt eines kombinierten Strings. */
export interface ParsedAddress {
  street: string;
  postcode: string;
  city: string;
  /** ISO-2-Code, z.B. 'CH', 'DE'. Leer wenn nicht erkennbar. */
  country: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Eigene Locations werden direkt vor Google geladen — match per Substring auf name + city */
  localLocations: LocalLocation[];
  /** Optional: bekannte externe Veranstaltungsraeume — werden zwischen
   *  Locations und Google als Vorschlaege gezeigt. Pickt der User einen Raum,
   *  feuert onRoomPick statt nur onChange. */
  localRooms?: LocalRoom[];
  placeholder?: string;
  id?: string;
  required?: boolean;
  /** Wenn gesetzt: Bei Google-Place-Auswahl wird die Adresse strukturiert
   *  zurueckgegeben (Strasse / PLZ / Ort / Land). onChange bekommt dann nur
   *  die Strasse — Caller fuellt die anderen Felder via onPlace. Ohne onPlace
   *  bleibt das Verhalten Legacy (onChange mit kombiniertem formatted_address). */
  onPlace?: (parsed: ParsedAddress) => void;
  /** Wird gefeuert wenn der User einen Raum aus den Vorschlaegen pickt.
   *  Der Caller setzt damit room_id im Form-State. Bei freier Eingabe wird
   *  dieser Callback NICHT gefeuert — der Caller sollte room_id in seinem
   *  onChange-Handler clearen, damit getipptes nicht versehentlich an einem
   *  vorher ausgewaehlten Raum kleben bleibt. */
  onRoomPick?: (roomId: string, addressText: string) => void;
}

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

// Google Maps Script lazy-load — nur beim ersten Tippen, nur wenn Key gesetzt.
let googleScriptPromise: Promise<void> | null = null;
function loadGoogleScript(): Promise<void> {
  if (!GOOGLE_KEY) return Promise.reject(new Error("no-key"));
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("ssr"));
    if ((window as unknown as { google?: { maps?: unknown } }).google?.maps) {
      return resolve();
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&libraries=places&loading=async`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      googleScriptPromise = null;
      reject(new Error("script-load-failed"));
    };
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

type GoogleAutocompletePrediction = {
  place_id: string;
  description: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
};

type GoogleAutocompleteService = {
  getPlacePredictions: (
    request: {
      input: string;
      componentRestrictions?: { country: string | string[] };
      types?: string[];
    },
    callback: (preds: GoogleAutocompletePrediction[] | null, status: string) => void
  ) => void;
};

type GoogleNamespace = {
  maps: {
    places: {
      AutocompleteService: new () => GoogleAutocompleteService;
      AutocompleteSessionToken: new () => unknown;
      PlacesServiceStatus: { OK: string };
      PlacesService: new (el: HTMLDivElement) => {
        getDetails: (
          req: { placeId: string; fields: string[] },
          cb: (
            place: {
              formatted_address?: string;
              address_components?: Array<{
                long_name: string;
                short_name: string;
                types: string[];
              }>;
            } | null,
            status: string
          ) => void
        ) => void;
      };
    };
  };
};

function getGoogle(): GoogleNamespace | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { google?: GoogleNamespace }).google ?? null;
}

function parsePlace(place: {
  formatted_address?: string;
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
}): ParsedAddress {
  const comps = place.address_components ?? [];
  const get = (type: string, useShort = false) => {
    const c = comps.find((c) => c.types.includes(type));
    if (!c) return "";
    return useShort ? c.short_name : c.long_name;
  };
  const route = get("route");
  const number = get("street_number");
  const street = [route, number].filter(Boolean).join(" ");
  return {
    street,
    postcode: get("postal_code"),
    city: get("locality") || get("postal_town") || get("administrative_area_level_2"),
    country: get("country", true),
  };
}

export function AddressAutocomplete({
  value,
  onChange,
  localLocations,
  localRooms,
  placeholder,
  id,
  required,
  onPlace,
  onRoomPick,
}: Props) {
  const [open, setOpen] = useState(false);
  const [googleSuggestions, setGoogleSuggestions] = useState<
    GoogleAutocompletePrediction[]
  >([]);
  const [highlight, setHighlight] = useState(0);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  // Portal mounting flag (avoids SSR mismatch)
  useEffect(() => setMounted(true), []);

  // Recalc dropdown position on open / scroll / resize
  useEffect(() => {
    if (!open) return;
    function update() {
      if (!inputRef.current) return;
      const r = inputRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Google lazily aktivieren beim ersten Fokus
  useEffect(() => {
    if (!GOOGLE_KEY) return;
    loadGoogleScript()
      .then(() => setGoogleEnabled(true))
      .catch(() => setGoogleEnabled(false));
  }, []);

  // Click outside → close (input + portal-rendered dropdown both count as inside)
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      const inWrapper = wrapperRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inWrapper && !inDropdown) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Google query (debounced) — Schweizer Adressen werden anschliessend nach oben sortiert
  useEffect(() => {
    if (!googleEnabled || !value || value.length < 2) {
      setGoogleSuggestions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const g = getGoogle();
      if (!g) return;
      const svc = new g.maps.places.AutocompleteService();
      svc.getPlacePredictions(
        {
          input: value,
          componentRestrictions: { country: ["ch", "de", "fr", "at", "li"] },
        },
        (preds, status) => {
          if (status !== g.maps.places.PlacesServiceStatus.OK || !preds) {
            setGoogleSuggestions([]);
            return;
          }
          // Schweiz zuerst — die anderen Länder behalten ihre interne Reihenfolge
          const isSwiss = (p: GoogleAutocompletePrediction) => {
            const txt = (
              p.description +
              " " +
              (p.structured_formatting?.secondary_text ?? "")
            ).toLowerCase();
            return /\b(schweiz|switzerland)\b/.test(txt);
          };
          const sorted = [...preds].sort((a, b) => {
            const aSw = isSwiss(a);
            const bSw = isSwiss(b);
            if (aSw && !bSw) return -1;
            if (!aSw && bSw) return 1;
            return 0;
          });
          setGoogleSuggestions(sorted.slice(0, 5));
        }
      );
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, googleEnabled]);

  // Wort-Start-Treffer auf den Adress-Feldern eines Eintrags. Gleiche Logik
  // fuer Locations und Raeume — Matching ist datenstrukturell identisch, nur
  // die Quelle (eigene Standorte vs. externe Raeume) ist semantisch anders.
  function placeMatches(loc: LocalLocation, q: string): boolean {
    const lq = q.toLowerCase();
    const fields = [
      loc.name,
      loc.address_street,
      loc.address_city,
      loc.address_zip,
    ].filter(Boolean) as string[];
    for (const f of fields) {
      const lower = f.toLowerCase();
      if (lower.startsWith(lq)) return true;
      const parts = lower.split(/[\s,.\-/]+/);
      if (parts.some((p) => p.startsWith(lq))) return true;
    }
    return false;
  }

  const localMatches = (() => {
    if (!value || value.length < 1) return [];
    return localLocations.filter((l) => placeMatches(l, value)).slice(0, 4);
  })();

  const roomMatches = (() => {
    if (!localRooms || !value || value.length < 1) return [];
    return localRooms.filter((r) => placeMatches(r, value)).slice(0, 4);
  })();

  const suggestions: Suggestion[] = [
    ...localMatches.map((l) => ({
      kind: "location" as const,
      id: l.id,
      label: l.name,
      sub: [l.address_street, l.address_zip, l.address_city]
        .filter(Boolean)
        .join(", "),
      value: [l.name, l.address_street, l.address_zip, l.address_city]
        .filter(Boolean)
        .join(", "),
    })),
    ...roomMatches.map((r) => ({
      kind: "room" as const,
      id: r.id,
      label: r.name,
      sub: [r.address_street, r.address_zip, r.address_city]
        .filter(Boolean)
        .join(", "),
      value: [r.name, r.address_street, r.address_zip, r.address_city]
        .filter(Boolean)
        .join(", "),
    })),
    ...googleSuggestions.map((g) => ({
      kind: "google" as const,
      placeId: g.place_id,
      label: g.structured_formatting?.main_text ?? g.description,
      sub: g.structured_formatting?.secondary_text ?? "",
    })),
  ];

  function pickSuggestion(s: Suggestion) {
    if (s.kind === "location") {
      onChange(s.value);
      setOpen(false);
    } else if (s.kind === "room") {
      onChange(s.value);
      // onRoomPick erst NACH onChange: parent kann in onChange room_id clearen
      // (Defensive Default), und onRoomPick setzt sie dann wieder explizit auf
      // diesen Raum. Reihenfolge stabil dank React-Batching im selben Frame.
      if (onRoomPick) onRoomPick(s.id, s.value);
      setOpen(false);
    } else {
      // Google place → details holen
      const g = getGoogle();
      if (!g) return;
      const placeholderEl = document.createElement("div");
      const svc = new g.maps.places.PlacesService(placeholderEl);
      svc.getDetails(
        {
          placeId: s.placeId,
          fields: ["formatted_address", "address_components"],
        },
        (place, status) => {
          if (status !== g.maps.places.PlacesServiceStatus.OK || !place) return;
          if (onPlace) {
            // Struktur-Modus: NUR die Strasse ins Input — die anderen Felder
            // (PLZ, Ort, Land) bekommt der Caller via onPlace und steckt sie in
            // die jeweils richtigen Form-Felder. Wenn parsed.street leer ist
            // (z.B. der Pick war ein POI ohne Strassenname), wird das Feld leer
            // gesetzt — kein Fallback auf formatted_address, sonst landen PLZ
            // + Ort doppelt im Strasse-Feld.
            const parsed = parsePlace(place);
            onChange(parsed.street);
            onPlace(parsed);
          } else {
            // Legacy-Modus: kompletter Address-String ins Input
            onChange(place.formatted_address ?? s.label);
          }
          setOpen(false);
        }
      );
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pickSuggestion(suggestions[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const dropdown =
    open && suggestions.length > 0 && pos ? (
      <ul
        ref={dropdownRef}
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          width: pos.width,
        }}
        className="z-[100] rounded-xl border bg-popover shadow-lg max-h-72 overflow-y-auto p-1"
      >
        {suggestions.map((s, i) => {
          const key = s.kind === "location" ? `loc-${s.id}`
            : s.kind === "room" ? `room-${s.id}`
            : `g-${s.placeId}`;
          return (
            <li
              key={key}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                pickSuggestion(s);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`flex items-start gap-2.5 px-2.5 py-1.5 text-sm cursor-pointer rounded-lg transition-colors ${
                i === highlight
                  ? "bg-foreground/[0.08]"
                  : "hover:bg-foreground/[0.05] dark:hover:bg-foreground/[0.12]"
              }`}
            >
              {s.kind === "location" ? (
                <Building2 className="h-4 w-4 text-foreground mt-0.5 shrink-0" />
              ) : s.kind === "room" ? (
                <DoorOpen className="h-4 w-4 text-foreground mt-0.5 shrink-0" />
              ) : (
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.label}</div>
                {s.sub && (
                  <div className="truncate text-xs text-muted-foreground">
                    {s.sub}
                  </div>
                )}
              </div>
              {s.kind === "location" && (
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 shrink-0">
                  Standort
                </span>
              )}
              {s.kind === "room" && (
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 shrink-0">
                  Raum
                </span>
              )}
            </li>
          );
        })}
      </ul>
    ) : null;

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        aria-required={required}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => value && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="flex h-9 w-full rounded-xl border bg-background px-3 py-1 text-sm transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-ring hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {mounted && dropdown && createPortal(dropdown, document.body)}
      {!GOOGLE_KEY && value.length >= 2 && (
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          Adressvorschläge nur aus eigenen Locations — Google Maps API Key in
          .env.local fehlt.
        </p>
      )}
    </div>
  );
}
