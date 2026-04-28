"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { CUSTOMER_TYPES } from "@/lib/constants";
import type { Customer, CustomerType } from "@/types";
import Link from "next/link";
import {
  Plus, Search, Building2, User, Globe, Mail, Phone, MapPin, Users, Trash2, X, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";

const DELETE_CODE = "5225";
const PAGE_SIZE = 50;

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
      q = q.or(`name.ilike.${like},email.ilike.${like}`);
    }
    if (cursor !== null) {
      // (name = cursor.name AND id > cursor.id) OR (name > cursor.name)
      q = q.or(`and(name.eq.${cursor.name},id.gt.${cursor.id}),name.gt.${cursor.name}`);
    }
    return q.order("name", { ascending: true }).order("id", { ascending: true }).limit(PAGE_SIZE + 1);
  }, [supabase, filterType, search]);

  const loadCustomers = useCallback(async () => {
    const myId = ++queryIdRef.current;
    setLoading(true);
    const { data, count } = await buildQuery(null);
    if (myId !== queryIdRef.current) return; // ueberholte Query verwerfen
    if (data) {
      const rows = data as Customer[];
      setHasMore(rows.length > PAGE_SIZE);
      setCustomers(rows.slice(0, PAGE_SIZE));
    }
    if (typeof count === "number") setTotalCount(count);
    setLoading(false);
  }, [buildQuery]);

  // Initial + bei Filter-Aenderung neu laden. Bei Tippen mit 250ms Debounce.
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      loadCustomers();
    }, 250);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [loadCustomers]);

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

  const typeIcon = (type: CustomerType) => {
    switch (type) {
      case "company": return <Building2 className="h-4 w-4" />;
      case "individual": return <User className="h-4 w-4" />;
      case "organization": return <Globe className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kunden</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalCount} {totalCount === 1 ? "Kunde" : "Kunden"}
            {(search.trim() || filterType !== "all") ? " (gefiltert)" : " gesamt"}
          </p>
        </div>
        <Link
          href="/kunden/neu"
          className="kasten kasten-red"
        >
          <Plus className="h-3.5 w-3.5" />
          Neuer Kunde
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Kunden suchen..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-card border-gray-200" />
        </div>
        <div className="flex gap-2">
          {(["all", "company", "individual", "organization"] as const).map((type) => (
            <button key={type} onClick={() => setFilterType(type)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${filterType === type ? "bg-black text-white border-black" : "bg-card text-gray-600 border-gray-200"}`}>
              {type === "all" ? "Alle" : CUSTOMER_TYPES[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Customer List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse bg-card"><CardContent className="p-4"><div className="h-5 bg-gray-200 rounded w-2/3" /></CardContent></Card>
          ))}
        </div>
      ) : customers.length === 0 ? (
        <Card className="border-dashed bg-card">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><Users className="h-7 w-7 text-gray-400" /></div>
            <h3 className="font-semibold text-lg">{search ? "Keine Ergebnisse" : "Noch keine Kunden"}</h3>
            <p className="text-sm text-muted-foreground mt-1">{search ? "Versuche einen anderen Suchbegriff." : "Erstelle deinen ersten Kunden."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-[1fr_200px_150px_150px_40px] gap-4 px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Name</span>
            <span>E-Mail</span>
            <span>Telefon</span>
            <span>Ort</span>
            <span></span>
          </div>
          {customers.map((customer) => (
            <Card key={customer.id} className="bg-card hover:shadow-sm transition-all group">
              <CardContent className="p-0">
                {/* Desktop */}
                <div className="hidden md:grid grid-cols-[1fr_200px_150px_150px_40px] gap-4 items-center px-4 py-3">
                  <Link href={`/kunden/${customer.id}`} className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-100 text-gray-500 shrink-0 group-hover:bg-red-50 group-hover:text-red-500 transition-colors text-sm font-bold">
                      {customer.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{customer.name}</p>
                      <p className="text-[10px] text-muted-foreground">{CUSTOMER_TYPES[customer.type]}</p>
                    </div>
                  </Link>
                  {customer.email ? (
                    <a href={`mailto:${customer.email}`} className="text-sm text-gray-500 hover:text-blue-600 truncate transition-colors">{customer.email}</a>
                  ) : <span className="text-sm text-gray-300">–</span>}
                  {customer.phone ? (
                    <a href={`tel:${customer.phone}`} className="text-sm text-gray-500 hover:text-blue-600 transition-colors">{customer.phone}</a>
                  ) : <span className="text-sm text-gray-300">–</span>}
                  <span className="text-sm text-gray-500 truncate">{customer.address_city || "–"}</span>
                  <button onClick={(e) => { e.preventDefault(); setDeleteTarget(customer); }} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {/* Mobile */}
                <div className="md:hidden p-4">
                  <Link href={`/kunden/${customer.id}`} className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 text-gray-500 shrink-0 text-sm font-bold">
                      {customer.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{customer.name}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        {customer.address_city && <span>{customer.address_city}</span>}
                        {customer.email && <span className="truncate">{customer.email}</span>}
                      </div>
                    </div>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(customer); }} className="p-1.5 rounded-lg text-gray-300">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
          {hasMore && (
            <div className="flex justify-center pt-2">
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
