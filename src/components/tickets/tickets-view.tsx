"use client";

/**
 * Tickets-Listenseite.
 *
 * Vier Typen (it, beleg, stempel_aenderung, material), drei Status
 * (offen, erledigt, abgelehnt). RLS sortiert: Mitarbeiter sehen ihre
 * eigenen + die ihnen zugewiesenen, Admins sehen alles.
 *
 * Neu (audit-umsetzung Track B): Scope-Segment ganz oben (Meine offenen |
 * An mich zur Genehmigung [wenn tickets:manage] | Alle [wenn tickets:manage]),
 * Preset-Chips fuer Typ, Status-Dropdown als sekundaerer Filter, und fuer
 * Stempel-Tickets eine inline "Vorher -> Nachher"-Anzeige, damit der Approver
 * ohne Detail-Klick sieht was geaendert werden soll.
 *
 * Filter-State ist reload-safe: Scope-Segment lebt in ?tab=... (URL, teilbar),
 * die restlichen Filter (Typ/Status/Suche/Archiv) in localStorage.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usePermissions } from "@/lib/use-permissions";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/searchable-select";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";
import {
  Plus, Search, Ticket as TicketIcon, Wrench, Receipt, Clock, Package,
  Inbox, Users, ListChecks,
} from "lucide-react";
import type {
  TicketWithRelations, TicketType, TicketStatus,
} from "@/types";

type FilterStatus = "alle" | TicketStatus;
type FilterType = "alle" | TicketType;
type Scope = "meine-offenen" | "zur-genehmigung" | "alle";

// Tickets gelten als 'archiviert' wenn sie erledigt/abgelehnt sind UND
// das vor mehr als 14 Tagen passiert ist. Nur dann werden sie aus der
// aktiven Liste ausgeblendet.
const ARCHIVE_AFTER_DAYS = 14;

// Cursor-Pagination — 100 Rows pro Page, "Mehr laden"-Button am Ende.
// Bei 100 Mitarbeitern × ~5 Tickets/Monat ueberschreitet die Liste die
// 500-Bound aus Phase D nach knapp einem Jahr — hier dann sauber paginiert.
const PAGE_SIZE = 100;

// LocalStorage-Keys — projekt-eindeutig, siehe FSM-Regel §10.
const LS = {
  type: "tickets-type",
  status: "tickets-status",
  archive: "tickets-archive",
  searchTitle: "tickets-search-title",
  searchNumber: "tickets-search-number",
} as const;

const TYPE_META: Record<TicketType, { label: string; short: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  it:               { label: "IT-Problem",       short: "IT",       icon: Wrench,  color: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/15" },
  beleg:            { label: "Beleg",             short: "Beleg",    icon: Receipt, color: "text-amber-600  dark:text-amber-400  bg-amber-50  dark:bg-amber-500/15"  },
  stempel_aenderung:{ label: "Stempel-Änderung", short: "Stempel",  icon: Clock,   color: "text-green-600  dark:text-green-400  bg-green-50  dark:bg-green-500/15"  },
  material:         { label: "Material",         short: "Material", icon: Package, color: "text-red-600    dark:text-red-400    bg-red-50    dark:bg-red-500/15"    },
};

const STATUS_META: Record<TicketStatus, { label: string; classes: string }> = {
  offen:     { label: "Offen",     classes: "bg-blue-100  text-blue-700  dark:bg-blue-500/20  dark:text-blue-300"  },
  erledigt:  { label: "Erledigt",  classes: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300" },
  abgelehnt: { label: "Abgelehnt", classes: "bg-red-100   text-red-700   dark:bg-red-500/20   dark:text-red-300"   },
};

// Type-Chips fuer den Preset-Filter unter den Tabs. Reihenfolge = die
// haeufigsten zuerst. Belege wandern nicht in diese Liste, weil sie via
// .neq("type","beleg") aus der Tickets-Query ausgeschlossen sind (leben
// jetzt auf /abrechnung).
const TYPE_CHIPS: { id: FilterType; label: string; icon?: React.ComponentType<{ className?: string }> }[] = [
  { id: "alle",              label: "Alle Typen" },
  { id: "stempel_aenderung", label: "Stempel",  icon: Clock },
  { id: "material",          label: "Material", icon: Package },
  { id: "it",                label: "IT",       icon: Wrench },
];

function readLS(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Private-Mode oder Storage voll — kein Halt fuer die UI. */
  }
}

