"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { VertriebContact, VertriebStatus, VertriebPriority, VertriebKategorie } from "@/types";
import { Plus, TrendingUp, Edit2, Trash2, X, Star, Phone, Mail, Calendar, Filter, Search, Building2, PartyPopper } from "lucide-react";
import { toast } from "sonner";

const STATUS_OPTIONS: { value: VertriebStatus; label: string; color: string }[] = [
  { value: "offen", label: "Offen", color: "bg-gray-100 text-gray-700 border-gray-200" },
  { value: "kontaktiert", label: "Kontaktiert", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "gespraech", label: "Gespräch", color: "bg-teal-100 text-teal-700 border-teal-200" },
  { value: "gewonnen", label: "Gewonnen", color: "bg-green-100 text-green-700 border-green-200" },
  { value: "abgesagt", label: "Abgesagt", color: "bg-red-100 text-red-700 border-red-200" },
];

const PRIORITY_OPTIONS: { value: VertriebPriority; label: string; color: string }[] = [
  { value: "top", label: "★ Top", color: "bg-green-100 text-green-700 border-green-200" },
  { value: "gut", label: "Gut", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "mittel", label: "Mittel", color: "bg-gray-100 text-gray-600 border-gray-200" },
];

const KATEGORIE_OPTIONS: { value: VertriebKategorie; label: string; icon: any; color: string }[] = [
  { value: "verwaltung", label: "Verwaltungs-Anfragen", icon: Building2, color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "veranstaltung", label: "Veranstaltungen", icon: PartyPopper, color: "bg-purple-100 text-purple-700 border-purple-200" },
];

const BEDARF_BEREICHE = [
  { key: "verwaltungsaufwand", label: "Verwaltungsaufwand" },
  { key: "material", label: "Material" },
  { key: "arbeiten", label: "Arbeiten" },
  { key: "stunden", label: "Stunden" },
  { key: "catering", label: "Catering" },
  { key: "transport", label: "Transport" },
  { key: "raum", label: "Raum" },
] as const;

const emptyForm = {
  firma: "", branche: "", ansprechperson: "", position: "", email: "", telefon: "",
  event_typ: "", status: "offen" as VertriebStatus, datum_kontakt: "", notizen: "",
  prioritaet: "mittel" as VertriebPriority, kategorie: "veranstaltung" as VertriebKategorie,
  // Verwaltung
  infrastruktur: "", ort: "", zielgruppe: "", programm: "", bedarf_vor_ort: "",
  // Veranstaltung: pro Bereich ein Text
  bedarf: {} as Record<string, string>,
  // Kontakt als Kunden speichern
  create_customer: false,
};

const VERTRIEB_PASSWORD = "788596";

