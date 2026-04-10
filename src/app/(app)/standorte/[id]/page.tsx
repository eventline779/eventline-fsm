"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Location, LocationContact, MaintenanceTask } from "@/types";
import { ArrowLeft, Plus, UserPlus, Wrench, Check, StickyNote, MapPin, Users, Phone, Mail, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function StandortDetailPage() {
  const { id } = useParams();
  const supabase = createClient();
  const [location, setLocation] = useState<Location | null>(null);
  const [contacts, setContacts] = useState<LocationContact[]>([]);
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Contact form
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", role: "", email: "", phone: "" });

  // Task form
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", description: "", due_date: "" });

  const [taskFilter, setTaskFilter] = useState<"all" | "offen" | "erledigt">("all");

  useEffect(() => { loadAll(); }, [id]);

  async function loadAll() {
    const [locRes, contRes, taskRes] = await Promise.all([
      supabase.from("locations").select("*").eq("id", id).single(),
      supabase.from("location_contacts").select("*").eq("location_id", id).order("name"),
      supabase.from("maintenance_tasks").select("*").eq("location_id", id).order("created_at", { ascending: false }),
    ]);
    if (locRes.data) { setLocation(locRes.data as Location); setNotes(locRes.data.notes || ""); }
    if (contRes.data) setContacts(contRes.data as LocationContact[]);
    if (taskRes.data) setTasks(taskRes.data as MaintenanceTask[]);
  }

  async function saveNotes() {
    setSavingNotes(true);
    await supabase.from("locations").update({ notes }).eq("id", id);
    toast.success("Notizen gespeichert");
    setSavingNotes(false);
  }

  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("location_contacts").insert({ location_id: id, name: contactForm.name, role: contactForm.role || null, email: contactForm.email || null, phone: contactForm.phone || null });
    setContactForm({ name: "", role: "", email: "", phone: "" });
    setShowContactForm(false);
    loadAll();
    toast.success("Kontaktperson hinzugefügt");
  }

  async function deleteContact(contactId: string) {
    await supabase.from("location_contacts").delete().eq("id", contactId);
    loadAll();
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("maintenance_tasks").insert({ location_id: id, title: taskForm.title, description: taskForm.description || null, due_date: taskForm.due_date || null, created_by: user?.id });
    setTaskForm({ title: "", description: "", due_date: "" });
    setShowTaskForm(false);
    loadAll();
    toast.success("Instandhaltungsarbeit erstellt");
  }

  async function toggleTask(taskId: string, currentStatus: string) {
    const newStatus = currentStatus === "offen" ? "erledigt" : "offen";
    await supabase.from("maintenance_tasks").update({ status: newStatus, completed_at: newStatus === "erledigt" ? new Date().toISOString() : null }).eq("id", taskId);
    loadAll();
  }

  if (!location) return <div className="py-20 text-center text-muted-foreground">Laden...</div>;

  const filteredTasks = tasks.filter((t) => taskFilter === "all" || t.status === taskFilter);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/standorte"><button className="p-2 rounded-lg hover:bg-white transition-colors"><ArrowLeft className="h-5 w-5" /></button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{location.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{location.address_zip} {location.address_city} {location.capacity ? `· ${location.capacity} Personen` : ""}</p>
        </div>
      </div>

      {/* Notizen */}
      <Card className="bg-white">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><StickyNote className="h-4 w-4" />Notizen</CardTitle></CardHeader>
        <CardContent>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notizen zu diesem Standort..." className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500" rows={4} />
          <Button onClick={saveNotes} disabled={savingNotes} size="sm" className="mt-2 bg-red-600 hover:bg-red-700 text-white">{savingNotes ? "Speichern..." : "Notizen speichern"}</Button>
        </CardContent>
      </Card>

      {/* Kontaktpersonen */}
      <Card className="bg-white">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Users className="h-4 w-4" />Kontaktpersonen ({contacts.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowContactForm(!showContactForm)}><UserPlus className="h-4 w-4 mr-1" />Hinzufügen</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {showContactForm && (
            <form onSubmit={addContact} className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Name *" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} required />
                <Input placeholder="Funktion (z.B. Hausmeister)" value={contactForm.role} onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="E-Mail" type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
                <Input placeholder="Telefon" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowContactForm(false)}>Abbrechen</Button>
                <Button type="submit" size="sm" className="bg-red-600 hover:bg-red-700 text-white">Speichern</Button>
              </div>
            </form>
          )}
          {contacts.length === 0 && !showContactForm && <p className="text-sm text-muted-foreground py-4 text-center">Noch keine Kontaktpersonen.</p>}
          {contacts.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{c.name}</span>
                  {c.role && <span className="text-xs text-muted-foreground bg-gray-200 px-2 py-0.5 rounded-full">{c.role}</span>}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                  {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                </div>
              </div>
              <button onClick={() => deleteContact(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Instandhaltung */}
      <Card className="bg-white">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Wrench className="h-4 w-4" />Instandhaltung ({tasks.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowTaskForm(!showTaskForm)}><Plus className="h-4 w-4 mr-1" />Neue Arbeit</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filter */}
          <div className="flex gap-2">
            {(["all", "offen", "erledigt"] as const).map((f) => (
              <button key={f} onClick={() => setTaskFilter(f)} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${taskFilter === f ? "bg-black text-white border-black" : "bg-white text-gray-600 border-gray-200"}`}>
                {f === "all" ? "Alle" : f === "offen" ? "Offen" : "Erledigt"}
              </button>
            ))}
          </div>

          {showTaskForm && (
            <form onSubmit={addTask} className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
              <Input placeholder="Titel der Arbeit *" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} required />
              <textarea placeholder="Beschreibung..." value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white resize-none" rows={2} />
              <Input type="date" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} />
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowTaskForm(false)}>Abbrechen</Button>
                <Button type="submit" size="sm" className="bg-red-600 hover:bg-red-700 text-white">Erstellen</Button>
              </div>
            </form>
          )}

          {filteredTasks.length === 0 && !showTaskForm && <p className="text-sm text-muted-foreground py-4 text-center">Keine Instandhaltungsarbeiten.</p>}
          {filteredTasks.map((t) => (
            <div key={t.id} className={`flex items-center justify-between p-3 rounded-xl border ${t.status === "erledigt" ? "bg-green-50 border-green-100" : "bg-gray-50 border-gray-100"}`}>
              <div className="flex items-center gap-3 min-w-0">
                <button onClick={() => toggleTask(t.id, t.status)} className={`flex items-center justify-center w-6 h-6 rounded-md border-2 transition-all ${t.status === "erledigt" ? "bg-green-500 border-green-500 text-white" : "border-gray-300 hover:border-red-400"}`}>
                  {t.status === "erledigt" && <Check className="h-4 w-4" />}
                </button>
                <div className="min-w-0">
                  <span className={`font-medium text-sm ${t.status === "erledigt" ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {t.due_date && <span className="text-xs text-muted-foreground">Fällig: {new Date(t.due_date).toLocaleDateString("de-CH")}</span>}
                    {t.completed_at && <span className="text-xs text-green-600">Erledigt: {new Date(t.completed_at).toLocaleDateString("de-CH")}</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