// Formatiert Datum kompakt (dd.MM.yy) — timeZone Europe/Zurich zwingend
// (siehe CLAUDE.md §4: keine Datumsanzeige ohne timeZone).
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit", month: "2-digit", year: "2-digit",
  });
}

// Formatiert nur die Uhrzeit fuer die Vorher-/Nachher-Zeile (HH:mm).
function formatTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("de-CH", {
    timeZone: "Europe/Zurich",
    hour: "2-digit", minute: "2-digit",
  });
}

// Formatiert nur den Tag als dd.MM. — wird in der Stempel-Zeile
// zusaetzlich zur Uhrzeit ausgewiesen, damit der Approver weiss um
// welchen Tag es geht (Ticket kann auch verspaetet eingereicht sein).
function formatDayShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("de-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit", month: "2-digit",
  });
}

// Payload-Shape der Stempel-Tickets — wird strikt so gelesen wie ihn
// new-ticket-modal.tsx schreibt (siehe TicketDataStempelAenderung).
type StempelData = {
  time_entry_id?: string;
  neu_start?: string;
  neu_end?: string;
  job_id?: string;
  beschreibung?: string;
  grund?: string;
};

/**
 * Wiederverwendbare Tickets-View — 1:1 der frueheren Page-Content,
 * extrahiert damit /hr sie als Tab einbetten kann. Die duenne Page unter
 * (app)/tickets/page.tsx haelt Deep-Links am Leben.
 */
