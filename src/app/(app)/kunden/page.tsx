"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { CUSTOMER_TYPES } from "@/lib/constants";
import type { Customer, CustomerType } from "@/types";
import Link from "next/link";
import {
  Plus,
  Search,
  Building2,
  User,
  Globe,
  Mail,
  Phone,
  MapPin,
  Users,
} from "lucide-react";

export default function KundenPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<CustomerType | "all">("all");
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("is_active", true)
      .order("name");

    if (data) setCustomers(data as Customer[]);
    setLoading(false);
  }

  const filtered = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email?.toLowerCase().includes(search.toLowerCase()) ?? false);
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
          <p className="text-sm text-muted-foreground mt-1">
            {customers.length} {customers.length === 1 ? "Kunde" : "Kunden"} gesamt
          </p>
        </div>
        <Link href="/kunden/neu">
          <Button className="bg-red-600 hover:bg-red-700 text-white shadow-sm">
            <Plus className="h-4 w-4 mr-2" />
            Neuer Kunde
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Kunden suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-white border-gray-200"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "company", "individual", "organization"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                filterType === type
                  ? "bg-black text-white border-black"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {type === "all" ? "Alle" : CUSTOMER_TYPES[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Customer List */}
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse bg-white">
              <CardContent className="p-5">
                <div className="h-5 bg-gray-200 rounded w-2/3 mb-3" />
                <div className="h-4 bg-gray-100 rounded w-1/2 mb-2" />
                <div className="h-4 bg-gray-100 rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed bg-white">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Users className="h-7 w-7 text-gray-400" />
            </div>
            <h3 className="font-semibold text-gray-900 text-lg">
              {search ? "Keine Ergebnisse" : "Noch keine Kunden"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {search
                ? "Versuche einen anderen Suchbegriff."
                : "Erstelle deinen ersten Kunden um loszulegen."}
            </p>
            {!search && (
              <Link href="/kunden/neu">
                <Button className="mt-5 bg-red-600 hover:bg-red-700 text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Ersten Kunden erstellen
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((customer) => (
            <Link key={customer.id} href={`/kunden/${customer.id}`}>
              <Card className="hover:shadow-md hover:border-gray-300 transition-all duration-200 cursor-pointer group bg-white">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gray-100 text-gray-500 group-hover:bg-red-50 group-hover:text-red-500 transition-colors">
                      {typeIcon(customer.type)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 group-hover:text-black truncate">
                        {customer.name}
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {CUSTOMER_TYPES[customer.type]}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 space-y-1.5">
                    {customer.email && (
                      <a href={`mailto:${customer.email}`} className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 transition-colors">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{customer.email}</span>
                      </a>
                    )}
                    {customer.phone && (
                      <a href={`tel:${customer.phone}`} className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 transition-colors">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span>{customer.phone}</span>
                      </a>
                    )}
                    {customer.address_city && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span>{customer.address_zip} {customer.address_city}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
