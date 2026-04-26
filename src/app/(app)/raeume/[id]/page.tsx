"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Room, RoomContact, RoomPrice } from "@/types";
import {
  ArrowLeft, Plus, UserPlus, Users, Phone, Mail, Trash2,
  DoorOpen, StickyNote, X, Banknote, Wrench, FileText, Upload, Download,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function RaumDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [room, setRoom] = useState<Room | null>(null);
  const [contacts, setContacts] = useState<RoomContact[]>([]);
  const [prices, setPrices] = useState<RoomPrice[]>([]);

  // Contact form
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", role: "", email: "", phone: "" });

  // Price form
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [priceForm, setPriceForm] = useState({ label: "", amount: "", notes: "" });

  // Notes
  const [notesList, setNotesList] = useState<{ id: string; content: string; created_at: string }[]>([]);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [newNote, setNewNote] = useState("");

  // Docs
  const [docs, setDocs] = useState<{ name: string; path: string; uploaded_at: string }[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const docRef = useRef<HTMLInputElement>(null);

  // Löschen
  const [showDelete, setShowDelete] = useState(false);
  const [deleteCode, setDeleteCode] = useState("");
  const [deleteError, setDeleteError] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Tech details edit
  const [editingTech, setEditingTech] = useState(false);
  const [techText, setTechText] = useState("");

  useEffect(() => { loadAll(); }, [id]);

  async function loadAll() {
    const [roomRes, contRes, priceRes] = await Promise.all([
      supabase.from("rooms").select("*").eq("id", id).single(),
      supabase.from("room_contacts").select("*").eq("room_id", id).order("name"),
      supabase.from("room_prices").select("*").eq("room_id", id).order("created_at"),
    ]);
    if (roomRes.data) {
      setRoom(roomRes.data as Room);
      setTechText(roomRes.data.technical_details || "");
      // Load notes from notes field
      if (roomRes.data.notes) {
        try {
          const parsed = JSON.parse(roomRes.data.notes);
          if (parsed._notes) setNotesList(parsed._notes);
          if (parsed._docs) setDocs(parsed._docs);
        } catch {}
      }
    }
    if (contRes.data) setContacts(contRes.data as RoomContact[]);
    if (priceRes.data) setPrices(priceRes.data as RoomPrice[]);
  }

  async function saveRoomData(notes: any[], documents: any[]) {
    let data: any = {};
    try { data = JSON.parse(room?.notes || "{}"); } catch { data = {}; }
    data._notes = notes;
    data._docs = documents;
    await supabase.from("rooms").update({ notes: JSON.stringify(data) }).eq("id", id);
  }

  async function saveTech() {
    await supabase.from("rooms").update({ technical_details: techText || null }).eq("id", id);
    setEditingTech(false);
    loadAll();
    toast.success("Technische Details gespeichert");
  }

  // Contacts
  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("room_contacts").insert({ room_id: id, name: contactForm.name, role: contactForm.role || null, email: contactForm.email || null, phone: contactForm.phone || null });
    setContactForm({ name: "", role: "", email: "", phone: "" });
    setShowContactForm(false);
    loadAll();
    toast.success("Kontaktperson hinzugefügt");
  }

  async function deleteContact(contactId: string) {
    await supabase.from("room_contacts").delete().eq("id", contactId);
    loadAll();
  }

  // Prices
  async function addPrice(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("room_prices").insert({ room_id: id, label: priceForm.label, amount: parseFloat(priceForm.amount), notes: priceForm.notes || null });
    setPriceForm({ label: "", amount: "", notes: "" });
    setShowPriceForm(false);
    loadAll();
    toast.success("Preis hinzugefügt");
  }

  async function deletePrice(priceId: string) {
    await supabase.from("room_prices").delete().eq("id", priceId);
    loadAll();
  }

  // Notes
  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;
    const updated = [{ id: crypto.randomUUID(), content: newNote, created_at: new Date().toISOString() }, ...notesList];
    await saveRoomData(updated, docs);
    setNotesList(updated);
    setNewNote("");
    setShowNoteForm(false);
    toast.success("Notiz hinzugefügt");
  }

  async function deleteNote(noteId: string) {
    const updated = notesList.filter((n) => n.id !== noteId);
    await saveRoomData(updated, docs);
    setNotesList(updated);
    toast.success("Notiz gelöscht");
  }

  // Docs
  async function uploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `raeume/${id}/${Date.now()}_${safeName}`;
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", path);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!json.success) { toast.error("Upload-Fehler: " + (json.error || "Unbekannt")); setUploadingDoc(false); e.target.value = ""; return; }
    } catch { toast.error("Upload fehlgeschlagen"); setUploadingDoc(false); e.target.value = ""; return; }
    const newDocs = [...docs, { name: file.name, path, uploaded_at: new Date().toISOString() }];
    await saveRoomData(notesList, newDocs);
    setDocs(newDocs);
    toast.success("Dokument hochgeladen");
    setUploadingDoc(false);
    e.target.value = "";
  }

  async function deleteDoc(doc: { name: string; path: string }) {
    await supabase.storage.from("documents").remove([doc.path]);
    const newDocs = docs.filter((d) => d.path !== doc.path);
    await saveRoomData(notesList, newDocs);
    setDocs(newDocs);
    toast.success("Dokument gelöscht");
  }

  function openDoc(path: string) {
    const { data } = supabase.storage.from("documents").getPublicUrl(path);
    window.open(data.publicUrl, "_blank");
  }

  async function deleteRoom() {
    if (!deleteCode) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/rooms/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, code: deleteCode }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Raum gelöscht");
        router.push("/raeume");
      } else {
        setDeleteError(true);
        setDeleting(false);
      }
    } catch {
      toast.error("Fehler beim Löschen");
      setDeleting(false);
    }
  }

  if (!room) return <div className="py-20 text-center text-muted-foreground">Laden...</div>;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/raeume"><button className="p-2 rounded-lg hover:bg-card transition-colors"><ArrowLeft className="h-5 w-5" /></button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{room.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {[room.address_street, `${room.address_zip || ""} ${room.address_city || ""}`].filter((s) => s?.trim()).join(", ")}
            {room.capacity ? ` · ${room.capacity} Personen` : ""}
          </p>
        </div>
        <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 ml-auto" onClick={() => { setShowDelete(true); setDeleteCode(""); setDeleteError(false); }}>
          <Trash2 className="h-4 w-4 mr-1" />Löschen
        </Button>
      </div>

      {/* Technische Details */}
      <Card className="bg-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Wrench className="h-4 w-4" />Technische Details</CardTitle>
          {!editingTech && <Button size="sm" variant="outline" onClick={() => setEditingTech(true)}>Bearbeiten</Button>}
        </CardHeader>
        <CardContent>
          {editingTech ? (
            <div className="space-y-3">
              <textarea value={techText} onChange={(e) => setTechText(e.target.value)} placeholder="Bühne, Licht, Ton, Strom, Bestuhlung..." className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20" rows={4} />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setEditingTech(false); setTechText(room.technical_details || ""); }}>Abbrechen</Button>
                <button type="button" onClick={saveTech} className="kasten kasten-red">Speichern</button>
              </div>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap">{room.technical_details || <span className="text-muted-foreground">Noch keine technischen Details erfasst.</span>}</p>
          )}
        </CardContent>
      </Card>

      {/* Preise */}
      <Card className="bg-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Banknote className="h-4 w-4" />Preise ({prices.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowPriceForm(!showPriceForm)}>
            {showPriceForm ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
            {showPriceForm ? "Abbrechen" : "Preis hinzufügen"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {showPriceForm && (
            <form onSubmit={addPrice} className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Bezeichnung * (z.B. Tagesmiete)" value={priceForm.label} onChange={(e) => setPriceForm({ ...priceForm, label: e.target.value })} required />
                <Input type="number" step="0.01" placeholder="Betrag (CHF) *" value={priceForm.amount} onChange={(e) => setPriceForm({ ...priceForm, amount: e.target.value })} required />
              </div>
              <Input placeholder="Bemerkung (optional)" value={priceForm.notes} onChange={(e) => setPriceForm({ ...priceForm, notes: e.target.value })} />
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowPriceForm(false)}>Abbrechen</Button>
                <button type="submit" className="kasten kasten-red">Speichern</button>
              </div>
            </form>
          )}
          {prices.length === 0 && !showPriceForm && <p className="text-sm text-muted-foreground py-4 text-center">Noch keine Preise erfasst.</p>}
          {prices.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{p.label}</span>
                  <span className="text-sm font-bold text-green-700">CHF {Number(p.amount).toLocaleString("de-CH", { minimumFractionDigits: 2 })}</span>
                </div>
                {p.notes && <p className="text-xs text-muted-foreground mt-0.5">{p.notes}</p>}
              </div>
              <button onClick={() => deletePrice(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Kontaktpersonen */}
      <Card className="bg-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Users className="h-4 w-4" />Ansprechpartner ({contacts.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowContactForm(!showContactForm)}><UserPlus className="h-4 w-4 mr-1" />Hinzufügen</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {showContactForm && (
            <form onSubmit={addContact} className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Name *" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} required />
                <Input placeholder="Funktion (z.B. Vermietung)" value={contactForm.role} onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="E-Mail" type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
                <Input placeholder="Telefon" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowContactForm(false)}>Abbrechen</Button>
                <button type="submit" className="kasten kasten-red">Speichern</button>
              </div>
            </form>
          )}
          {contacts.length === 0 && !showContactForm && <p className="text-sm text-muted-foreground py-4 text-center">Noch keine Ansprechpartner.</p>}
          {contacts.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{c.name}</span>
                  {c.role && <span className="text-xs text-muted-foreground bg-gray-200 px-2 py-0.5 rounded-full">{c.role}</span>}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-blue-600 transition-colors"><Mail className="h-3 w-3" />{c.email}</a>}
                  {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-blue-600 transition-colors"><Phone className="h-3 w-3" />{c.phone}</a>}
                </div>
              </div>
              <button onClick={() => deleteContact(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Notizen */}
      <Card className="bg-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><StickyNote className="h-4 w-4" />Notizen ({notesList.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowNoteForm(!showNoteForm)}>
            {showNoteForm ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
            {showNoteForm ? "Abbrechen" : "Neue Notiz"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {showNoteForm && (
            <form onSubmit={addNote} className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
              <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Notiz eingeben..." className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-card resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20" rows={3} required />
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => { setShowNoteForm(false); setNewNote(""); }}>Abbrechen</Button>
                <button type="submit" className="kasten kasten-red">Speichern</button>
              </div>
            </form>
          )}
          {notesList.length === 0 && !showNoteForm && <p className="text-sm text-muted-foreground py-4 text-center">Noch keine Notizen.</p>}
          {notesList.map((n) => (
            <div key={n.id} className="flex items-start justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="min-w-0 flex-1">
                <p className="text-sm whitespace-pre-wrap">{n.content}</p>
                <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <button onClick={() => deleteNote(n.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors ml-2 shrink-0"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Dokumente */}
      <Card className="bg-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><FileText className="h-4 w-4" />Dokumente ({docs.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={() => docRef.current?.click()} disabled={uploadingDoc}>
            <Upload className="h-4 w-4 mr-1" />{uploadingDoc ? "Hochladen..." : "PDF hochladen"}
          </Button>
          <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onChange={uploadDoc} className="hidden" />
        </CardHeader>
        <CardContent className="space-y-3">
          {docs.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Noch keine Dokumente.</p>}
          {docs.map((d) => (
            <div key={d.path} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
              <button onClick={() => openDoc(d.path)} className="flex items-center gap-3 min-w-0 flex-1 text-left hover:text-blue-600 transition-colors">
                <FileText className="h-5 w-5 text-red-500 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(d.uploaded_at).toLocaleDateString("de-CH")}</p>
                </div>
              </button>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <button onClick={() => openDoc(d.path)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors"><Download className="h-4 w-4" /></button>
                <button onClick={() => deleteDoc(d)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Löschen Modal */}
      {showDelete && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setShowDelete(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold text-gray-900 dark:text-white">Raum löschen</h2>
                <button onClick={() => setShowDelete(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="h-4 w-4 text-gray-500" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
                  <Trash2 className="h-5 w-5 text-red-600 shrink-0" />
                  <p className="text-sm text-red-800">Dieser Raum wird unwiderruflich gelöscht — inkl. Kontakte, Preise und Dokumente.</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Code eingeben</label>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="4-stelliger Code" value={deleteCode} onChange={(e) => { setDeleteCode(e.target.value); setDeleteError(false); }} className={`mt-1.5 w-full h-10 px-3 text-lg tracking-widest text-center rounded-lg border bg-card dark:bg-gray-800 outline-none focus:ring-2 ${deleteError ? "border-red-500 focus:ring-red-500" : "border-gray-200 focus:ring-blue-500 focus:border-blue-500"}`} />
                  {deleteError && <p className="text-xs text-red-600 mt-1">Falscher Code</p>}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowDelete(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">Abbrechen</button>
                  <button onClick={deleteRoom} disabled={!deleteCode || deleting} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                    <Trash2 className="h-4 w-4" />{deleting ? "Löschen..." : "Endgültig löschen"}
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
