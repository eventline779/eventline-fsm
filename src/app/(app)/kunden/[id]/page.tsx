"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CUSTOMER_TYPES, JOB_STATUS } from "@/lib/constants";
import type { Customer, Job, CustomerType } from "@/types";
import {
  ArrowLeft, Save, Building2, User, Globe, Mail, Phone, MapPin,
  ClipboardList, Trash2,
} from "lucide-react";
import { JobNumber } from "@/components/job-number";
import Link from "next/link";
import { toast } from "sonner";

export default function KundenDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "", type: "company" as CustomerType,
    email: "", phone: "",
    address_street: "", address_zip: "", address_city: "",
    notes: "",
  });

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    const [custRes, jobsRes] = await Promise.all([
      supabase.from("customers").select("*").eq("id", id).single(),
      supabase.from("jobs").select("*, location:locations(name)").eq("customer_id", id).neq("is_deleted", true).order("created_at", { ascending: false }),
    ]);
    if (custRes.data) {
      const c = custRes.data as Customer;
      setCustomer(c);
      setForm({
        name: c.name, type: c.type,
        email: c.email || "", phone: c.phone || "",
        address_street: c.address_street || "", address_zip: c.address_zip || "", address_city: c.address_city || "",
        notes: c.notes || "",
      });
    }
    if (jobsRes.data) setJobs(jobsRes.data as unknown as Job[]);
  }

  async function handleSave() {
    const { error } = await supabase.from("customers").update({
      name: form.name, type: form.type,
      email: form.email || null, phone: form.phone || null,
      address_street: form.address_street || null, address_zip: form.address_zip || null, address_city: form.address_city || null,
      notes: form.notes || null,
    }).eq("id", id);
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Kunde gespeichert");
    setEditing(false);
    loadData();
  }

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);

    // Verknüpfte Daten löschen
    const { data: jobIds } = await supabase.from("jobs").select("id").eq("customer_id", id);
    const ids = jobIds?.map((j: any) => j.id) || [];

    if (ids.length > 0) {
      await supabase.from("job_assignments").delete().in("job_id", ids);
      await supabase.from("job_appointments").delete().in("job_id", ids);
      await supabase.from("service_reports").delete().in("job_id", ids);
      await supabase.from("documents").delete().in("job_id", ids);
      await supabase.from("time_entries").delete().in("job_id", ids);
    }
    // Anfragen sind seit Migration 026 auch jobs (status='anfrage'), also reicht jobs-delete.
    await supabase.from("jobs").delete().eq("customer_id", id);

    const { error } = await supabase.from("customers").delete().eq("id", id);

    if (error) {
      toast.error("Fehler: " + error.message);
      setDeleting(false);
      return;
    }

    toast.success("Kunde gelöscht");
    router.push("/kunden");
  }

  if (!customer) return <div className="py-20 text-center text-muted-foreground">Laden...</div>;

  const typeIcon = customer.type === "company" ? <Building2 className="h-5 w-5" /> : customer.type === "individual" ? <User className="h-5 w-5" /> : <Globe className="h-5 w-5" />;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/kunden"><button className="p-2 rounded-lg hover:bg-card transition-colors"><ArrowLeft className="h-5 w-5" /></button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{customer.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{CUSTOMER_TYPES[customer.type]}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl ring-1 ring-foreground/10 bg-card hover:bg-foreground/[0.03] transition-all ${editing ? "text-foreground/70 hover:text-foreground" : "text-red-700 dark:text-red-300"}`}
          >
            {editing ? "Abbrechen" : "Bearbeiten"}
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="inline-flex items-center justify-center px-3 py-2 text-xs font-medium rounded-xl ring-1 ring-foreground/10 bg-card text-red-700 dark:text-red-300 hover:bg-foreground/[0.03] transition-all"
            aria-label="Löschen"
            title="Löschen"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Löschen Bestätigung */}
      {showDeleteConfirm && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-5">
            <h3 className="font-semibold text-red-800">Kunde "{customer.name}" wirklich löschen?</h3>
            <p className="text-sm text-red-600 mt-1">Alle verknüpften Aufträge, Vermietentwürfe und Dokumente werden ebenfalls gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl ring-1 ring-foreground/10 bg-card text-foreground/70 hover:text-foreground hover:bg-foreground/[0.03] transition-all"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl ring-1 ring-foreground/10 bg-card text-red-700 dark:text-red-300 hover:bg-foreground/[0.03] transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                <Trash2 className="h-3.5 w-3.5" />{deleting ? "Löschen..." : "Endgültig löschen"}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Kundendaten */}
      <Card className="bg-card">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Kundendaten</CardTitle></CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5 bg-gray-50" required /></div>
                <div>
                  <Label>Typ</Label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CustomerType })} className="mt-1.5 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-gray-50">
                    {Object.entries(CUSTOMER_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><Label>E-Mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5 bg-gray-50" /></div>
                <div><Label>Telefon</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5 bg-gray-50" /></div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div><Label>Strasse</Label><Input value={form.address_street} onChange={(e) => setForm({ ...form, address_street: e.target.value })} className="mt-1.5 bg-gray-50" /></div>
                <div><Label>PLZ</Label><Input value={form.address_zip} onChange={(e) => setForm({ ...form, address_zip: e.target.value })} className="mt-1.5 bg-gray-50" /></div>
                <div><Label>Ort</Label><Input value={form.address_city} onChange={(e) => setForm({ ...form, address_city: e.target.value })} className="mt-1.5 bg-gray-50" /></div>
              </div>
              <div><Label>Notizen</Label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none" rows={3} /></div>
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl ring-1 ring-foreground/10 bg-card text-red-700 dark:text-red-300 hover:bg-foreground/[0.03] transition-all"
              >
                <Save className="h-3.5 w-3.5" />Speichern
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {customer.email && <a href={`mailto:${customer.email}`} className="flex items-center gap-3 text-sm hover:text-blue-600 transition-colors"><Mail className="h-4 w-4 text-gray-400" />{customer.email}</a>}
              {customer.phone && <a href={`tel:${customer.phone}`} className="flex items-center gap-3 text-sm hover:text-blue-600 transition-colors"><Phone className="h-4 w-4 text-gray-400" />{customer.phone}</a>}
              {customer.address_street && <div className="flex items-center gap-3 text-sm"><MapPin className="h-4 w-4 text-gray-400" />{customer.address_street}, {customer.address_zip} {customer.address_city}</div>}
              {customer.notes && <div className="mt-3 p-3 rounded-lg bg-gray-50 text-sm text-gray-600">{customer.notes}</div>}
              {!customer.email && !customer.phone && !customer.address_street && !customer.notes && <p className="text-sm text-muted-foreground">Keine weiteren Daten hinterlegt.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Aufträge */}
      <Card className="bg-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><ClipboardList className="h-4 w-4" />Aufträge ({jobs.length})</CardTitle>
          <Link
            href={`/auftraege/neu?customer_id=${id}`}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl ring-1 ring-foreground/10 bg-card text-red-700 dark:text-red-300 hover:bg-foreground/[0.03] transition-all"
          >
            Neuer Auftrag
          </Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Keine Aufträge für diesen Kunden.</p>
          ) : jobs.map((j) => (
            <Link key={j.id} href={`/auftraege/${j.id}`}>
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100 hover:border-gray-200 transition-colors cursor-pointer">
                <div>
                  <div className="flex items-center gap-2">
                    <JobNumber number={j.job_number} />
                    <span className="font-medium text-sm">{j.title}</span>
                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${JOB_STATUS[j.status].color}`}>{JOB_STATUS[j.status].label}</span>
                  </div>
                  {(j.location as unknown as { name: string })?.name && <p className="text-xs text-muted-foreground mt-0.5">{(j.location as unknown as { name: string }).name}</p>}
                </div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
