"use client";

/**
 * Kunden-Liste — kompakte Tabellen-Ansicht, skaliert auf 1000+ Eintraege.
 *
 * - Server-seitige Suche + Type-Filter (ilike auf name+email, Debounce 250ms)
 * - Cursor-Pagination "Mehr laden" (composite cursor name+id, 50 pro Seite)
 * - Counts kommen aus separater Count-Query — nicht aus dem geladenen State
 * - Bexio-Kundennummer (`bexio_nr`) prominent links — synchron zu Bexio sichtbar.
 *   "—" wenn noch nicht in Bexio synchronisiert.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { CUSTOMER_TYPES } from "@/lib/constants";
import type { Customer, CustomerType } from "@/types";
import Link from "next/link";
import {
  Plus, Search, Building2, User, Globe, Users, Trash2, X, ChevronDown, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";

const DELETE_CODE = "5225";
const PAGE_SIZE = 50;

const TYPE_ICONS: Record<CustomerType, typeof Building2> = {
  company: Building2,
  individual: User,
  organization: Globe,
};

export default function KundenPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<CustomerType | "all">("all");
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleteCode, setDeleteCode] = useState("");
  // Banner-Status: wieviele Kunden haben bexio_contact_id aber noch keine
  // bexio_nr? Wird beim Mount geprueft und nach erfolgreichem Sync aktualisiert.
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const supabase = createClient();

  // Debounce-Ref damit Tippen nicht jeden Tastenanschlag eine Query feuert.
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Race-Guard: alte Antwort, die nach neuerer Query zurueckkommt, ignorieren.
  const queryIdRef = useRef(0);

  // Eine Query baut sich aus aktuellem Filter+Suche zusammen — server-seitig,
  // damit Suche/Filter ueber den vollen Datenbestand laufen, nicht nur ueber
  // den geladenen Chunk. Skaliert auch bei tausenden Kunden sauber.
  // Composite Cursor (name, id): bei doppelten Namen wuerde reines name>cursor
  // einen Eintrag ueberspringen — daher Tie-Break ueber id.
  const buildQuery = useCallback((cursor: { name: string; id: string } | null) => {
    let q = supabase
      .from("customers")
      .select("*", { count: "exact" })
      .eq("is_active", true);
    if (filterType !== "all") q = q.eq("type", filterType);
    const term = search.trim();
    if (term.length > 0) {
      const like = `%${term}%`;
      // Suche in Name, Email UND Bexio-Nr — Mitarbeiter koennen direkt nach
      // der Kundennummer aus einer Rechnung suchen.
      q = q.or(`name.ilike.${like},email.ilike.${like},bexio_nr.ilike.${like}`);
    }
    if (cursor !== null) {
      q = q.or(`and(name.eq.${cursor.name},id.gt.${cursor.id}),name.gt.${cursor.name}`);
    }
    return q.order("name", { ascending: true }).order("id", { ascending: true }).limit(PAGE_SIZE + 1);
  }, [supabase, filterType, search]);

  const loadCustomers = useCallback(async () => {
    const myId = ++queryIdRef.current;
    setLoading(true);
    const { data, count } = await buildQuery(null);
    if (myId !== queryIdRef.current) return;
    if (data) {
      const rows = data as Customer[];
      setHasMore(rows.length > PAGE_SIZE);
      setCustomers(rows.slice(0, PAGE_SIZE));
    }
    if (typeof count === "number") setTotalCount(count);
    setLoading(false);
  }, [buildQuery]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      loadCustomers();
    }, 250);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [loadCustomers]);

  // Unsynced-Count: Kunden die mit Bexio verknuepft sind aber noch keine
  // Kundennummer haben. Server-seitig gezaehlt, weil das Banner unabhaengig
  // vom geladenen Page-Chunk korrekt sein muss.
  const checkUnsynced = useCallback(async () => {
    const { count } = await supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .not("bexio_contact_id", "is", null)
      .is("bexio_nr", null)
      .eq("is_active", true);
    setUnsyncedCount(count ?? 0);
  }, [supabase]);

  useEffect(() => { checkUnsynced(); }, [checkUnsynced]);

  async function syncBexioNrs() {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/bexio/contacts/sync-nrs", { method: "POST" });
      const json = await res.json();
      if (!json.success) {
        toast.error("Sync fehlgeschlagen: " + (json.error || "Unbekannt"));
        return;
      }
      const parts = [
        json.updated > 0 ? `${json.updated} aktualisiert` : null,
        json.skipped > 0 ? `${json.skipped} ohne Nr in Bexio` : null,
        json.failed > 0 ? `${json.failed} Fehler` : null,
      ].filter(Boolean);
      toast.success("Bexio-Nrn synchronisiert" + (parts.length ? ` — ${parts.join(", ")}` : ""));
      await Promise.all([loadCustomers(), checkUnsynced()]);
    } catch (e) {
      toast.error("Netzwerkfehler: " + (e instanceof Error ? e.message : "unbekannt"));
    } finally {
      setSyncing(false);
    }
  }

  async function loadMore() {
    if (loadingMore || customers.length === 0) return;
    setLoadingMore(true);
    const last = customers[customers.length - 1];
    const { data } = await buildQuery({ name: last.name, id: last.id });
    if (data) {
      const rows = data as Customer[];
      setHasMore(rows.length > PAGE_SIZE);
      setCustomers((prev) => [...prev, ...rows.slice(0, PAGE_SIZE)]);
    }
    setLoadingMore(false);
  }

  async function confirmDelete() {
    if (deleteCode !== DELETE_CODE || !deleteTarget) {
      toast.error("Falscher Code");
      return;
    }
    try {
      const res = await fetch("/api/customers/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: deleteTarget.id, code: deleteCode }),
      });
      const json = await res.json();
      if (json.success) {
        setCustomers(customers.filter((c) => c.id !== deleteTarget.id));
        setTotalCount((c) => Math.max(0, c - 1));
        toast.success(`${deleteTarget.name} gelöscht`);
      } else {
        toast.error("Fehler: " + (json.error || "Unbekannt"));
      }
    } catch {
      toast.error("Fehler beim Löschen");
    }
    setDeleteTarget(null);
    setDeleteCode("");
  }

  const hasFilter = !!search.trim() || filterType !== "all";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kunden</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalCount} {totalCount === 1 ? "Kunde" : "Kunden"}
            {hasFilter ? " (gefiltert)" : " gesamt"}
          </p>
        </div>
        <Link href="/kunden/neu" className="kasten kasten-red">
          <Plus className="h-3.5 w-3.5" />
          Neuer Kunde
        </Link>
      </div>

      {/* Bexio-Nr-Backfill-Banner — nur sichtbar wenn es Kunden gibt die mit
          Bexio verknuepft sind, aber noch keine Kundennummer im FSM haben.
          Verschwindet automatisch nach erfolgreichem Sync. */}
      {unsyncedCount > 0 && (
        <div className="rounded-xl border bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 px-4 py-3 flex items-center gap-3 flex-wrap">
          <RefreshCw className="h-4 w-4 text-blue-700 dark:text-blue-300 shrink-0" />
          <p className="text-sm text-blue-900 dark:text-blue-100 flex-1 min-w-0">
            <strong>{unsyncedCount}</strong> {unsyncedCount === 1 ? "Kunde ist" : "Kunden sind"} mit Bexio verknüpft, aber ohne Kundennummer im FSM.
          </p>
          <button
            type="button"
            onClick={syncBexioNrs}
            disabled={syncing}
            className="kasten kasten-bexio shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Synchronisiere…" : "Jetzt synchronisieren"}
          </button>
        </div>
      )}

      {/* Such- + Filter-Bar — gleiches Pattern wie /auftraege und /orte */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Name, E-Mail oder Kundennummer suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "company", "individual", "organization"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterType(t)}
              className={filterType === t ? "kasten-active" : "kasten-toggle-off"}
            >
              {t === "all" ? "Alle" : CUSTOMER_TYPES[t]}
            </button>
          ))}
        </div>
        {hasFilter && (
          <button
            type="button"
            onClick={() => { setSearch(""); setFilterType("all"); }}
            className="h-9 px-3 text-xs text-muted-foreground hover:text-foreground rounded-lg flex items-center gap-1.5 transition-colors"
            title="Filter zurücksetzen"
          >
            <X className="h-3.5 w-3.5" />
            Reset
          </button>
        )}
      </div>

      {/* Tabellen-Container — eine umschliessende Card statt eine pro Row.
          Spart bei 50+ Eintraegen massiv Render-Aufwand und sieht auch dichter aus. */}
      {loading ? (
        <div className="rounded-xl border bg-card divide-y">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-11 px-4 flex items-center">
              <div className="h-3 w-16 bg-muted rounded animate-pulse mr-4" />
              <div className="h-3 w-48 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : customers.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card py-16 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg">{hasFilter ? "Keine Treffer" : "Noch keine Kunden"}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {hasFilter ? "Andere Suche oder Filter zurücksetzen." : "Lege deinen ersten Kunden an."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* Desktop-Header — sticky innerhalb der scrollbaren Liste */}
          <div className="hidden md:grid grid-cols-[88px_1fr_240px_140px_120px_36px] gap-4 px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b bg-muted/30">
            <span>Nr.</span>
            <span>Name</span>
            <span>E-Mail</span>
            <span>Telefon</span>
            <span>Ort</span>
            <span aria-hidden />
          </div>
          {/* Rows */}
          <div className="divide-y">
            {customers.map((c) => {
              const Icon = TYPE_ICONS[c.type];
              return (
                <div key={c.id} className="group">
                  {/* Desktop-Zeile — eine Grid-Reihe, ~44px hoch.
                      Name-Zelle ist Link zur Detail-Seite; Email/Telefon sind eigene
                      Anker (mailto:/tel:) damit der Klick die richtige Aktion ausloest. */}
                  <div className="hidden md:grid grid-cols-[88px_1fr_240px_140px_120px_36px] gap-4 items-center px-4 py-2 hover:bg-foreground/[0.04] dark:hover:bg-foreground/[0.06] transition-colors">
                    <span className="font-mono text-xs text-muted-foreground">
                      {c.bexio_nr ? (
                        c.bexio_nr
                      ) : (
                        <span className="opacity-40" title="Noch nicht mit Bexio synchronisiert">—</span>
                      )}
                    </span>
                    <Link href={`/kunden/${c.id}`} className="flex items-center gap-2 min-w-0 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label={CUSTOMER_TYPES[c.type]} />
                      <span className="font-medium text-sm truncate">{c.name}</span>
                    </Link>
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="text-sm text-muted-foreground hover:text-foreground truncate transition-colors">
                        {c.email}
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground/40">—</span>
                    )}
                    {c.phone ? (
                      <a href={`tel:${c.phone}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                        {c.phone}
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground/40">—</span>
                    )}
                    <span className="text-sm text-muted-foreground truncate">
                      {c.address_city || <span className="opacity-40">—</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(c)}
                      className="p-1 rounded text-muted-foreground/0 group-hover:text-muted-foreground/50 hover:!text-red-500 transition-all"
                      title="Kunde löschen"
                      aria-label={`Kunde ${c.name} löschen`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {/* Mobile-Zeile — kompakt, 2-zeilig: Nr+Name oben, Email/Ort unten */}
                  <div className="md:hidden flex items-center gap-3 px-4 py-3 hover:bg-foreground/[0.04] transition-colors">
                    <Link href={`/kunden/${c.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="font-mono text-[10px] text-muted-foreground w-12 shrink-0">
                        {c.bexio_nr ?? <span className="opacity-40">—</span>}
                      </span>
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" aria-label={CUSTOMER_TYPES[c.type]} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[c.email, c.address_city].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(c)}
                      className="p-2 rounded-lg text-muted-foreground/40"
                      title="Kunde löschen"
                      aria-label={`Kunde ${c.name} löschen`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Mehr laden — innerhalb der Card-Box, dezent */}
          {hasMore && (
            <div className="border-t flex justify-center py-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="kasten kasten-muted"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                {loadingMore ? "Lade…" : "Mehr laden"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Delete Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteCode(""); }}
        title="Kunde löschen"
      >
        <p className="text-sm text-muted-foreground">
          <strong>{deleteTarget?.name}</strong> wird unwiderruflich gelöscht.
        </p>
        <div>
          <label className="text-sm font-medium">Bestätigungscode eingeben</label>
          <Input
            value={deleteCode}
            onChange={(e) => setDeleteCode(e.target.value)}
            placeholder="Code eingeben..."
            className="mt-1.5 text-center text-lg tracking-widest font-mono"
            maxLength={4}
          />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => { setDeleteTarget(null); setDeleteCode(""); }} className="kasten kasten-muted flex-1">
            Abbrechen
          </button>
          <button type="button" onClick={confirmDelete} disabled={deleteCode.length < 4} className="kasten kasten-red flex-1">
            Endgültig löschen
          </button>
        </div>
      </Modal>
    </div>
  );
}
