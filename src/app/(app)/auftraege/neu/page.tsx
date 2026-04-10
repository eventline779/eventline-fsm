"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Customer, Location, Profile, JobPriority } from "@/types";
import { ArrowLeft, Save, UserCheck, Users } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function NeuerAuftragPage() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "normal" as JobPriority,
    customer_id: "",
    location_id: "",
    project_lead_id: "",
    start_date: "",
    end_date: "",
    notes: "",
  });
  const [assignedTechnicians, setAssignedTechnicians] = useState<string[]>([]);

  useEffect(() => {
    async function loadData() {
      const [custRes, locRes, profRes] = await Promise.all([
        supabase.from("customers").select("*").eq("is_active", true).order("name"),
        supabase.from("locations").select("*").eq("is_active", true).order("name"),
        supabase.from("profiles").select("*").eq("is_active", true).order("full_name"),
      ]);
      if (custRes.data) setCustomers(custRes.data as Customer[]);
      if (locRes.data) setLocations(locRes.data as Location[]);
      if (profRes.data) setProfiles(profRes.data as Profile[]);
    }
    loadData();
  }, []);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleTechnician(id: string) {
    setAssignedTechnicians((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { data: job, error } = await supabase.from("jobs").insert({
      title: form.title,
      description: form.description || null,
      status: "entwurf",
      priority: form.priority,
      customer_id: form.customer_id,
      location_id: form.location_id || null,
      project_lead_id: form.project_lead_id || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      notes: form.notes || null,
      created_by: user?.id,
    }).select("id").single();

    if (error) {
      toast.error("Fehler: " + error.message);
      setSaving(false);
      return;
    }

    // Techniker zuweisen
    if (job && assignedTechnicians.length > 0) {
      await supabase.from("job_assignments").insert(
        assignedTechnicians.map((pid) => ({ job_id: job.id, profile_id: pid }))
      );
    }

    toast.success("Auftrag erfolgreich erstellt");
    router.push("/auftraege");
  }

  const priorities: { value: JobPriority; label: string; color: string }[] = [
    { value: "niedrig", label: "Niedrig", color: "border-gray-200 bg-gray-50 text-gray-600" },
    { value: "normal", label: "Normal", color: "border-blue-200 bg-blue-50 text-blue-700" },
    { value: "hoch", label: "Hoch", color: "border-orange-200 bg-orange-50 text-orange-700" },
    { value: "dringend", label: "Dringend", color: "border-red-200 bg-red-50 text-red-700" },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/auftraege"><button className="p-2 rounded-lg hover:bg-white transition-colors"><ArrowLeft className="h-5 w-5" /></button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Neuer Auftrag</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Auftrag erstellen und zuweisen</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Titel & Beschreibung */}
        <Card className="bg-white">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Auftrag</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">Titel *</Label>
              <Input id="title" placeholder="z.B. Licht & Ton Setup Konzert" value={form.title} onChange={(e) => update("title", e.target.value)} className="mt-1.5 bg-gray-50 border-gray-200" required />
            </div>
            <div>
              <Label>Beschreibung</Label>
              <textarea placeholder="Details zum Auftrag..." value={form.description} onChange={(e) => update("description", e.target.value)} className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500" rows={3} />
            </div>
          </CardContent>
        </Card>

        {/* Priorität */}
        <Card className="bg-white">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Priorität</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2">
              {priorities.map((p) => (
                <button key={p.value} type="button" onClick={() => update("priority", p.value)} className={`px-3 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all ${form.priority === p.value ? p.color + " border-current" : "border-gray-100 bg-gray-50 text-gray-400"}`}>{p.label}</button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Kunde & Standort */}
        <Card className="bg-white">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Kunde & Standort</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Kunde *</Label>
              <select value={form.customer_id} onChange={(e) => update("customer_id", e.target.value)} className="mt-1.5 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500" required>
                <option value="">Kunde auswählen...</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {customers.length === 0 && <p className="text-xs text-muted-foreground mt-1">Noch keine Kunden. <Link href="/kunden/neu" className="text-red-600 hover:underline">Jetzt erstellen</Link></p>}
            </div>
            <div>
              <Label>Standort</Label>
              <select value={form.location_id} onChange={(e) => update("location_id", e.target.value)} className="mt-1.5 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500">
                <option value="">Standort auswählen (optional)...</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Projektleiter & Techniker */}
        <Card className="bg-white">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Team</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="flex items-center gap-2"><UserCheck className="h-4 w-4" />Projektleiter</Label>
              <select value={form.project_lead_id} onChange={(e) => update("project_lead_id", e.target.value)} className="mt-1.5 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500">
                <option value="">Projektleiter auswählen...</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>)}
              </select>
            </div>
            <div>
              <Label className="flex items-center gap-2"><Users className="h-4 w-4" />Techniker zuweisen</Label>
              <div className="mt-2 space-y-2">
                {profiles.map((p) => (
                  <label key={p.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${assignedTechnicians.includes(p.id) ? "border-red-200 bg-red-50" : "border-gray-100 bg-gray-50 hover:border-gray-200"}`}>
                    <input type="checkbox" checked={assignedTechnicians.includes(p.id)} onChange={() => toggleTechnician(p.id)} className="rounded border-gray-300 text-red-600 focus:ring-red-500" />
                    <div className="h-8 w-8 rounded-lg bg-gray-200 flex items-center justify-center text-xs font-bold">{p.full_name.charAt(0)}</div>
                    <div>
                      <span className="text-sm font-medium">{p.full_name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{p.role}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Datum */}
        <Card className="bg-white">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Zeitraum</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Startdatum</Label><Input type="datetime-local" value={form.start_date} onChange={(e) => update("start_date", e.target.value)} className="mt-1.5 bg-gray-50 border-gray-200" /></div>
              <div><Label>Enddatum</Label><Input type="datetime-local" value={form.end_date} onChange={(e) => update("end_date", e.target.value)} className="mt-1.5 bg-gray-50 border-gray-200" /></div>
            </div>
          </CardContent>
        </Card>

        {/* Notizen */}
        <Card className="bg-white">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Notizen</CardTitle></CardHeader>
          <CardContent>
            <textarea placeholder="Interne Notizen..." value={form.notes} onChange={(e) => update("notes", e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500" rows={3} />
          </CardContent>
        </Card>

        <div className="flex gap-3 pt-2">
          <Link href="/auftraege" className="flex-1"><Button type="button" variant="outline" className="w-full">Abbrechen</Button></Link>
          <Button type="submit" disabled={!form.title || !form.customer_id || saving} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
            <Save className="h-4 w-4 mr-2" />{saving ? "Speichern..." : "Auftrag erstellen"}
          </Button>
        </div>
      </form>
    </div>
  );
}
