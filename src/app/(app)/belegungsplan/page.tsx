"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";

type Location = {
  id: string;
  name: string;
  address_city: string | null;
  capacity: number | null;
};

type Booking = {
  id: string;
  source: "job" | "rental_request";
  location_id: string;
  title: string;
  start: Date;
  end: Date;
  status: string;
  customer_name: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isWeekend(d: Date) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function isToday(d: Date) {
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

export default function BelegungsplanPage() {
  const supabase = createClient();
  const [locations, setLocations] = useState<Location[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState(30);
  const [anchorDate, setAnchorDate] = useState<Date>(() => startOfDay(new Date()));
  const [selectedCell, setSelectedCell] = useState<{
    location: Location;
    day: Date;
    bookings: Booking[];
  } | null>(null);

  useEffect(() => {
    load();
  }, [anchorDate, windowDays]);

  async function load() {
    setLoading(true);
    const start = anchorDate;
    const end = new Date(anchorDate.getTime() + windowDays * DAY_MS);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const [locRes, jobsRes] = await Promise.all([
      supabase
        .from("locations")
        .select("id, name, address_city, capacity")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("jobs")
        .select(
          "id, title, status, start_date, end_date, location_id, customer:customers(name)"
        )
        .neq("is_deleted", true)
        .not("location_id", "is", null)
        .or(`start_date.gte.${startIso},end_date.gte.${startIso}`)
        .lt("start_date", endIso),
    ]);

    setLocations((locRes.data as Location[]) ?? []);

    const all: Booking[] = [];
    for (const j of jobsRes.data ?? []) {
      if (!j.start_date || !j.location_id) continue;
      if (j.status === "storniert") continue;
      const cust = Array.isArray(j.customer) ? j.customer[0] : j.customer;
      // Anfragen werden auch als jobs gespeichert (status='anfrage'). Source unterscheidet,
      // damit die UI Anfrage- vs Auftrags-Kacheln optisch trennen kann.
      const isAnfrage = j.status === "anfrage";
      all.push({
        id: j.id,
        source: isAnfrage ? "rental_request" : "job",
        location_id: j.location_id,
        title: isAnfrage ? "Mietanfrage" : j.title,
        start: startOfDay(new Date(j.start_date)),
        end: startOfDay(new Date(j.end_date ?? j.start_date)),
        status: j.status,
        customer_name: (cust as { name?: string } | null)?.name ?? null,
      });
    }
    setBookings(all);
    setLoading(false);
  }

  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < windowDays; i++) {
      arr.push(new Date(anchorDate.getTime() + i * DAY_MS));
    }
    return arr;
  }, [anchorDate, windowDays]);

  function cellBookings(locationId: string, day: Date): Booking[] {
    return bookings.filter(
      (b) =>
        b.location_id === locationId &&
        day >= b.start &&
        day <= b.end
    );
  }

  function cellState(b: Booking[]): {
    color: string;
    label: string;
  } {
    if (b.length === 0) return { color: "", label: "frei" };
    const hasConfirmed = b.some(
      (x) =>
        x.source === "job" ||
        x.status === "bestaetigt" ||
        x.status === "konditionen_bestaetigt"
    );
    const hasPending = b.some(
      (x) => x.source === "rental_request" && !hasConfirmed
    );
    if (hasConfirmed && hasPending) {
      return {
        color: "bg-red-500/70 [background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.25)_3px,rgba(255,255,255,0.25)_6px)]",
        label: "Konflikt",
      };
    }
    if (hasConfirmed) return { color: "bg-red-500/80", label: "gebucht" };
    return { color: "bg-amber-400/70", label: "angefragt" };
  }

  function shift(deltaDays: number) {
    setAnchorDate((d) => startOfDay(new Date(d.getTime() + deltaDays * DAY_MS)));
  }

  function jumpToToday() {
    setAnchorDate(startOfDay(new Date()));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Belegungsplan
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verfügbarkeit aller Standorte auf einen Blick.
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => shift(-windowDays)}
            className="p-2 rounded-lg hover:bg-muted transition"
            aria-label="Zurück"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={jumpToToday}
            className="px-3 py-1.5 rounded-lg border hover:bg-muted text-xs font-medium transition"
          >
            Heute
          </button>
          <button
            onClick={() => shift(windowDays)}
            className="p-2 rounded-lg hover:bg-muted transition"
            aria-label="Vor"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <span className="mx-2 h-5 w-px bg-border" />

          <div className="flex rounded-lg border overflow-hidden">
            {[14, 30, 60].map((n) => (
              <button
                key={n}
                onClick={() => setWindowDays(n)}
                className={`px-3 py-1.5 text-xs font-medium transition ${
                  windowDays === n
                    ? "bg-foreground text-background"
                    : "hover:bg-muted"
                }`}
              >
                {n} Tage
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border bg-background" /> frei
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-amber-400/70" /> Mietanfrage offen
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-red-500/80" /> bestätigt / gebucht
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-red-500/70 [background-image:repeating-linear-gradient(45deg,transparent,transparent_2px,rgba(255,255,255,0.4)_2px,rgba(255,255,255,0.4)_4px)]" />{" "}
          Konflikt
        </span>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Lädt…
            </div>
          ) : locations.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Keine Standorte vorhanden.{" "}
              <Link href="/standorte" className="underline">
                Standort anlegen
              </Link>
            </div>
          ) : (
            <table className="text-xs border-separate border-spacing-0 w-full">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-card text-left font-medium text-muted-foreground px-3 py-2 border-b border-r min-w-[180px]">
                    Standort
                  </th>
                  {days.map((d, i) => {
                    const isFirstOfMonth = d.getDate() === 1 || i === 0;
                    return (
                      <th
                        key={i}
                        className={`text-center font-normal px-0 py-1 border-b min-w-[28px] ${
                          isWeekend(d) ? "bg-muted/30" : ""
                        } ${isToday(d) ? "bg-primary/10" : ""}`}
                      >
                        {isFirstOfMonth && (
                          <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                            {d.toLocaleDateString("de-CH", { month: "short" })}
                          </div>
                        )}
                        <div
                          className={`text-[10px] ${
                            isToday(d) ? "font-bold text-primary" : ""
                          }`}
                        >
                          {d.getDate()}
                        </div>
                        <div className="text-[9px] text-muted-foreground/60">
                          {["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][d.getDay()]}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {locations.map((loc) => (
                  <tr key={loc.id}>
                    <th className="sticky left-0 z-10 bg-card text-left font-medium px-3 py-2 border-b border-r">
                      <div className="truncate">{loc.name}</div>
                      {(loc.address_city || loc.capacity) && (
                        <div className="text-[10px] font-normal text-muted-foreground truncate">
                          {[loc.address_city, loc.capacity ? `${loc.capacity} Pers.` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                    </th>
                    {days.map((d, di) => {
                      const cb = cellBookings(loc.id, d);
                      const state = cellState(cb);
                      const titleText =
                        cb.length === 0
                          ? `${d.toLocaleDateString("de-CH")} — frei`
                          : `${d.toLocaleDateString("de-CH")} — ${cb
                              .map((x) => x.customer_name || x.title)
                              .join(", ")}`;
                      return (
                        <td
                          key={di}
                          className={`border-b p-0 h-9 cursor-pointer hover:ring-2 hover:ring-foreground/30 hover:ring-inset relative ${
                            isWeekend(d) ? "bg-muted/30" : ""
                          } ${isToday(d) ? "ring-1 ring-primary/30 ring-inset" : ""}`}
                          title={titleText}
                          onClick={() =>
                            cb.length > 0 &&
                            setSelectedCell({
                              location: loc,
                              day: d,
                              bookings: cb,
                            })
                          }
                        >
                          <div
                            className={`absolute inset-0.5 rounded ${state.color}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selectedCell} onOpenChange={(o) => !o && setSelectedCell(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {selectedCell?.location.name}
              <span className="block text-sm font-normal text-muted-foreground mt-0.5">
                {selectedCell?.day.toLocaleDateString("de-CH", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6 space-y-3">
            {selectedCell?.bookings.map((b) => (
              <Link
                key={`${b.source}-${b.id}`}
                href={
                  b.source === "job" ? `/auftraege/${b.id}` : `/anfragen/${b.id}`
                }
                onClick={() => setSelectedCell(null)}
                className="block rounded-lg border p-3 hover:bg-muted/40 transition"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      b.source === "job" ? "bg-red-500" : "bg-amber-400"
                    }`}
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {b.source === "job" ? "Bestätigt" : "Mietanfrage"}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {b.status}
                  </span>
                </div>
                <p className="text-sm font-medium">{b.title}</p>
                {b.customer_name && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {b.customer_name}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {b.start.toLocaleDateString("de-CH", { day: "numeric", month: "short" })}
                  {b.end.getTime() !== b.start.getTime() &&
                    ` – ${b.end.toLocaleDateString("de-CH", { day: "numeric", month: "short" })}`}
                </p>
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
