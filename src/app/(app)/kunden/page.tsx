"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { CUSTOMER_TYPES } from "@/lib/constants";
import type { Customer, CustomerType } from "@/types";
import Link from "next/link";
import {
  Plus, Search, Building2, User, Globe, Mail, Phone, MapPin, Users, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";

const DELETE_CODE = "5225";

export default function KundenPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<CustomerType | "all">("all");
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleteCode, setDeleteCode] = useState("");
  const supabase = createClient();

  useEffect(() => { loadCustomers(); }, []);

  async function loadCustomers() {
    const { data } = await supabase.from("customers").select("*").eq("is_active", true).order("name");
    if (data) setCustomers(data as Customer[]);
    setLoading(false);
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

  const filtered = customers.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || (c.email?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesType = filterType === "all" || c.type === filterType;
    return matchesSearch && matchesType;
  });

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
          <p className="text-sm text-muted-foreground mt-1">{customers.length} Kunden gesamt</p>
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
      ) : filtered.length === 0 ? (
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
          {filtered.map((customer) => (
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
        </div>
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-lg" onClick={() => { setDeleteTarget(null); setDeleteCode(""); }} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold text-gray-900 dark:text-white">Kunde löschen</h2>
                <button onClick={() => { setDeleteTarget(null); setDeleteCode(""); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  <strong>{deleteTarget.name}</strong> wird unwiderruflich gelöscht.
                </p>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Bestätigungscode eingeben</label>
                  <Input
                    value={deleteCode}
                    onChange={(e) => setDeleteCode(e.target.value)}
                    placeholder="Code eingeben..."
                    className="mt-1.5 text-center text-lg tracking-widest font-mono"
                    maxLength={4}
                  />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setDeleteTarget(null); setDeleteCode(""); }} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    Abbrechen
                  </button>
                  <button onClick={confirmDelete} disabled={deleteCode.length < 4} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-30">
                    Endgültig löschen
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
