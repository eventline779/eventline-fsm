"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Customer, Location } from "@/types";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function NeueAnfragePage() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [form, setForm] = useState({
    customer_id: "", location_id: "", event_date: "", event_end_date: "", event_type: "", guest_count: "", details: "", notes: "", services: "",
  });

  useEffect(() => {
    async function load() {
      const [c, l] = await Promise.all([
        supabase.from("customers").select("*").eq("is_active", true).order("name"),
        supabase.from("locations").select("*").eq("is_active", true).order("name"),
      ]);
      if (c.data) setCustomers(c.data as Customer[]);
      if (l.data) setLocations(l.data as Location[]);
    }
    load();
  }, []);

  function update(field: string, value: string) { setForm((p) => ({ ...p, [field]: value })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("rental_requests").insert({
      customer_id: form.customer_id,
      location_id: form.location_id || null,
      event_date: form.event_date || null,
      event_end_date: form.event_end_date || null,
      event_type: form.event_type || null,
      guest_count: form.guest_count ? parseInt(form.guest_count) : null,
      details: form.details || null,
      notes: form.services ? JSON.stringify({ services: form.services, notes: form.notes }) : (form.notes || null),
      created_by: user?.id,
    });
    if (error) { toast.error("Fehler: " + error.message); setSaving(false); return; }
    toast.success("Vermietung erstellt");
    router.push("/anfragen");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/anfragen"><button className="p-2 rounded-lg hover:bg-white transition-colors"><ArrowLeft className="h-5 w-5" /></button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Neue Vermietung</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Vermietung erfassen</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <Card className="bg-white">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Kunde & Location</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Kunde *</Label>
              <select value={form.customer_id} onChange={(e) => update("customer_id", e.target.value)} className="mt-1.5 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500" required>
                <option value="">Kunde auswählen...</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Location</Label>
              <select value={form.location_id} onChange={(e) => update("location_id", e.target.value)} className="mt-1.5 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500">
                <option value="">Location auswählen...</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name} {l.capacity ? `(${l.capacity} Pers.)` : ""}</option>)}
              </select>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Event-Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Startdatum</Label>
                <Input type="date" value={form.event_date} onChange={(e) => update("event_date", e.target.value)} className="mt-1.5 bg-gray-50 border-gray-200" />
              </div>
              <div>
                <Label>Enddatum</Label>
                <Input type="date" value={form.event_end_date} onChange={(e) => update("event_end_date", e.target.value)} className="mt-1.5 bg-gray-50 border-gray-200" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Personenanzahl</Label>
                <Input type="number" placeholder="z.B. 80" value={form.guest_count} onChange={(e) => update("guest_count", e.target.value)} className="mt-1.5 bg-gray-50 border-gray-200" />
              </div>
            </div>
            <div>
              <Label>Veranstaltungstyp</Label>
              <Input placeholder="z.B. Konzert, Firmenanlass, Theater..." value={form.event_type} onChange={(e) => update("event_type", e.target.value)} className="mt-1.5 bg-gray-50 border-gray-200" />
            </div>
            <div>
              <Label>Erweiterte Dienstleistungen</Label>
              <textarea placeholder="z.B. Tontechnik, Lichttechnik, Reinigung, Catering..." value={form.services} onChange={(e) => update("services", e.target.value)} className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500" rows={2} />
            </div>
            <div>
              <Label>Details</Label>
              <textarea placeholder="Weitere Details zur Anfrage..." value={form.details} onChange={(e) => update("details", e.target.value)} className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500" rows={4} />
            </div>
          </CardContent>
        </Card>
        <div className="flex gap-3 pt-2">
          <Link href="/anfragen" className="flex-1"><Button type="button" variant="outline" className="w-full">Abbrechen</Button></Link>
          <Button type="submit" disabled={!form.customer_id || saving} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
            <Save className="h-4 w-4 mr-2" />{saving ? "Speichern..." : "Anfrage erstellen"}
          </Button>
        </div>
      </form>
    </div>
  );
}
