"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Location, LocationContact, MaintenanceTask } from "@/types";
import {
  ArrowLeft, Plus, UserPlus, Wrench, Check, StickyNote, MapPin,
  Users, Phone, Mail, Trash2, Camera, Image as ImageIcon, X,
  ClipboardList,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface MaintenanceTaskWithPhoto extends MaintenanceTask {
  photo_url?: string | null;
}

export default function StandortDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [location, setLocation] = useState<Location | null>(null);
  const [contacts, setContacts] = useState<LocationContact[]>([]);
  const [tasks, setTasks] = useState<MaintenanceTaskWithPhoto[]>([]);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Contact form
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", role: "", email: "", phone: "" });

  // Task form
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", description: "", due_date: "" });
  const [taskPhoto, setTaskPhoto] = useState<{ file: File; preview: string } | null>(null);
  const taskPhotoRef = useRef<HTMLInputElement>(null);
  const taskCameraRef = useRef<HTMLInputElement>(null);

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
    if (taskRes.data) setTasks(taskRes.data as MaintenanceTaskWithPhoto[]);
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

  function handleTaskPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setTaskPhoto({ file, preview: URL.createObjectURL(file) });
    e.target.value = "";
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();

    let photoUrl: string | null = null;
    if (taskPhoto) {
      const ext = taskPhoto.file.name.split(".").pop() || "jpg";
      const path = `maintenance/${id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("documents").upload(path, taskPhoto.file, { contentType: taskPhoto.file.type });
      if (!error) photoUrl = path;
    }

    await supabase.from("maintenance_tasks").insert({
      location_id: id,
      title: taskForm.title,
      description: taskForm.description || null,
      due_date: taskForm.due_date || null,
      photo_url: photoUrl,
      created_by: user?.id,
    });

    setTaskForm({ title: "", description: "", due_date: "" });
    if (taskPhoto) { URL.revokeObjectURL(taskPhoto.preview); setTaskPhoto(null); }
    setShowTaskForm(false);
    loadAll();
    toast.success("Instandhaltungsarbeit erstellt");
  }

  async function toggleTask(taskId: string, currentStatus: string) {
    const newStatus = currentStatus === "offen" ? "erledigt" : "offen";
    await supabase.from("maintenance_tasks").update({
      status: newStatus,
      completed_at: newStatus === "erledigt" ? new Date().toISOString() : null,
    }).eq("id", taskId);
    loadAll();
  }

  async function createJobFromTask(task: MaintenanceTaskWithPhoto) {
    const { data: { user } } = await supabase.auth.getUser();

    const { data: job, error } = await supabase.from("jobs").insert({
      title: `Instandhaltung: ${task.title}`,
      description: [
        task.description,
        location ? `Standort: ${location.name}` : null,
        task.photo_url ? `Foto vorhanden` : null,
      ].filter(Boolean).join("\n"),
      status: "offen",
      priority: "normal",
      customer_id: location?.customer_id,
      location_id: id,
      created_by: user?.id,
    }).select("id").single();

    if (error) {
      toast.error("Fehler: " + error.message);
      return;
    }

    toast.success("Auftrag erstellt aus Instandhaltung");
    router.push(`/auftraege/${job.id}`);
  }

  function getPhotoPublicUrl(path: string) {
    const { data } = supabase.storage.from("documents").getPublicUrl(path);
    return data.publicUrl;
  }

  if (!location) return <div className="py-20 text-center text-muted-foreground">Laden...</div>;

  const filteredTasks = tasks.filter((t) => taskFilter === "all" || t.status === taskFilter);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/standorte"><button className="p-2 rounded-lg hover:bg-white transition-colors"><ArrowLeft className="h-5 w-5" /></button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{location.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {[location.address_street, `${location.address_zip} ${location.address_city}`].filter(Boolean).join(", ")}
            {location.capacity ? ` · ${location.capacity} Personen` : ""}
          </p>
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
          <Button size="sm" variant="outline" onClick={() => setShowTaskForm(!showTaskForm)}>
            {showTaskForm ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
            {showTaskForm ? "Abbrechen" : "Neue Arbeit"}
          </Button>
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

          {/* Neue Arbeit Formular */}
          {showTaskForm && (
            <form onSubmit={addTask} className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
              <Input placeholder="Titel der Arbeit *" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} required />
              <textarea placeholder="Beschreibung..." value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white resize-none" rows={2} />
              <Input type="date" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} />

              {/* Foto */}
              {taskPhoto ? (
                <div className="relative rounded-xl overflow-hidden border border-gray-200 w-fit">
                  <img src={taskPhoto.preview} alt="Foto" className="h-32 w-auto object-cover rounded-xl" />
                  <button
                    type="button"
                    onClick={() => { URL.revokeObjectURL(taskPhoto.preview); setTaskPhoto(null); }}
                    className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/50 text-white hover:bg-red-600 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button type="button" onClick={() => taskCameraRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-xs font-medium text-gray-400 hover:border-red-300 hover:text-red-500 transition-colors">
                    <Camera className="h-4 w-4" />Foto aufnehmen
                  </button>
                  <button type="button" onClick={() => taskPhotoRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-xs font-medium text-gray-400 hover:border-red-300 hover:text-red-500 transition-colors">
                    <ImageIcon className="h-4 w-4" />Aus Galerie
                  </button>
                </div>
              )}

              <input ref={taskCameraRef} type="file" accept="image/*" capture="environment" onChange={handleTaskPhoto} className="hidden" />
              <input ref={taskPhotoRef} type="file" accept="image/*" onChange={handleTaskPhoto} className="hidden" />

              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => { setShowTaskForm(false); if (taskPhoto) { URL.revokeObjectURL(taskPhoto.preview); setTaskPhoto(null); } }}>Abbrechen</Button>
                <Button type="submit" size="sm" className="bg-red-600 hover:bg-red-700 text-white">Erstellen</Button>
              </div>
            </form>
          )}

          {filteredTasks.length === 0 && !showTaskForm && <p className="text-sm text-muted-foreground py-4 text-center">Keine Instandhaltungsarbeiten.</p>}

          {filteredTasks.map((t) => (
            <div key={t.id} className={`p-3 rounded-xl border ${t.status === "erledigt" ? "bg-green-50 border-green-100" : "bg-gray-50 border-gray-100"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <button onClick={() => toggleTask(t.id, t.status)} className={`flex items-center justify-center w-6 h-6 rounded-md border-2 transition-all mt-0.5 shrink-0 ${t.status === "erledigt" ? "bg-green-500 border-green-500 text-white" : "border-gray-300 hover:border-red-400"}`}>
                    {t.status === "erledigt" && <Check className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <span className={`font-medium text-sm ${t.status === "erledigt" ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                    {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      {t.due_date && <span className="text-xs text-muted-foreground">Fällig: {new Date(t.due_date).toLocaleDateString("de-CH")}</span>}
                      {t.completed_at && <span className="text-xs text-green-600">Erledigt: {new Date(t.completed_at).toLocaleDateString("de-CH")}</span>}
                    </div>
                    {/* Foto anzeigen */}
                    {t.photo_url && (
                      <div className="mt-2">
                        <img
                          src={getPhotoPublicUrl(t.photo_url)}
                          alt="Foto"
                          className="h-24 w-auto rounded-lg border border-gray-200 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => window.open(getPhotoPublicUrl(t.photo_url!), "_blank")}
                        />
                      </div>
                    )}
                  </div>
                </div>
                {/* Auftrag erstellen Button */}
                {t.status === "offen" && (
                  <button
                    onClick={() => createJobFromTask(t)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200 hover:bg-blue-100 transition-colors"
                    title="Auftrag aus Instandhaltung erstellen"
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    Auftrag
                  </button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