export function TicketsView() {
  const supabase = createClient();
  const searchParams = useSearchParams();

  const { can, ready } = usePermissions();
  const canManage = can("tickets:manage");

  const [tickets, setTickets] = useState<TicketWithRelations[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  // Filter — Werte aus localStorage lazy laden (SSR-Guard drin), damit
  // Reload den vorherigen Stand wiederherstellt (FSM-Regel §10).
  const [searchNumber, setSearchNumber] = useState<string>(() => readLS(LS.searchNumber, ""));
  const [searchTitle, setSearchTitle] = useState<string>(() => readLS(LS.searchTitle, ""));
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(
    () => (readLS(LS.status, "offen") as FilterStatus) || "offen",
  );
  const [filterType, setFilterType] = useState<FilterType>(
    () => (readLS(LS.type, "alle") as FilterType) || "alle",
  );
  const [showArchive, setShowArchive] = useState<boolean>(
    () => readLS(LS.archive, "false") === "true",
  );

  // Scope-Segment lebt in ?tab=... (URL-persist + teilbar).
  //
  // Wir vermeiden bewusst setState-in-Effect (react-hooks/set-state-in-effect):
  //   - Initialer Scope: lazy aus URL, Fallback "meine-offenen"
  //   - Manager-Default "zur-genehmigung": in effectiveScope hergeleitet,
  //     solange der User noch nichts explizit geklickt hat
  //   - Nicht-Manager: in effectiveScope auf "meine-offenen" gezwungen
  //   - Back/Forward: popstate-Subscription (external-system-Update, erlaubt)
  const urlScopeInitial = searchParams.get("tab");
  const hadInitialUrlScope =
    urlScopeInitial === "meine-offenen" ||
    urlScopeInitial === "zur-genehmigung" ||
    urlScopeInitial === "alle";
  const [scope, setScope] = useState<Scope>(() => {
    if (hadInitialUrlScope) return urlScopeInitial as Scope;
    return "meine-offenen";
  });
  // Ob der User seit dem Mount explizit einen Scope gewaehlt hat — wenn
  // ja, gewinnt seine Wahl gegenueber dem Manager-Default. State (nicht
  // Ref) damit re-renders getriggert werden.
  const [userChose, setUserChose] = useState(false);

  // Back/Forward-Sync: browser-Navigation aendert die URL — Scope hinterher
  // ziehen. Rechte-Enforcement passiert weiter unten in effectiveScope.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      const p = new URLSearchParams(window.location.search).get("tab");
      if (p === "meine-offenen" || p === "zur-genehmigung" || p === "alle") {
        setScope(p);
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  function selectScope(next: Scope) {
    setUserChose(true);
    setScope(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState({}, "", url.toString());
    }
  }

  // Filter-Persistenz in localStorage.
  useEffect(() => { writeLS(LS.searchNumber, searchNumber); }, [searchNumber]);
  useEffect(() => { writeLS(LS.searchTitle, searchTitle); }, [searchTitle]);
  useEffect(() => { writeLS(LS.status, filterStatus); }, [filterStatus]);
  useEffect(() => { writeLS(LS.type, filterType); }, [filterType]);
  useEffect(() => { writeLS(LS.archive, showArchive ? "true" : "false"); }, [showArchive]);

  // Eigene User-ID laden — wird fuer Scope-Filter "meine-offenen" und
  // "zur-genehmigung" gebraucht.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);
    })();
  }, [supabase]);

  // Effektiver Scope — kombiniert aus:
  //   1. Rechte-Enforcement: Nicht-Manager sehen nur "meine-offenen"
  //   2. Manager-Default: kein tab= in URL + User hat noch nichts geklickt
  //      → "zur-genehmigung" (bessere Landingpage fuer Approver)
  //   3. Sonst: die aktuelle Scope-Wahl
  // Muss VOR buildQuery deklariert sein, weil dieser den Wert in seinen
  // Dependencies fuehrt.
  const effectiveScope: Scope = (() => {
    if (!ready) return scope; // Rechte noch nicht bekannt — sanft
    if (!canManage) return "meine-offenen";
    if (!userChose && !hadInitialUrlScope) return "zur-genehmigung";
    return scope;
  })();

  // Query-Builder — beide Loader-Pfade (initial + load-more) bauen die
  // gleiche Query mit unterschiedlichem Cursor.
  const buildQuery = useCallback((cursor: { ts: string; id: string } | null) => {
    let q = supabase
      .from("tickets")
      .select(`
        *,
        creator:profiles!created_by(full_name),
        assignee:profiles!assigned_to(full_name),
        resolver:profiles!resolved_by(full_name),
        attachments:ticket_attachments(id, filename, storage_path, mime_type)
      `)
      // Belege leben jetzt auf /abrechnung — aus der Tickets-Liste raus,
      // damit IT/Material/Stempel-Tickets nicht mit Buchhaltungs-Krempel
      // gemischt sind.
      .neq("type", "beleg")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (cursor !== null) {
      q = q.or(`created_at.lt.${cursor.ts},and(created_at.eq.${cursor.ts},id.lt.${cursor.id})`);
    }

    // Im Archiv-Modus den Status-Filter ignorieren — archivierte Tickets sind
    // per Definition NICHT "offen" (nur erledigt/abgelehnt nach 14 Tagen).
    if (!showArchive && filterStatus !== "alle") q = q.eq("status", filterStatus);
    if (filterType !== "alle") q = q.eq("type", filterType);

    // Scope-Filter — server-seitig gefiltert (§4: Datenoperationen aus der DB).
    if (currentUserId) {
      if (effectiveScope === "meine-offenen") {
        q = q.eq("created_by", currentUserId);
        // Bei "meine offenen" zaehlt der Name — nur offene Tickets, egal
        // was der Status-Dropdown sagt (implizite Semantik des Tabs).
        if (!showArchive) q = q.eq("status", "offen");
      } else if (effectiveScope === "zur-genehmigung") {
        // Nur wenn Manager: Tickets die MIR zur Genehmigung zugewiesen
        // sind (assigned_to = ich) und noch offen.
        q = q.eq("assigned_to", currentUserId);
        if (!showArchive) q = q.eq("status", "offen");
      }
      // effectiveScope === "alle" → kein zusaetzlicher Filter (Manager
      // sehen via RLS eh alles; Nicht-Manager kommen nie hierher).
    }

    // Archive vs Active per Server-Side-Filter — vorher wurden ALLE Rows
    // geladen und client-seitig gefiltert.
    const archiveCutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
    if (showArchive) {
      q = q.in("status", ["erledigt", "abgelehnt"]).lt("resolved_at", archiveCutoff);
    } else {
      q = q.or(`resolved_at.is.null,resolved_at.gte.${archiveCutoff}`);
    }

    const numQ = searchNumber.trim();
    if (numQ) {
      const n = parseInt(numQ, 10);
      // int4-Falle (siehe CLAUDE.md §15): sehr grosse Zahlen sprengen int
      // → PostgREST-Query kippt still. Vorher gaten.
      if (Number.isFinite(n) && n <= 2147483647) q = q.eq("ticket_number", n);
    }
    const titleQ = searchTitle.trim();
    if (titleQ) {
      const escaped = titleQ.replace(/[\\"]/g, "\\$&");
      const like = `"%${escaped}%"`;
      q = q.or(`title.ilike.${like},description.ilike.${like}`);
    }
    return q;
  }, [supabase, filterStatus, filterType, effectiveScope, currentUserId, showArchive, searchNumber, searchTitle]);

  // ------------------------------------------------------------------
  // Vorher-Werte fuer Stempel-Korrekturen — batched laden.
  //
  // Fuer Stempel-Tickets im Modus "Korrektur" (time_entry_id gesetzt) wollen
  // wir in der Liste "08:15 -> 08:00" zeigen. Der Vorher-Wert liegt auf
  // time_entries.start_time/end_time — mit einer .in()-Query (statt N+1)
  // fuer die aktuell sichtbaren Ticket-Rows batch-geladen.
  // ------------------------------------------------------------------
  const [entryBefore, setEntryBefore] = useState<Record<string, { start_time: string | null; end_time: string | null }>>({});
  const loadedEntryIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const needed: string[] = [];
    for (const t of tickets) {
      if (t.type !== "stempel_aenderung") continue;
      const d = (t.data ?? {}) as StempelData;
      if (!d.time_entry_id) continue;
      if (loadedEntryIdsRef.current.has(d.time_entry_id)) continue;
      needed.push(d.time_entry_id);
    }
    if (needed.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("time_entries")
        .select("id, start_time, end_time")
        .in("id", needed);
      if (cancelled) return;
      const additions: Record<string, { start_time: string | null; end_time: string | null }> = {};
      for (const row of (data ?? []) as { id: string; start_time: string | null; end_time: string | null }[]) {
        additions[row.id] = { start_time: row.start_time, end_time: row.end_time };
        loadedEntryIdsRef.current.add(row.id);
      }
      // IDs die nix zurueckgegeben haben trotzdem markieren, sonst
      // wiederholt der Effekt die Query bei jedem Render.
      for (const id of needed) loadedEntryIdsRef.current.add(id);
      setEntryBefore((prev) => ({ ...prev, ...additions }));
    })();
    return () => { cancelled = true; };
  }, [tickets, supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await buildQuery(null);
    const rows = (data as unknown as TicketWithRelations[]) ?? [];
    setHasMore(rows.length > PAGE_SIZE);
    setTickets(rows.slice(0, PAGE_SIZE));
    setLoading(false);
  }, [buildQuery]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || tickets.length === 0) return;
    setLoadingMore(true);
    const last = tickets[tickets.length - 1];
    const { data } = await buildQuery({ ts: last.created_at, id: last.id });
    const rows = (data as unknown as TicketWithRelations[]) ?? [];
    setHasMore(rows.length > PAGE_SIZE);
    setTickets((prev) => [...prev, ...rows.slice(0, PAGE_SIZE)]);
    setLoadingMore(false);
  }, [buildQuery, loadingMore, hasMore, tickets]);

  useEffect(() => {
    // Kurzes Debounce fuer die Sucheingabe — Tastenschlaege loesen sonst
    // eine Query pro Zeichen aus.
    const t = setTimeout(() => { load(); }, 200);
    return () => clearTimeout(t);
  }, [load]);

  // Nav-Tabs fuer den Scope. Nicht-Manager sehen nur "Meine offenen".
  const scopeTabs = useMemo(() => {
    const tabs: { key: Scope; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
      { key: "meine-offenen", label: "Meine offenen", icon: Inbox },
    ];
    if (canManage) {
      tabs.push({ key: "zur-genehmigung", label: "An mich zur Genehmigung", icon: ListChecks });
      tabs.push({ key: "alle", label: "Alle", icon: Users });
    }
    return tabs;
  }, [canManage]);


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 min-h-9">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tickets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            IT-Probleme · Stempel-Änderungen · Material-Anfragen
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowArchive((v) => !v)}
            className={showArchive ? "kasten-active" : "kasten-toggle-off"}
          >
            Archiv
          </button>
          {can("tickets:create") && (
            <button type="button" onClick={() => setShowNew(true)} className="kasten kasten-red">
              <Plus className="h-3.5 w-3.5" />Neues Ticket
            </button>
          )}
        </div>
      </div>

      {/* Scope-Segment (Underline-Tabs à la Einstellungen — kanonisches
          EVENTLINE-Muster). Bei nur einem Tab (Nicht-Manager) blenden wir
          die Nav ganz aus, weil sonst eine leere Zeile stehen wuerde. */}
      {scopeTabs.length > 1 && (
        <nav className="border-b flex gap-1 flex-wrap">
          {scopeTabs.map((t) => {
            const Icon = t.icon;
            const active = effectiveScope === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => selectScope(t.key)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 -mb-px text-sm font-medium border-b-2 transition-colors",
                  active
                    ? "border-red-500 text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-foreground/20",
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      )}

      {/* Type-Chips als Preset-Filter (kasten-Toggle-Muster, in einer Reihe).
          Ersetzt den frueheren Typ-Dropdown — Status bleibt sekundaerer
          Filter rechts. */}
      <div className="flex items-center gap-2 flex-wrap">
        {TYPE_CHIPS.map((c) => {
          const active = filterType === c.id;
          const Icon = c.icon;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilterType(c.id)}
              className={active ? "kasten-active" : "kasten-toggle-off"}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Sekundaere Filter-Bar: Suche + Status. */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Suche Nummer */}
        <div className="relative w-full sm:w-44">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono text-muted-foreground/60 pointer-events-none">
            T-
          </span>
          <Input
            placeholder="0000"
            value={searchNumber}
            onChange={(e) => setSearchNumber(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            pattern="[0-9]*"
            className="pl-[2.4rem] h-9 font-mono bg-card"
            aria-label="Ticket-Nummer"
          />
        </div>
        {/* Suche Titel */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Titel oder Beschreibung…"
            value={searchTitle}
            onChange={(e) => setSearchTitle(e.target.value)}
            className="pl-9 h-9 bg-card"
            aria-label="Titel"
          />
        </div>
        {/* Status als sekundaerer Filter. In "Meine offenen" und
            "Zur Genehmigung" ist Status implizit "offen" (siehe buildQuery);
            wir blenden den Dropdown dort aus, damit er nicht irrefuehrt. */}
        {(effectiveScope === "alle" || showArchive) && (
          <div className="w-full sm:w-44">
            <SearchableSelect
              value={filterStatus}
              onChange={(v) => setFilterStatus(v as FilterStatus)}
              items={[
                { id: "offen", label: "Offen" },
                { id: "erledigt", label: "Erledigt" },
                { id: "abgelehnt", label: "Abgelehnt" },
                { id: "alle", label: "Alle Status" },
              ]}
              searchable={false}
              clearable={false}
              active={filterStatus !== "offen"}
            />
          </div>
        )}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Card key={i} className="animate-pulse bg-card"><CardContent className="p-4 h-20" /></Card>)}</div>
      ) : tickets.length === 0 ? (
        <Card className="bg-card border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <TicketIcon className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg">
              {effectiveScope === "zur-genehmigung"
                ? "Nichts zu genehmigen"
                : effectiveScope === "meine-offenen"
                  ? "Keine offenen Tickets"
                  : "Keine Tickets"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {effectiveScope === "zur-genehmigung"
                ? "Aktuell warten keine Tickets auf deine Freigabe."
                : searchNumber || searchTitle || filterType !== "alle" || showArchive
                  ? "Mit den aktuellen Filtern wurde nichts gefunden."
                  : "Erstelle dein erstes Ticket über den Knopf oben."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => {
            const typeMeta = TYPE_META[t.type];
            const Icon = typeMeta.icon;
            // Vorher/Nachher-Zeile fuer Stempel-Tickets vorbereiten.
            let stempelDiff: React.ReactNode = null;
            if (t.type === "stempel_aenderung") {
              const d = (t.data ?? {}) as StempelData;
              const newStart = formatTime(d.neu_start);
              const newEnd = formatTime(d.neu_end);
              const day = formatDayShort(d.neu_start);
              if (d.time_entry_id) {
                // Modus Korrektur — Vorher-Werte aus geladenem time_entry.
                const before = entryBefore[d.time_entry_id];
                const oldStart = before ? formatTime(before.start_time) : null;
                const oldEnd = before ? formatTime(before.end_time) : null;
                // Nur die Werte zeigen die sich unterscheiden — wenn nur der
                // Start korrigiert wird ist die End-Zeile unnoetig laut.
                const startChanged = oldStart && newStart && oldStart !== newStart;
                const endChanged = oldEnd && newEnd && oldEnd !== newEnd;
                stempelDiff = (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground/80 whitespace-nowrap">
                    {day && <span className="text-muted-foreground">{day}</span>}
                    {startChanged || (!oldStart && newStart) ? (
                      <span className="font-mono">
                        {oldStart ? <span className="text-muted-foreground line-through decoration-red-400/70">{oldStart}</span> : null}
                        {oldStart ? <span className="mx-1 text-muted-foreground">→</span> : null}
                        <span className="text-foreground">{newStart}</span>
                      </span>
                    ) : (
                      oldStart && <span className="font-mono text-muted-foreground">{oldStart}</span>
                    )}
                    {(oldEnd || newEnd) && <span className="text-muted-foreground">·</span>}
                    {endChanged || (!oldEnd && newEnd) ? (
                      <span className="font-mono">
                        {oldEnd ? <span className="text-muted-foreground line-through decoration-red-400/70">{oldEnd}</span> : null}
                        {oldEnd ? <span className="mx-1 text-muted-foreground">→</span> : null}
                        <span className="text-foreground">{newEnd}</span>
                      </span>
                    ) : (
                      oldEnd && <span className="font-mono text-muted-foreground">{oldEnd}</span>
                    )}
                  </span>
                );
              } else if (newStart || newEnd) {
                // Modus Vergessen — kein Vorher, nur die neuen Werte.
                stempelDiff = (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground/80 whitespace-nowrap">
                    {day && <span className="text-muted-foreground">{day}</span>}
                    <span className="font-mono">{newStart ?? "—"}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-mono">{newEnd ?? "—"}</span>
                    <span className="text-muted-foreground">(neu)</span>
                  </span>
                );
              }
            }
            return (
              <Link key={t.id} href={`/tickets/${t.id}`} className="block">
                <Card className="card-hover bg-card">
                  <CardContent className="px-4 py-1.5 flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${typeMeta.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[11px] font-semibold text-muted-foreground shrink-0">T-{t.ticket_number}</span>
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0 text-[10px] font-medium rounded-full shrink-0 ${typeMeta.color}`}
                          title={typeMeta.label}
                        >
                          {typeMeta.short}
                        </span>
                        <span className="font-medium text-sm truncate">{t.title}</span>
                        <span className={`inline-flex items-center px-1.5 py-0 text-[10px] font-medium rounded-full shrink-0 ${STATUS_META[t.status].classes}`}>
                          {STATUS_META[t.status].label}
                        </span>
                        {t.priority === "dringend" && (
                          <span className="inline-flex items-center px-1.5 py-0 text-[10px] font-semibold rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 shrink-0">
                            Dringend
                          </span>
                        )}
                        {t.filed_at && (
                          <span
                            className="inline-flex items-center px-1.5 py-0 text-[10px] font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 shrink-0"
                            data-tooltip={t.filed_reference ?? "Abgelegt"}
                          >
                            Abgelegt
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                        <span>{t.creator?.full_name ?? "—"}</span>
                        <span>·</span>
                        <span>{formatDate(t.created_at)}</span>
                        {stempelDiff && (
                          <>
                            <span>·</span>
                            {stempelDiff}
                          </>
                        )}
                        {t.attachments.length > 0 && (
                          <>
                            <span>·</span>
                            <span>{t.attachments.length} Anhang{t.attachments.length === 1 ? "" : "e"}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
          {hasMore && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="kasten kasten-muted"
              >
                {loadingMore ? "Lade…" : "Mehr laden"}
              </button>
            </div>
          )}
        </div>
      )}

      <NewTicketModal open={showNew} onClose={() => setShowNew(false)} onCreated={load} />
    </div>
  );
}
