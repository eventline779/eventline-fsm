"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { Location } from "@/types";
import Link from "next/link";
import {
  Plus,
  Search,
  MapPin,
  Users as UsersIcon,
  Wrench,
  Building,
} from "lucide-react";

export default function StandortePage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address_street: "",
    address_zip: "",
    address_city: "Basel",
    capacity: "",
    technical_details: "",
    notes: "",
  });
  const supabase = createClient();

  useEffect(() => { loadLocations(); }, []);

  async function loadLocations() {
    const { data } = await supabase
      .from("locations")
      .select("*")
      .eq("is_active", true)
      .order("name");
    if (data) setLocations(data as Location[]);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("locations").insert({
      name: form.name,
      address_street: form.address_street || null,
      address_zip: form.address_zip || null,
      address_city: form.address_city || null,
      capacity: form.capacity ? parseInt(form.capacity) : null,
      technical_details: form.technical_details || null,
      notes: form.notes || null,
    });
    if (!error) {
      setForm({ name: "", address_street: "", address_zip: "", address_city: "Basel", capacity: "", technical_details: "", notes: "" });
      setShowForm(false);
      loadLocations();
    }
    setSaving(false);
  }

  const filtered = locations.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Standorte</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {locations.length} {locations.length === 1 ? "Standort" : "Standorte"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-red-300 dark:border-red-500/40 bg-card text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
          Neuer Standort
        </button>
      </div>

      {/* Inline Form */}
      {showForm && (
        <Card className="bg-card border-red-100">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <h3 className="font-semibold">Neuen Standort erfassen</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Name *</label>
                  <Input
                    placeholder="z.B. Theater BAU3"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="mt-1.5 bg-gray-50"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Kapazität (Personen)</label>
                  <Input
                    type="number"
                    placeholder="z.B. 100"
                    value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                    className="mt-1.5 bg-gray-50"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Strasse</label>
                <Input
                  placeholder="Strasse und Hausnummer"
                  value={form.address_street}
                  onChange={(e) => setForm({ ...form, address_street: e.target.value })}
                  className="mt-1.5 bg-gray-50"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">PLZ</label>
                  <Input
                    placeholder="4052"
                    value={form.address_zip}
                    onChange={(e) => setForm({ ...form, address_zip: e.target.value })}
                    className="mt-1.5 bg-gray-50"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Ort</label>
                  <Input
                    placeholder="Basel"
                    value={form.address_city}
                    onChange={(e) => setForm({ ...form, address_city: e.target.value })}
                    className="mt-1.5 bg-gray-50"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Technische Details</label>
                <textarea
                  placeholder="Licht, Ton, Beamer, Strom etc."
                  value={form.technical_details}
                  onChange={(e) => setForm({ ...form, technical_details: e.target.value })}
                  className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  rows={2}
                />
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Abbrechen
                </Button>
                <Button
                  type="submit"
                  disabled={!form.name || saving}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {saving ? "Speichern..." : "Standort erstellen"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Standort suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-card border-gray-200"
        />
      </div>

      {/* Location List */}
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse bg-card">
              <CardContent className="p-5">
                <div className="h-5 bg-gray-200 rounded w-2/3 mb-3" />
                <div className="h-4 bg-gray-100 rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed bg-card">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Building className="h-7 w-7 text-gray-400" />
            </div>
            <h3 className="font-semibold text-gray-900 text-lg">
              {search ? "Keine Ergebnisse" : "Noch keine Standorte"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search ? "Versuche einen anderen Suchbegriff." : "Erstelle deinen ersten Standort."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((loc) => (
            <Link key={loc.id} href={`/standorte/${loc.id}`}>
            <Card className="bg-card hover:shadow-md hover:border-gray-300 transition-all duration-200 group cursor-pointer">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gray-100 text-gray-500 group-hover:bg-red-50 group-hover:text-red-500 transition-colors">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{loc.name}</h3>
                    {loc.address_city && (
                      <p className="text-xs text-muted-foreground">
                        {loc.address_zip} {loc.address_city}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {loc.capacity && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-50 text-blue-600">
                      <UsersIcon className="h-3 w-3" />
                      {loc.capacity} Pers.
                    </span>
                  )}
                  {loc.technical_details && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-600">
                      <Wrench className="h-3 w-3" />
                      Technik
                    </span>
                  )}
                </div>
                {loc.technical_details && (
                  <p className="mt-3 text-xs text-muted-foreground line-clamp-2">
                    {loc.technical_details}
                  </p>
                )}
              </CardContent>
            </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