export default function VertriebPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [contacts, setContacts] = useState<VertriebContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<VertriebStatus | "all">("all");
  const [filterPriority, setFilterPriority] = useState<VertriebPriority | "all">("all");
  const [filterKategorie, setFilterKategorie] = useState<VertriebKategorie | "all">("all");
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("vertrieb-unlocked") === "1") {
      setUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [unlocked]);

  function tryUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (pwInput === VERTRIEB_PASSWORD) {
      setUnlocked(true);
      sessionStorage.setItem("vertrieb-unlocked", "1");
      setPwInput("");
      setPwError(false);
    } else {
      setPwError(true);
    }
  }

  if (!unlocked) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="bg-white w-full max-w-sm">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-red-50 text-red-500 mx-auto">
              <TrendingUp className="h-7 w-7" />
            </div>
            <div className="text-center">
              <h2 className="font-semibold text-lg">Vertrieb</h2>
              <p className="text-sm text-muted-foreground mt-1">Dieser Bereich ist passwortgeschützt.</p>
            </div>
            <form onSubmit={tryUnlock} className="space-y-3">
              <input
                type="password"
                inputMode="numeric"
                placeholder="Passwort"
                value={pwInput}
                onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
                className={`w-full h-11 px-4 text-lg tracking-widest text-center rounded-lg border bg-gray-50 outline-none focus:ring-2 ${pwError ? "border-red-500 focus:ring-red-500" : "border-gray-200 focus:ring-red-500 focus:border-red-500"}`}
                autoFocus
              />
              {pwError && <p className="text-xs text-red-600 text-center">Falsches Passwort</p>}
              <Button type="submit" disabled={!pwInput} className="w-full bg-red-600 hover:bg-red-700 text-white">Zugang</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  async function load() {
    const { data } = await supabase.from("vertrieb_contacts").select("*").order("nr");
    if (data) setContacts(data as VertriebContact[]);
    setLoading(false);
  }

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setShowCategoryPicker(true);
  }

  function pickCategory(kategorie: VertriebKategorie) {
    setForm({ ...emptyForm, kategorie });
    setShowCategoryPicker(false);
    setShowForm(true);
  }

  function openEdit(c: VertriebContact) {
    setEditingId(c.id);
    // Details aus notizen parsen (wenn JSON)
    let details: any = {};
    let freieNotiz = c.notizen || "";
    try {
      const parsed = JSON.parse(c.notizen || "{}");
      if (parsed && typeof parsed === "object" && parsed._details) {
        details = parsed._details;
        freieNotiz = parsed._text || "";
      }
    } catch {}
    setForm({
      firma: c.firma, branche: c.branche || "", ansprechperson: c.ansprechperson || "",
      position: c.position || "", email: c.email || "", telefon: c.telefon || "",
      event_typ: c.event_typ || "", status: c.status, datum_kontakt: c.datum_kontakt || "",
      notizen: freieNotiz, prioritaet: c.prioritaet, kategorie: c.kategorie || "veranstaltung",
      infrastruktur: details.infrastruktur || "",
      ort: details.ort || "",
      zielgruppe: details.zielgruppe || "",
      programm: details.programm || "",
      bedarf_vor_ort: details.bedarf_vor_ort || "",
      bedarf: details.bedarf || {},
      create_customer: false,
    });
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    // Details als JSON in notizen speichern (_text = freie Notiz, _details = kategorienspezifisch)
    const details: any = {};
    if (form.kategorie === "verwaltung") {
      if (form.infrastruktur) details.infrastruktur = form.infrastruktur;
      if (form.ort) details.ort = form.ort;
      if (form.zielgruppe) details.zielgruppe = form.zielgruppe;
      if (form.programm) details.programm = form.programm;
      if (form.bedarf_vor_ort) details.bedarf_vor_ort = form.bedarf_vor_ort;
    } else {
      const filteredBedarf: Record<string, string> = {};
      Object.entries(form.bedarf).forEach(([k, v]) => { if (v?.trim()) filteredBedarf[k] = v; });
      if (Object.keys(filteredBedarf).length > 0) details.bedarf = filteredBedarf;
    }
    const notizenStored = (Object.keys(details).length > 0 || form.notizen)
      ? JSON.stringify({ _text: form.notizen, _details: details })
      : null;

    const payload = {
      firma: form.firma,
      branche: form.branche || null,
      ansprechperson: form.ansprechperson || null,
      position: form.position || null,
      email: form.email || null,
      telefon: form.telefon || null,
      event_typ: form.event_typ || null,
      status: form.status,
      datum_kontakt: form.datum_kontakt || null,
      notizen: notizenStored,
      prioritaet: form.prioritaet,
      kategorie: form.kategorie,
    };
    if (editingId) {
      await supabase.from("vertrieb_contacts").update(payload).eq("id", editingId);
      toast.success("Eintrag aktualisiert");
    } else {
      await supabase.from("vertrieb_contacts").insert(payload);
      // Wenn gewünscht, auch als Kunde anlegen
      if (form.create_customer && form.firma) {
        const { data: existing } = await supabase.from("customers").select("id").eq("name", form.firma).maybeSingle();
        if (!existing) {
          await supabase.from("customers").insert({
            name: form.firma,
            type: "company",
            email: form.email || null,
            phone: form.telefon || null,
            notes: form.ansprechperson ? `Ansprechperson: ${form.ansprechperson}${form.position ? ` (${form.position})` : ""}` : null,
          });
          toast.success("Eintrag erstellt · Kunde angelegt");
        } else {
          toast.success("Eintrag erstellt · Kunde existiert bereits");
        }
      } else {
        toast.success("Eintrag erstellt");
      }
    }
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    load();
    setSaving(false);
  }

  async function updateStatus(id: string, status: VertriebStatus) {
    await supabase.from("vertrieb_contacts").update({ status }).eq("id", id);
    setContacts(contacts.map((c) => c.id === id ? { ...c, status } : c));
  }

  async function updatePriority(id: string, prioritaet: VertriebPriority) {
    await supabase.from("vertrieb_contacts").update({ prioritaet }).eq("id", id);
    setContacts(contacts.map((c) => c.id === id ? { ...c, prioritaet } : c));
  }

  async function deleteContact(id: string) {
    if (!confirm("Eintrag wirklich löschen?")) return;
    await supabase.from("vertrieb_contacts").delete().eq("id", id);
    toast.success("Eintrag gelöscht");
    load();
  }

  const filtered = contacts
    .filter((c) => filterKategorie === "all" || c.kategorie === filterKategorie)
    .filter((c) => filterStatus === "all" || c.status === filterStatus)
    .filter((c) => filterPriority === "all" || c.prioritaet === filterPriority)
    .filter((c) => {
      const q = search.toLowerCase();
      return !q || c.firma.toLowerCase().includes(q) || (c.ansprechperson || "").toLowerCase().includes(q) || (c.branche || "").toLowerCase().includes(q);
    });

  const statusCounts = STATUS_OPTIONS.reduce((acc, s) => {
    acc[s.value] = contacts.filter((c) => c.status === s.value).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vertrieb</h1>
          <p className="text-sm text-muted-foreground mt-1">{contacts.length} Kontakte · {statusCounts.gewonnen || 0} gewonnen · {statusCounts.offen || 0} offen</p>
        </div>
        <Button onClick={openNew} className="bg-red-600 hover:bg-red-700 text-white shadow-sm">
          <Plus className="h-4 w-4 mr-2" />Neuer Kontakt
        </Button>
      </div>

      {/* Suche + Filter */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Firma, Person oder Branche..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-white" />
        </div>
        <select value={filterKategorie} onChange={(e) => setFilterKategorie(e.target.value as any)} className="h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white">
          <option value="all">Alle Kategorien</option>
          {KATEGORIE_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white">
          <option value="all">Alle Status</option>
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label} ({statusCounts[s.value] || 0})</option>)}
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value as any)} className="h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white">
          <option value="all">Alle Prioritäten</option>
          {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {/* Form */}
      {/* Kategorie-Picker */}
      {showCategoryPicker && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setShowCategoryPicker(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold">Was für ein Lead?</h2>
                <button onClick={() => setShowCategoryPicker(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="h-4 w-4 text-gray-500" /></button>
              </div>
              <div className="p-6 space-y-3">
                {KATEGORIE_OPTIONS.map((k) => {
                  const Icon = k.icon;
                  return (
                    <button key={k.value} onClick={() => pickCategory(k.value)} className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-red-400 hover:bg-red-50 transition-all group">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${k.color}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="text-left flex-1">
                        <p className="font-semibold">{k.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {k.value === "verwaltung" ? "Verwaltungen, Immobilien, WEG-Anfragen" : "Sommerfeste, Jahresanlässe, Firmenevents"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {showForm && (
        <Card className="bg-white border-red-100">
          <CardContent className="p-6">
            <form onSubmit={save} className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold">{editingId ? "Kontakt bearbeiten" : "Neuer Kontakt"}</h3>
                  {(() => {
                    const k = KATEGORIE_OPTIONS.find((o) => o.value === form.kategorie);
                    if (!k) return null;
                    const Icon = k.icon;
                    return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full border ${k.color}`}><Icon className="h-3 w-3" />{k.label}</span>;
                  })()}
                </div>
                <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs font-medium">Firma *</label>
                  <Input value={form.firma} onChange={(e) => setForm({ ...form, firma: e.target.value })} required className="mt-1 bg-gray-50" />
                </div>
                <div>
                  <label className="text-xs font-medium">Branche</label>
                  <Input value={form.branche} onChange={(e) => setForm({ ...form, branche: e.target.value })} className="mt-1 bg-gray-50" />
                </div>
                <div>
                  <label className="text-xs font-medium">Ansprechperson</label>
                  <Input value={form.ansprechperson} onChange={(e) => setForm({ ...form, ansprechperson: e.target.value })} className="mt-1 bg-gray-50" />
                </div>
                <div>
                  <label className="text-xs font-medium">Position</label>
                  <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="mt-1 bg-gray-50" />
                </div>
                <div>
                  <label className="text-xs font-medium">E-Mail</label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 bg-gray-50" />
                </div>
                <div>
                  <label className="text-xs font-medium">Telefon</label>
                  <Input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} className="mt-1 bg-gray-50" />
                </div>
                <div>
                  <label className="text-xs font-medium">Event-Typ</label>
                  <Input value={form.event_typ} onChange={(e) => setForm({ ...form, event_typ: e.target.value })} className="mt-1 bg-gray-50" />
                </div>
                <div>
                  <label className="text-xs font-medium">Datum Kontakt</label>
                  <Input type="date" value={form.datum_kontakt} onChange={(e) => setForm({ ...form, datum_kontakt: e.target.value })} className="mt-1 bg-gray-50" />
                </div>
                <div>
                  <label className="text-xs font-medium">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as VertriebStatus })} className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-gray-50">
                    {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium">Priorität</label>
                  <select value={form.prioritaet} onChange={(e) => setForm({ ...form, prioritaet: e.target.value as VertriebPriority })} className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-gray-50">
                    {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>
              {/* Kategorienspezifische Felder */}
              {form.kategorie === "verwaltung" ? (
                <div className="space-y-3 p-4 rounded-xl bg-blue-50/50 border border-blue-200 dark:bg-blue-950/30">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />Verwaltungs-Details</p>
                  <div>
                    <label className="text-xs font-medium">Gegebene Infrastruktur</label>
                    <textarea value={form.infrastruktur} onChange={(e) => setForm({ ...form, infrastruktur: e.target.value })} placeholder="Was ist vor Ort vorhanden? Saal, Technik, Parkplätze..." className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20" rows={2} />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Ort</label>
                    <Input value={form.ort} onChange={(e) => setForm({ ...form, ort: e.target.value })} placeholder="Adresse oder Bezeichnung" className="mt-1 bg-white" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Zielgruppe</label>
                    <Input value={form.zielgruppe} onChange={(e) => setForm({ ...form, zielgruppe: e.target.value })} placeholder="Wer wird erreicht?" className="mt-1 bg-white" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Programm</label>
                    <textarea value={form.programm} onChange={(e) => setForm({ ...form, programm: e.target.value })} placeholder="Geplantes Programm / Ablauf..." className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20" rows={2} />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Bedarf vor Ort</label>
                    <textarea value={form.bedarf_vor_ort} onChange={(e) => setForm({ ...form, bedarf_vor_ort: e.target.value })} placeholder="Was muss zusätzlich beschafft/organisiert werden?" className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20" rows={2} />
                  </div>
                </div>
              ) : (
                <div className="space-y-3 p-4 rounded-xl bg-purple-50/50 border border-purple-200 dark:bg-purple-950/30">
                  <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider flex items-center gap-1.5"><PartyPopper className="h-3.5 w-3.5" />Bedarf (Bereiche auswählen)</p>
                  {BEDARF_BEREICHE.map((b) => {
                    const active = form.bedarf[b.key] !== undefined;
                    return (
                      <div key={b.key}>
                        <button
                          type="button"
                          onClick={() => {
                            const next = { ...form.bedarf };
                            if (active) delete next[b.key]; else next[b.key] = "";
                            setForm({ ...form, bedarf: next });
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active ? "bg-purple-600 text-white" : "bg-white text-gray-700 border border-gray-200 hover:border-purple-300"}`}
                        >
                          <span>{b.label}</span>
                          <span className="text-xs">{active ? "−" : "+"}</span>
                        </button>
                        {active && (
                          <textarea
                            value={form.bedarf[b.key] || ""}
                            onChange={(e) => setForm({ ...form, bedarf: { ...form.bedarf, [b.key]: e.target.value } })}
                            placeholder={`Details zu ${b.label}...`}
                            className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                            rows={2}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Kontakt als Kunde speichern */}
              {!editingId && form.firma && (
                <label className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50 cursor-pointer hover:border-red-300">
                  <input type="checkbox" checked={form.create_customer} onChange={(e) => setForm({ ...form, create_customer: e.target.checked })} className="h-4 w-4" />
                  <span className="text-sm">Kontakt zusätzlich als Kunden anlegen ({form.firma})</span>
                </label>
              )}

              <div>
                <label className="text-xs font-medium">Notizen</label>
                <textarea value={form.notizen} onChange={(e) => setForm({ ...form, notizen: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20" rows={3} />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>Abbrechen</Button>
                <Button type="submit" disabled={!form.firma || saving} className="bg-red-600 hover:bg-red-700 text-white">{saving ? "Speichern..." : editingId ? "Aktualisieren" : "Erstellen"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Liste */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Card key={i} className="animate-pulse bg-white"><CardContent className="p-4"><div className="h-5 bg-gray-200 rounded w-1/3" /></CardContent></Card>)}</div>
      ) : filtered.length === 0 ? (
        <Card className="bg-white border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><TrendingUp className="h-7 w-7 text-gray-400" /></div>
            <h3 className="font-semibold text-lg">Keine Kontakte</h3>
            <p className="text-sm text-muted-foreground mt-1">Erstelle deinen ersten Kontakt.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const statusConf = STATUS_OPTIONS.find((s) => s.value === c.status)!;
            const prioConf = PRIORITY_OPTIONS.find((p) => p.value === c.prioritaet)!;
            return (
              <Card key={c.id} className="bg-white hover:shadow-md transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono text-muted-foreground bg-gray-100 px-1.5 py-0.5 rounded">#{c.nr}</span>
                        <h3 className="font-semibold">{c.firma}</h3>
                        {(() => {
                          const k = KATEGORIE_OPTIONS.find((o) => o.value === c.kategorie);
                          if (!k) return null;
                          const Icon = k.icon;
                          return <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border ${k.color}`}><Icon className="h-2.5 w-2.5" />{k.value === "verwaltung" ? "Verwaltung" : "Event"}</span>;
                        })()}
                        {c.branche && <span className="text-xs text-muted-foreground">· {c.branche}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                        {c.ansprechperson && <span>{c.ansprechperson}{c.position ? ` · ${c.position}` : ""}</span>}
                        {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-blue-600"><Mail className="h-3 w-3" />{c.email}</a>}
                        {c.telefon && <a href={`tel:${c.telefon}`} className="flex items-center gap-1 hover:text-blue-600"><Phone className="h-3 w-3" />{c.telefon}</a>}
                      </div>
                      {c.event_typ && <p className="text-xs text-muted-foreground mt-1">{c.event_typ}</p>}
                      {c.datum_kontakt && <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1"><Calendar className="h-3 w-3" />Letzter Kontakt: {new Date(c.datum_kontakt).toLocaleDateString("de-CH")}</p>}
                      {(() => {
                        if (!c.notizen) return null;
                        let freieNotiz = c.notizen;
                        let details: any = {};
                        try {
                          const parsed = JSON.parse(c.notizen);
                          if (parsed && typeof parsed === "object" && (parsed._text !== undefined || parsed._details)) {
                            freieNotiz = parsed._text || "";
                            details = parsed._details || {};
                          }
                        } catch {}
                        const hasDetails = Object.keys(details).length > 0;
                        return (
                          <div className="mt-2 space-y-1.5">
                            {hasDetails && (
                              <div className="bg-gray-50 p-2.5 rounded-lg space-y-1 text-xs">
                                {details.infrastruktur && <div><span className="font-semibold text-gray-700">Infrastruktur:</span> {details.infrastruktur}</div>}
                                {details.ort && <div><span className="font-semibold text-gray-700">Ort:</span> {details.ort}</div>}
                                {details.zielgruppe && <div><span className="font-semibold text-gray-700">Zielgruppe:</span> {details.zielgruppe}</div>}
                                {details.programm && <div><span className="font-semibold text-gray-700">Programm:</span> {details.programm}</div>}
                                {details.bedarf_vor_ort && <div><span className="font-semibold text-gray-700">Bedarf vor Ort:</span> {details.bedarf_vor_ort}</div>}
                                {details.bedarf && Object.entries(details.bedarf).map(([k, v]: any) => {
                                  const label = BEDARF_BEREICHE.find((b) => b.key === k)?.label || k;
                                  return <div key={k}><span className="font-semibold text-gray-700">{label}:</span> {v}</div>;
                                })}
                              </div>
                            )}
                            {freieNotiz && <p className="text-xs text-muted-foreground bg-gray-50 p-2 rounded-lg whitespace-pre-wrap">{freieNotiz}</p>}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <select value={c.status} onChange={(e) => updateStatus(c.id, e.target.value as VertriebStatus)} className={`text-xs font-medium px-2 py-1 rounded-lg border cursor-pointer ${statusConf.color}`}>
                          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        <select value={c.prioritaet} onChange={(e) => updatePriority(c.id, e.target.value as VertriebPriority)} className={`text-xs font-medium px-2 py-1 rounded-lg border cursor-pointer ${prioConf.color}`}>
                          {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-500"><Edit2 className="h-4 w-4" /></button>
                        <button onClick={() => deleteContact(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
