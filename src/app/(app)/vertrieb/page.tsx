"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { VertriebContact, VertriebStatus, VertriebPriority, VertriebKategorie } from "@/types";
import { Plus, TrendingUp, Edit2, Trash2, X, Star, Phone, Mail, Calendar, Filter, Search, Building2, PartyPopper, ArrowRight, Check, AlertTriangle } from "lucide-react";
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

const STEPS = [
  { nr: 1, label: "Offen", action: "Kontakt aufnehmen" },
  { nr: 2, label: "Kontaktiert", action: "Weiter zu Finalisierung" },
  { nr: 3, label: "Finalisierung", action: "Weiter zu Operations" },
  { nr: 4, label: "Operations", action: "Auftrag erstellen" },
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
  // Veranstaltungsdatum
  event_start: "", event_end: "",
  // Veranstaltung: pro Bereich ein Text
  bedarf: {} as Record<string, string>,
  // Kontakt als Kunden speichern (standardmässig aktiv)
  create_customer: true,
};

const VERTRIEB_PASSWORD = "788596";

export default function VertriebPage() {
  const router = useRouter();
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
  const [categoryPicked, setCategoryPicked] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingStep, setEditingStep] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [lostTargetId, setLostTargetId] = useState<string | null>(null);
  // Schritt 2: Buchhaltungs-Benachrichtigung
  const [showBuchhaltung, setShowBuchhaltung] = useState(false);
  const [buchhaltungMessage, setBuchhaltungMessage] = useState("");
  const [sendingBuchhaltung, setSendingBuchhaltung] = useState(false);
  // Schritt 3: Finalisierung
  const [showVerbesserung, setShowVerbesserung] = useState(false);
  const [verbesserungText, setVerbesserungText] = useState("");
  const [offertePdf, setOffertePdf] = useState<{ name: string; path: string } | null>(null);
  const [uploadingOfferte, setUploadingOfferte] = useState(false);
  const [sendingVerbesserung, setSendingVerbesserung] = useState(false);
  const [sendingBestaetigung, setSendingBestaetigung] = useState(false);
  // Termin (Schritt 2)
  const [showTerminModal, setShowTerminModal] = useState(false);
  const [terminType, setTerminType] = useState<"kunde" | "telefon">("kunde");
  const [terminForm, setTerminForm] = useState({ date: new Date().toISOString().split("T")[0], time: "09:00", end_time: "10:00", note: "" });
  const [savingTermin, setSavingTermin] = useState(false);
  // Auftrag erstellen (Schritt 4)
  const [showAuftragModal, setShowAuftragModal] = useState(false);
  const [auftragForm, setAuftragForm] = useState({ title: "", priority: "normal", start_date: "", end_date: "", location_id: "" });
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [creatingAuftrag, setCreatingAuftrag] = useState(false);
  // Welche Bedarf-Bereiche aktuell aufgeklappt sind (getrennt vom Text)
  const [visibleBedarf, setVisibleBedarf] = useState<Set<string>>(new Set());
  // Kunden-Auswahl
  const [customers, setCustomers] = useState<{ id: string; name: string; email: string | null; phone: string | null }[]>([]);
  const [kundenMode, setKundenMode] = useState<"neu" | "bestehend">("neu");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
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
        <Card className="bg-card w-full max-w-sm">
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
    const [{ data }, locRes, custRes] = await Promise.all([
      supabase.from("vertrieb_contacts").select("*").order("nr"),
      supabase.from("locations").select("id, name").eq("is_active", true).order("name"),
      supabase.from("customers").select("id, name, email, phone").eq("is_active", true).order("name"),
    ]);
    if (data) setContacts(data as VertriebContact[]);
    if (locRes.data) setLocations(locRes.data);
    if (custRes.data) setCustomers(custRes.data);
    setLoading(false);
  }

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setCategoryPicked(false);
    setKundenMode("neu");
    setSelectedCustomerId("");
    setVisibleBedarf(new Set());
    setShowForm(true);
  }

  function selectExistingCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    const c = customers.find((x) => x.id === customerId);
    if (c) {
      setForm((f) => ({
        ...f,
        firma: c.name,
        email: c.email || "",
        telefon: c.phone || "",
        create_customer: false, // Kein neuer Kunde nötig
      }));
    }
  }

  function pickCategory(kategorie: VertriebKategorie) {
    setForm({ ...emptyForm, kategorie });
    setCategoryPicked(true);
  }

  function openEdit(c: VertriebContact) {
    setEditingId(c.id);
    setEditingStep(c.step || 1);
    setCategoryPicked(true);
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
      event_start: details.event_start || "",
      event_end: details.event_end || "",
      bedarf: details.bedarf || {},
      create_customer: false, // Beim Bearbeiten nicht nochmal anlegen
    });
    // Sichtbare Bedarf-Bereiche initial auf Basis vorhandener Texte
    setVisibleBedarf(new Set(Object.keys(details.bedarf || {})));
    setOffertePdf(details.offerte_pdf || null);
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    // Details als JSON in notizen speichern (_text = freie Notiz, _details = kategorienspezifisch)
    const details: any = {};
    if (form.event_start) details.event_start = form.event_start;
    if (form.event_end) details.event_end = form.event_end;
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
      const { error } = await supabase.from("vertrieb_contacts").update(payload).eq("id", editingId);
      if (error) { toast.error("Fehler: " + error.message); setSaving(false); return; }
      toast.success("Eintrag aktualisiert");
    } else {
      const { error } = await supabase.from("vertrieb_contacts").insert(payload);
      if (error) { toast.error("Fehler: " + error.message); setSaving(false); return; }
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
    setCategoryPicked(false);
    setForm(emptyForm);
    load();
    setSaving(false);
  }

  async function updateStatus(id: string, status: VertriebStatus) {
    await supabase.from("vertrieb_contacts").update({ status }).eq("id", id);
    setContacts(contacts.map((c) => c.id === id ? { ...c, status } : c));
  }

  async function advanceStep() {
    if (!editingId) return;
    const next = Math.min(editingStep + 1, 4);
    // Status-Mapping: Step 1=offen, Step 2=kontaktiert, Step 3-4=gespraech
    const newStatus: VertriebStatus =
      next === 2 ? "kontaktiert" :
      next >= 3 ? "gespraech" : "offen";
    await supabase.from("vertrieb_contacts").update({
      step: next,
      status: newStatus,
      datum_kontakt: new Date().toISOString().split("T")[0],
    }).eq("id", editingId);
    setEditingStep(next);
    setForm((f) => ({ ...f, status: newStatus, datum_kontakt: new Date().toISOString().split("T")[0] }));
    toast.success(`Schritt ${next}: ${STEPS[next - 1].label}`);
    load();
  }

  function openLostModal(id: string) {
    setLostTargetId(id);
    setLostReason("");
    setShowLostModal(true);
  }

  async function markLost() {
    if (!lostTargetId || !lostReason.trim()) { toast.error("Grund ist erforderlich"); return; }
    await supabase.from("vertrieb_contacts").update({
      status: "abgesagt",
      verloren_grund: lostReason.trim(),
    }).eq("id", lostTargetId);
    toast.success("Auftrag als verloren markiert");
    setShowLostModal(false);
    setLostTargetId(null);
    setLostReason("");
    setShowForm(false);
    setEditingId(null);
    setCategoryPicked(false);
    load();
  }

  function currentContactWithDetails() {
    if (!editingId) return null;
    const c = contacts.find((x) => x.id === editingId);
    if (!c) return null;
    let details: any = {};
    try {
      const parsed = JSON.parse(c.notizen || "{}");
      if (parsed && parsed._details) details = parsed._details;
    } catch {}
    return { ...c, details };
  }

  async function sendBuchhaltungsBenachrichtigung() {
    const c = currentContactWithDetails();
    if (!c) return;
    setSendingBuchhaltung(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user?.id).single();
    try {
      const res = await fetch("/api/vertrieb/buchhaltung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "benachrichtigung",
          contact: c,
          message: buchhaltungMessage,
          senderName: profile?.full_name || "Unbekannt",
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Buchhaltung benachrichtigt");
        setShowBuchhaltung(false);
        setBuchhaltungMessage("");
      } else {
        toast.error("Fehler: " + (json.error || "Unbekannt"));
      }
    } catch {
      toast.error("Fehler beim Senden");
    }
    setSendingBuchhaltung(false);
  }

  async function uploadOfferte(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editingId) return;
    setUploadingOfferte(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `vertrieb/${editingId}/offerte_${Date.now()}_${safeName}`;
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", path);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!json.success) { toast.error("Upload-Fehler: " + (json.error || "Unbekannt")); setUploadingOfferte(false); e.target.value = ""; return; }
      setOffertePdf({ name: file.name, path });
      // In notizen speichern
      const c = contacts.find((c) => c.id === editingId);
      if (c) {
        let obj: any = {};
        try { obj = JSON.parse(c.notizen || "{}"); } catch {}
        if (!obj._details) obj._details = {};
        obj._details.offerte_pdf = { name: file.name, path };
        await supabase.from("vertrieb_contacts").update({ notizen: JSON.stringify(obj) }).eq("id", editingId);
        load();
      }
      toast.success("Offerte hochgeladen");
    } catch { toast.error("Upload fehlgeschlagen"); }
    setUploadingOfferte(false);
    e.target.value = "";
  }

  async function sendVerbesserung() {
    const c = currentContactWithDetails();
    if (!c || !verbesserungText.trim()) { toast.error("Text ist erforderlich"); return; }
    setSendingVerbesserung(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user?.id).single();
    try {
      const res = await fetch("/api/vertrieb/buchhaltung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "verbesserung",
          contact: c,
          message: verbesserungText,
          senderName: profile?.full_name || "Unbekannt",
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Verbesserungs-Vorschlag gesendet");
        setShowVerbesserung(false);
        setVerbesserungText("");
      } else toast.error("Fehler: " + (json.error || "Unbekannt"));
    } catch { toast.error("Fehler beim Senden"); }
    setSendingVerbesserung(false);
  }

  async function sendOffertenBestaetigung() {
    const c = currentContactWithDetails();
    if (!c) return;
    setSendingBestaetigung(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user?.id).single();
    // PDF aus Storage als base64 holen
    let pdfBase64: string | null = null;
    let pdfName: string | null = null;
    const offertePath = c.details?.offerte_pdf?.path;
    if (offertePath) {
      const { data: fileData } = await supabase.storage.from("documents").download(offertePath);
      if (fileData) {
        const arrayBuffer = await fileData.arrayBuffer();
        pdfBase64 = Buffer.from(arrayBuffer).toString("base64");
        pdfName = c.details.offerte_pdf.name;
      }
    }
    try {
      const res = await fetch("/api/vertrieb/buchhaltung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "offerte_bestaetigt",
          contact: c,
          message: "Die Offerte wurde bestätigt und kann verrechnet werden.",
          senderName: profile?.full_name || "Unbekannt",
          pdfBase64,
          pdfName,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Offerten-Bestätigung gesendet");
      } else toast.error("Fehler: " + (json.error || "Unbekannt"));
    } catch { toast.error("Fehler beim Senden"); }
    setSendingBestaetigung(false);
  }

  function openTerminModal(type: "kunde" | "telefon") {
    setTerminType(type);
    setTerminForm({ date: new Date().toISOString().split("T")[0], time: type === "telefon" ? "10:00" : "14:00", end_time: type === "telefon" ? "10:30" : "15:00", note: "" });
    setShowTerminModal(true);
  }

  async function saveTermin() {
    if (!editingId) return;
    const c = contacts.find((x) => x.id === editingId);
    if (!c) return;
    setSavingTermin(true);
    const { data: { user } } = await supabase.auth.getUser();
    const tzOffset = -new Date().getTimezoneOffset();
    const tzSign = tzOffset >= 0 ? "+" : "-";
    const tzH = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, "0");
    const tzM = String(Math.abs(tzOffset) % 60).padStart(2, "0");
    const tz = `${tzSign}${tzH}:${tzM}`;
    const title = `${terminType === "telefon" ? "📞 Telefon-Termin" : "👥 Kunden-Termin"}: ${c.firma}${c.ansprechperson ? ` (${c.ansprechperson})` : ""}`;
    const description = [terminForm.note, c.telefon ? `Tel: ${c.telefon}` : "", c.email ? `E-Mail: ${c.email}` : ""].filter(Boolean).join("\n");
    const { data: newAppt } = await supabase.from("job_appointments").insert({
      job_id: null,
      title,
      description: description || null,
      start_time: `${terminForm.date}T${terminForm.time}:00${tz}`,
      end_time: `${terminForm.date}T${terminForm.end_time}:00${tz}`,
      assigned_to: user?.id || null,
    }).select("id").single();

    // Termin-ID im Lead speichern
    if (newAppt?.id) {
      let obj: any = {};
      try { obj = JSON.parse(c.notizen || "{}"); } catch {}
      if (!obj._details) obj._details = {};
      if (!obj._details.termine) obj._details.termine = [];
      obj._details.termine.push({
        id: newAppt.id,
        type: terminType,
        title,
        date: terminForm.date,
        time: terminForm.time,
        end_time: terminForm.end_time,
        note: terminForm.note || null,
      });
      await supabase.from("vertrieb_contacts").update({ notizen: JSON.stringify(obj) }).eq("id", editingId);
      await load();
    }

    toast.success(`${terminType === "telefon" ? "Telefon" : "Kunden"}-Termin im Kalender erstellt`);
    setShowTerminModal(false);
    setSavingTermin(false);
  }

  async function deleteTerminFromLead(terminId: string) {
    if (!editingId || !confirm("Termin löschen?")) return;
    const c = contacts.find((x) => x.id === editingId);
    if (!c) return;
    // Aus Kalender löschen
    await supabase.from("job_appointments").delete().eq("id", terminId);
    // Aus Lead-Details entfernen
    let obj: any = {};
    try { obj = JSON.parse(c.notizen || "{}"); } catch {}
    if (obj._details?.termine) {
      obj._details.termine = obj._details.termine.filter((t: any) => t.id !== terminId);
      await supabase.from("vertrieb_contacts").update({ notizen: JSON.stringify(obj) }).eq("id", editingId);
      await load();
    }
    toast.success("Termin gelöscht");
  }

  function openAuftragModal() {
    const c = currentContactWithDetails();
    if (!c) return;
    setAuftragForm({
      title: c.event_typ || c.firma,
      priority: "normal",
      start_date: c.details?.event_start || c.datum_kontakt || new Date().toISOString().split("T")[0],
      end_date: c.details?.event_end || "",
      location_id: "",
    });
    setShowAuftragModal(true);
  }

  async function createAuftrag() {
    const c = currentContactWithDetails();
    if (!c) return;
    setCreatingAuftrag(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user?.id).single();

    // Kunde finden oder erstellen
    let customerId: string | null = null;
    const { data: existingCust } = await supabase.from("customers").select("id").eq("name", c.firma).maybeSingle();
    if (existingCust) {
      customerId = existingCust.id;
    } else {
      const { data: newCust } = await supabase.from("customers").insert({
        name: c.firma,
        type: "company",
        email: c.email || null,
        phone: c.telefon || null,
        notes: c.ansprechperson ? `Ansprechperson: ${c.ansprechperson}${c.position ? ` (${c.position})` : ""}` : null,
      }).select("id").single();
      customerId = newCust?.id || null;
    }

    if (!customerId) { toast.error("Kunde konnte nicht erstellt werden"); setCreatingAuftrag(false); return; }

    // Auftrag erstellen
    const details = c.details || {};
    const descriptionParts: string[] = [];
    if (details.infrastruktur) descriptionParts.push(`Infrastruktur: ${details.infrastruktur}`);
    if (details.zielgruppe) descriptionParts.push(`Zielgruppe: ${details.zielgruppe}`);
    if (details.programm) descriptionParts.push(`Programm: ${details.programm}`);
    if (details.bedarf_vor_ort) descriptionParts.push(`Bedarf vor Ort: ${details.bedarf_vor_ort}`);
    if (details.bedarf) {
      const BEDARF_LABELS: Record<string, string> = { verwaltungsaufwand: "Verwaltungsaufwand", material: "Material", arbeiten: "Arbeiten", stunden: "Stunden", catering: "Catering", transport: "Transport", raum: "Raum" };
      Object.entries(details.bedarf).forEach(([k, v]: any) => { descriptionParts.push(`${BEDARF_LABELS[k] || k}: ${v}`); });
    }

    const { data: newJob, error } = await supabase.from("jobs").insert({
      title: auftragForm.title,
      description: descriptionParts.join("\n\n") || null,
      status: "offen",
      priority: auftragForm.priority,
      customer_id: customerId,
      location_id: auftragForm.location_id || details.location_id || null,
      start_date: auftragForm.start_date || null,
      end_date: auftragForm.end_date || auftragForm.start_date || null,
      created_by: user?.id,
    }).select("id, job_number, title").single();

    if (error || !newJob) { toast.error("Auftrag-Fehler: " + (error?.message || "Unbekannt")); setCreatingAuftrag(false); return; }

    // Auftrag-ID im Vertrieb-Eintrag speichern + Status auf gewonnen
    let obj: any = {};
    try { obj = JSON.parse(c.notizen || "{}"); } catch {}
    if (!obj._details) obj._details = {};
    obj._details.job_id = newJob.id;
    obj._details.job_number = newJob.job_number;
    await supabase.from("vertrieb_contacts").update({
      notizen: JSON.stringify(obj),
      status: "gewonnen",
    }).eq("id", editingId);

    // E-Mail an Leo
    let emailOk = false;
    try {
      const res = await fetch("/api/vertrieb/neuer-auftrag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobNumber: newJob.job_number,
          jobId: newJob.id,
          title: newJob.title,
          firma: c.firma,
          ansprechperson: c.ansprechperson,
          email: c.email,
          telefon: c.telefon,
          startDate: auftragForm.start_date,
          endDate: auftragForm.end_date,
          creatorName: profile?.full_name || "Unbekannt",
        }),
      });
      const json = await res.json();
      emailOk = json.success;
      if (!emailOk) console.error("Email-Fehler:", json.error);
    } catch (e) { console.error("Fetch-Fehler:", e); }

    if (emailOk) {
      toast.success(`Auftrag INT-${newJob.job_number} erstellt — Leo benachrichtigt`);
    } else {
      toast.error(`Auftrag INT-${newJob.job_number} erstellt — E-Mail an Leo fehlgeschlagen`);
    }
    setShowAuftragModal(false);
    setCreatingAuftrag(false);
    // Zu Auftrag navigieren für Schichtplanung
    setTimeout(() => router.push(`/auftraege/${newJob.id}`), 600);
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
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-red-300 dark:border-red-500/40 bg-card text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
          Lead
        </button>
      </div>

      {/* Kreis-Diagramm */}
      {contacts.length > 0 && (() => {
        const segments = [
          { label: "Schritt 1: Offen", count: contacts.filter((c) => (c.step || 1) === 1 && c.status !== "gewonnen" && c.status !== "abgesagt").length, color: "var(--status-gray)" },
          { label: "Schritt 2: Kontaktiert", count: contacts.filter((c) => (c.step || 1) === 2 && c.status !== "gewonnen" && c.status !== "abgesagt").length, color: "var(--status-blue)" },
          { label: "Schritt 3: Finalisierung", count: contacts.filter((c) => (c.step || 1) === 3 && c.status !== "gewonnen" && c.status !== "abgesagt").length, color: "var(--status-orange)" },
          { label: "Schritt 4: Operations", count: contacts.filter((c) => (c.step || 1) === 4 && c.status !== "gewonnen" && c.status !== "abgesagt").length, color: "var(--status-emerald)" },
          { label: "Gewonnen", count: contacts.filter((c) => c.status === "gewonnen").length, color: "var(--status-green)" },
          { label: "Verloren", count: contacts.filter((c) => c.status === "abgesagt").length, color: "var(--status-red)" },
        ].filter((s) => s.count > 0);

        const total = segments.reduce((sum, s) => sum + s.count, 0);
        const radius = 72;
        const ringWidth = 18;
        const outerR = radius + ringWidth / 2;
        const innerR = radius - ringWidth / 2;
        const ringDiff = outerR - innerR;
        const outlineWidth = 2;
        const svgPad = Math.ceil(outlineWidth / 2) + 1;
        const cx = outerR + svgPad;
        const cy = outerR + svgPad;
        const svgSize = outerR * 2 + svgPad * 2;
        const gapAngle = segments.length > 1 ? 0.08 : 0;
        let cumulativeGapMid = -Math.PI / 2;

        return (
          <Card className="bg-card">
            <CardContent className="p-5">
              <div className="flex flex-col md:flex-row items-start gap-6">
                {/* Donut Chart */}
                <div className="relative shrink-0">
                  <svg width={svgSize} height={svgSize}>
                    <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="currentColor" strokeWidth={1} className="text-foreground/[0.08]" />
                    <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="currentColor" strokeWidth={1} className="text-foreground/[0.08]" />
                    {segments.length === 1 ? (
                      <>
                        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke={segments[0].color} strokeWidth={outlineWidth} />
                        <circle cx={cx} cy={cy} r={innerR} fill="none" stroke={segments[0].color} strokeWidth={outlineWidth} />
                      </>
                    ) : (
                      segments.map((s, i) => {
                        const portion = s.count / total;
                        const segAngle = portion * 2 * Math.PI - gapAngle;
                        const gapMidPrev = cumulativeGapMid;
                        const startA = gapMidPrev + gapAngle / 2;
                        const endA = startA + segAngle;
                        const gapMidNext = endA + gapAngle / 2;
                        cumulativeGapMid = gapMidNext;
                        const ox1 = cx + outerR * Math.cos(startA);
                        const oy1 = cy + outerR * Math.sin(startA);
                        const ox2 = cx + outerR * Math.cos(endA);
                        const oy2 = cy + outerR * Math.sin(endA);
                        const ix1u = ox1 - ringDiff * Math.cos(gapMidPrev);
                        const iy1u = oy1 - ringDiff * Math.sin(gapMidPrev);
                        const innerStartAngle = Math.atan2(iy1u - cy, ix1u - cx);
                        const ix1 = cx + innerR * Math.cos(innerStartAngle);
                        const iy1 = cy + innerR * Math.sin(innerStartAngle);
                        const ix2u = ox2 - ringDiff * Math.cos(gapMidNext);
                        const iy2u = oy2 - ringDiff * Math.sin(gapMidNext);
                        const innerEndAngle = Math.atan2(iy2u - cy, ix2u - cx);
                        const ix2 = cx + innerR * Math.cos(innerEndAngle);
                        const iy2 = cy + innerR * Math.sin(innerEndAngle);
                        const largeArc = segAngle > Math.PI ? 1 : 0;
                        const d = `M ${ox1} ${oy1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
                        return (
                          <path key={i} d={d} fill={s.color} stroke={s.color} strokeWidth={outlineWidth} strokeLinejoin="round" className="donut-segment" />
                        );
                      })
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[34px] font-bold leading-none tracking-tight">{total}</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Leads</span>
                  </div>
                </div>

                {/* Legende */}
                <div className="flex-1 w-full space-y-2.5">
                  {segments.map((s) => {
                    const pct = total > 0 ? (s.count / total) * 100 : 0;
                    return (
                      <div key={s.label} className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium truncate">{s.label}</span>
                            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                              <strong className="text-foreground">{s.count}</strong> · {pct.toFixed(0)}%
                            </span>
                          </div>
                          <div className="h-[2px] rounded-full bg-foreground/[0.05] overflow-hidden mt-1.5">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: s.color }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Suche + Filter */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Firma, Person oder Branche..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-card" />
        </div>
        <select value={filterKategorie} onChange={(e) => setFilterKategorie(e.target.value as any)} className="h-9 px-3 text-sm rounded-lg border border-gray-200 bg-card">
          <option value="all">Alle Kategorien</option>
          {KATEGORIE_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="h-9 px-3 text-sm rounded-lg border border-gray-200 bg-card">
          <option value="all">Alle Status</option>
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label} ({statusCounts[s.value] || 0})</option>)}
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value as any)} className="h-9 px-3 text-sm rounded-lg border border-gray-200 bg-card">
          <option value="all">Alle Prioritäten</option>
          {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {/* Form */}
      {/* Termin-Modal (Schritt 2) */}
      {showTerminModal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setShowTerminModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold flex items-center gap-2">
                  {terminType === "telefon" ? <Phone className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
                  {terminType === "telefon" ? "Telefon-Termin" : "Kunden-Termin"}
                </h2>
                <button onClick={() => setShowTerminModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="h-4 w-4 text-gray-500" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-sm font-medium">Datum *</label>
                  <Input type="date" value={terminForm.date} onChange={(e) => setTerminForm({ ...terminForm, date: e.target.value })} className="mt-1.5 bg-gray-50" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Von *</label>
                    <Input type="time" value={terminForm.time} onChange={(e) => setTerminForm({ ...terminForm, time: e.target.value })} className="mt-1.5 bg-gray-50" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Bis *</label>
                    <Input type="time" value={terminForm.end_time} onChange={(e) => setTerminForm({ ...terminForm, end_time: e.target.value })} className="mt-1.5 bg-gray-50" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Notiz (optional)</label>
                  <textarea value={terminForm.note} onChange={(e) => setTerminForm({ ...terminForm, note: e.target.value })} placeholder="Worum geht es?" className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none" rows={2} />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowTerminModal(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">Abbrechen</button>
                  <button onClick={saveTermin} disabled={savingTermin} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                    {savingTermin ? "Speichern..." : "Termin erstellen"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Auftrag-Modal (Schritt 4) */}
      {showAuftragModal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setShowAuftragModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold flex items-center gap-2"><Check className="h-4 w-4 text-green-600" />Auftrag erstellen</h2>
                <button onClick={() => setShowAuftragModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="h-4 w-4 text-gray-500" /></button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">Der Auftrag wird mit allen Infos aus dem Lead erstellt. Leo wird per Email benachrichtigt.</p>
                <div>
                  <label className="text-sm font-medium">Titel *</label>
                  <Input value={auftragForm.title} onChange={(e) => setAuftragForm({ ...auftragForm, title: e.target.value })} className="mt-1.5 bg-gray-50" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Startdatum</label>
                    <Input type="date" value={auftragForm.start_date} onChange={(e) => setAuftragForm({ ...auftragForm, start_date: e.target.value })} className="mt-1.5 bg-gray-50" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Enddatum</label>
                    <Input type="date" value={auftragForm.end_date} onChange={(e) => setAuftragForm({ ...auftragForm, end_date: e.target.value })} className="mt-1.5 bg-gray-50" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Priorität</label>
                    <select value={auftragForm.priority} onChange={(e) => setAuftragForm({ ...auftragForm, priority: e.target.value })} className="mt-1.5 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-gray-50">
                      <option value="niedrig">Niedrig</option>
                      <option value="normal">Normal</option>
                      <option value="hoch">Hoch</option>
                      <option value="dringend">Dringend</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Location</label>
                    <select value={auftragForm.location_id} onChange={(e) => setAuftragForm({ ...auftragForm, location_id: e.target.value })} className="mt-1.5 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-gray-50">
                      <option value="">— Keine —</option>
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Nach Erstellung wirst du zur Auftrags-Seite weitergeleitet, wo du den Schichtplan machen kannst.</p>
                <div className="flex gap-3">
                  <button onClick={() => setShowAuftragModal(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">Abbrechen</button>
                  <button onClick={createAuftrag} disabled={!auftragForm.title || creatingAuftrag} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                    <Check className="h-4 w-4" />{creatingAuftrag ? "Erstellen..." : "Auftrag erstellen"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Buchhaltungs-Benachrichtigung Modal (Schritt 2) */}
      {showBuchhaltung && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setShowBuchhaltung(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold flex items-center gap-2"><Mail className="h-4 w-4 text-blue-600" />Benachrichtigung Buchhaltung</h2>
                <button onClick={() => setShowBuchhaltung(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="h-4 w-4 text-gray-500" /></button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">An <strong>buchhaltung@eventline-basel.com</strong> — alle Verrechnungs-Infos werden automatisch mitgeschickt.</p>
                <div>
                  <label className="text-sm font-medium">Zusätzliche Nachricht (optional)</label>
                  <textarea
                    value={buchhaltungMessage}
                    onChange={(e) => setBuchhaltungMessage(e.target.value)}
                    placeholder="z.B. Bitte Angebot erstellen bis..."
                    className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 dark:bg-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    rows={4}
                  />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowBuchhaltung(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">Abbrechen</button>
                  <button onClick={sendBuchhaltungsBenachrichtigung} disabled={sendingBuchhaltung} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                    <Mail className="h-4 w-4" />{sendingBuchhaltung ? "Senden..." : "Senden"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Verbesserungs-Modal (Schritt 3) */}
      {showVerbesserung && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setShowVerbesserung(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold flex items-center gap-2"><Mail className="h-4 w-4 text-orange-600" />Verbesserungs-Vorschlag</h2>
                <button onClick={() => setShowVerbesserung(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="h-4 w-4 text-gray-500" /></button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">An <strong>buchhaltung@eventline-basel.com</strong> — was soll an der Offerte verbessert werden?</p>
                <div>
                  <label className="text-sm font-medium">Verbesserungen *</label>
                  <textarea
                    value={verbesserungText}
                    onChange={(e) => setVerbesserungText(e.target.value)}
                    placeholder="z.B. Preis anpassen, Leistungen ergänzen, Datum ändern..."
                    className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 dark:bg-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    rows={5}
                    autoFocus
                  />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowVerbesserung(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">Abbrechen</button>
                  <button onClick={sendVerbesserung} disabled={!verbesserungText.trim() || sendingVerbesserung} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50">
                    <Mail className="h-4 w-4" />{sendingVerbesserung ? "Senden..." : "Senden"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Verloren-Modal */}
      {showLostModal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setShowLostModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-600" />Auftrag verloren</h2>
                <button onClick={() => setShowLostModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="h-4 w-4 text-gray-500" /></button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">Gib einen Grund an, warum der Auftrag verloren wurde.</p>
                <div>
                  <label className="text-sm font-medium">Grund *</label>
                  <textarea
                    value={lostReason}
                    onChange={(e) => setLostReason(e.target.value)}
                    placeholder="z.B. Zu teuer, Konkurrenz gewählt, kein Budget..."
                    className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 dark:bg-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20"
                    rows={3}
                    autoFocus
                  />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowLostModal(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">Abbrechen</button>
                  <button onClick={markLost} disabled={!lostReason.trim()} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                    <AlertTriangle className="h-4 w-4" />Als verloren markieren
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {showForm && !editingId && !categoryPicked && (
        <Card className="bg-card border-red-100">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Was für ein Lead?</h3>
              <button type="button" onClick={() => { setShowForm(false); setCategoryPicked(false); }} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-3">
              {KATEGORIE_OPTIONS.map((k) => {
                const Icon = k.icon;
                return (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => pickCategory(k.value)}
                    className="flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-red-400 hover:bg-red-50 transition-all text-left"
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${k.color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{k.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {k.value === "verwaltung" ? "Verwaltungen, Immobilien, WEG-Anfragen" : "Sommerfeste, Jahresanlässe, Firmenevents"}
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-gray-400" />
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {showForm && (editingId || categoryPicked) && (
        <Card className="bg-card border-red-100">
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
                <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setCategoryPicked(false); }} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
              </div>

              {/* Step-Progress nur beim Bearbeiten */}
              {editingId && form.status !== "abgesagt" && (
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
                  <div className="flex items-center gap-0">
                    {STEPS.map((s, i) => {
                      const done = editingStep > s.nr;
                      const active = editingStep === s.nr;
                      return (
                        <div key={s.nr} className="flex items-center flex-1">
                          <div className="flex flex-col items-center w-full relative">
                            {i > 0 && <div className={`absolute top-3 right-1/2 w-full h-0.5 -z-10 ${done ? "bg-green-400" : "bg-gray-300"}`} />}
                            <div className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 z-10 ${done ? "bg-green-500 text-white" : active ? "bg-blue-500 text-white ring-4 ring-blue-100" : "bg-gray-200 text-gray-400"}`}>
                              {done ? <Check className="h-4 w-4" /> : <span className="text-xs font-bold">{s.nr}</span>}
                            </div>
                            <p className={`text-[10px] font-semibold mt-1.5 text-center ${done ? "text-green-700" : active ? "text-blue-700" : "text-gray-400"}`}>{s.label}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 flex-wrap pt-2 border-t border-gray-200">
                    {/* Schritt 1: Kontakt aufnehmen */}
                    {editingStep === 1 && (
                      <Button type="button" size="sm" onClick={advanceStep} className="bg-blue-600 hover:bg-blue-700 text-white">
                        <ArrowRight className="h-4 w-4 mr-1" />Kontakt aufnehmen
                      </Button>
                    )}
                    {/* Schritt 2-3-4 haben eigene Action-Bars im spezifischen Block */}
                    {form.status !== "gewonnen" && (
                      <Button type="button" size="sm" variant="outline" onClick={() => openLostModal(editingId)} className="text-red-600 border-red-200 hover:bg-red-50">
                        <AlertTriangle className="h-4 w-4 mr-1" />Auftrag verloren
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Gewonnen-Banner */}
              {editingId && form.status === "gewonnen" && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border-2 border-green-200">
                  <Check className="h-6 w-6 text-green-600 shrink-0" />
                  <div>
                    <p className="font-bold text-green-800">Gewonnen · Auftrag erstellt</p>
                    {(() => {
                      const c = contacts.find((c) => c.id === editingId);
                      const jobNum = (() => { try { return JSON.parse(c?.notizen || "{}")._details?.job_number; } catch { return null; } })();
                      return jobNum && <p className="text-sm text-green-700 mt-0.5">INT-{jobNum}</p>;
                    })()}
                  </div>
                </div>
              )}

              {/* SCHRITT 2: Benachrichtigung Buchhaltung + Termine */}
              {editingId && editingStep === 2 && form.status !== "abgesagt" && (
                <div className="p-4 rounded-xl bg-blue-50 border-2 border-blue-200 space-y-3">
                  <p className="text-sm font-semibold text-blue-800 flex items-center gap-1.5"><Mail className="h-4 w-4" />Schritt 2: Kontaktiert</p>

                  <div className="flex gap-2 flex-wrap">
                    <Button type="button" size="sm" onClick={() => openTerminModal("telefon")} variant="outline" className="bg-card">
                      <Phone className="h-4 w-4 mr-1" />Telefon-Termin
                    </Button>
                    <Button type="button" size="sm" onClick={() => openTerminModal("kunde")} variant="outline" className="bg-card">
                      <Calendar className="h-4 w-4 mr-1" />Kunden-Termin
                    </Button>
                  </div>

                  {/* Erstellte Termine anzeigen */}
                  {(() => {
                    const c = currentContactWithDetails();
                    const termine: any[] = c?.details?.termine || [];
                    if (termine.length === 0) return null;
                    return (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Geplante Termine ({termine.length})</p>
                        {termine.map((t) => (
                          <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg bg-card border border-blue-200 text-xs">
                            <span className="text-base shrink-0">{t.type === "telefon" ? "📞" : "👥"}</span>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{t.type === "telefon" ? "Telefon-Termin" : "Kunden-Termin"}</p>
                              <p className="text-muted-foreground text-[11px]">
                                {(() => { const [y,m,d] = t.date.split("-").map(Number); return new Date(y, m-1, d, 12).toLocaleDateString("de-CH", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }); })()} · {t.time}{t.end_time ? ` – ${t.end_time}` : ""}
                              </p>
                              {t.note && <p className="text-muted-foreground text-[11px] italic mt-0.5">{t.note}</p>}
                            </div>
                            <button type="button" onClick={() => deleteTerminFromLead(t.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="pt-2 border-t border-blue-200">
                    <p className="text-xs text-blue-700 mb-2">Buchhaltung mit allen Verrechnungs-Infos benachrichtigen:</p>
                    <div className="flex gap-2 flex-wrap">
                      <Button type="button" size="sm" onClick={() => setShowBuchhaltung(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
                        <Mail className="h-4 w-4 mr-1" />Benachrichtigung senden
                      </Button>
                      <Button type="button" size="sm" onClick={advanceStep} variant="outline" className="text-blue-700 border-blue-300">
                        <ArrowRight className="h-4 w-4 mr-1" />Weiter zu Finalisierung
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* SCHRITT 3: Finalisierung */}
              {editingId && editingStep === 3 && form.status !== "abgesagt" && (
                <div className="p-4 rounded-xl bg-orange-50 border-2 border-orange-200 space-y-3">
                  <p className="text-sm font-semibold text-orange-800 flex items-center gap-1.5"><Filter className="h-4 w-4" />Schritt 3: Finalisierung</p>
                  <div>
                    <label className="text-xs font-medium">Offerte als PDF</label>
                    {offertePdf ? (
                      <div className="mt-1.5 flex items-center justify-between p-2 rounded-lg bg-card border border-orange-200">
                        <span className="text-sm truncate">{offertePdf.name}</span>
                        <button type="button" onClick={async () => {
                          await supabase.storage.from("documents").remove([offertePdf.path]);
                          const c = contacts.find((c) => c.id === editingId);
                          if (c) {
                            let obj: any = {};
                            try { obj = JSON.parse(c.notizen || "{}"); } catch {}
                            if (obj._details) delete obj._details.offerte_pdf;
                            await supabase.from("vertrieb_contacts").update({ notizen: JSON.stringify(obj) }).eq("id", editingId);
                          }
                          setOffertePdf(null);
                          load();
                          toast.success("PDF entfernt");
                        }} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <label className="mt-1.5 flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-orange-300 bg-card text-sm text-orange-700 cursor-pointer hover:border-orange-500 transition-colors">
                        <Plus className="h-4 w-4" />{uploadingOfferte ? "Hochladen..." : "Offerte PDF hochladen"}
                        <input type="file" accept=".pdf" onChange={uploadOfferte} className="hidden" disabled={uploadingOfferte} />
                      </label>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap pt-2 border-t border-orange-200">
                    <Button type="button" size="sm" onClick={() => setShowVerbesserung(true)} variant="outline" className="text-orange-700 border-orange-300 hover:bg-orange-100">
                      <Mail className="h-4 w-4 mr-1" />Verbesserungs-Nachricht
                    </Button>
                    <Button type="button" size="sm" onClick={sendOffertenBestaetigung} disabled={sendingBestaetigung} className="bg-green-600 hover:bg-green-700 text-white">
                      <Check className="h-4 w-4 mr-1" />{sendingBestaetigung ? "Senden..." : "Offerte bestätigt"}
                    </Button>
                    <Button type="button" size="sm" onClick={advanceStep} className="bg-blue-600 hover:bg-blue-700 text-white">
                      <ArrowRight className="h-4 w-4 mr-1" />Weiter zu Operations
                    </Button>
                  </div>
                </div>
              )}

              {/* SCHRITT 4: Operations — Auftrag erstellen */}
              {editingId && editingStep === 4 && form.status !== "abgesagt" && (
                <div className="p-4 rounded-xl bg-green-50 border-2 border-green-200 space-y-3">
                  <p className="text-sm font-semibold text-green-800 flex items-center gap-1.5"><Check className="h-4 w-4" />Schritt 4: Operations</p>
                  {(() => {
                    const c = currentContactWithDetails();
                    const jobNum = c?.details?.job_number;
                    const jobId = c?.details?.job_id;
                    if (jobNum && jobId) {
                      return (
                        <div className="p-3 rounded-lg bg-card border border-green-200 flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <p className="text-xs text-muted-foreground">Auftrag erstellt</p>
                            <p className="font-semibold text-sm"><span className="font-mono text-green-700">INT-{jobNum}</span></p>
                          </div>
                          <a href={`/auftraege/${jobId}`} className="text-sm text-blue-600 hover:underline font-medium">Auftrag öffnen → Schichtplan</a>
                        </div>
                      );
                    }
                    return (
                      <>
                        <p className="text-xs text-green-700">Erstelle aus diesem Lead einen Auftrag. Leo wird automatisch benachrichtigt. Danach kannst du den Schichtplan machen.</p>
                        <div className="flex gap-2 flex-wrap">
                          <Button type="button" size="sm" onClick={openAuftragModal} className="bg-green-600 hover:bg-green-700 text-white">
                            <Plus className="h-4 w-4 mr-1" />Auftrag erstellen
                          </Button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Verloren-Banner */}
              {editingId && form.status === "abgesagt" && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border-2 border-red-200">
                  <AlertTriangle className="h-6 w-6 text-red-600 shrink-0" />
                  <div>
                    <p className="font-bold text-red-800">Auftrag verloren</p>
                    {(() => {
                      const c = contacts.find((c) => c.id === editingId);
                      return c?.verloren_grund && <p className="text-sm text-red-700 mt-0.5">Grund: {c.verloren_grund}</p>;
                    })()}
                  </div>
                </div>
              )}

              {/* Kunden-Auswahl: Neu oder Bestehend */}
              {!editingId && (
                <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setKundenMode("neu"); setSelectedCustomerId(""); setForm((f) => ({ ...f, firma: "", email: "", telefon: "", create_customer: true })); }} className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${kundenMode === "neu" ? "bg-red-600 text-white border-red-600" : "bg-card text-gray-600 border-gray-200"}`}>
                      + Neuer Kunde
                    </button>
                    <button type="button" onClick={() => { setKundenMode("bestehend"); setForm((f) => ({ ...f, create_customer: false })); }} className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${kundenMode === "bestehend" ? "bg-red-600 text-white border-red-600" : "bg-card text-gray-600 border-gray-200"}`}>
                      Bestandskunde auswählen
                    </button>
                  </div>
                  {kundenMode === "bestehend" && (
                    <div>
                      <label className="text-xs font-medium">Kunde auswählen *</label>
                      <select value={selectedCustomerId} onChange={(e) => selectExistingCustomer(e.target.value)} className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-card" required>
                        <option value="">— Kunde wählen —</option>
                        {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {selectedCustomerId && (() => {
                        const c = customers.find((x) => x.id === selectedCustomerId);
                        if (!c) return null;
                        return (
                          <div className="mt-2 p-2 rounded-lg bg-card border border-gray-100 text-xs space-y-0.5">
                            <p className="font-semibold">{c.name}</p>
                            {c.email && <p className="text-muted-foreground">{c.email}</p>}
                            {c.phone && <p className="text-muted-foreground">{c.phone}</p>}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs font-medium">Firma *</label>
                  <Input value={form.firma} onChange={(e) => setForm({ ...form, firma: e.target.value })} required className="mt-1 bg-gray-50" disabled={kundenMode === "bestehend" && !!selectedCustomerId} />
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
                <div className="md:col-span-2">
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

              {/* Veranstaltungs-Datum (nur bei Veranstaltungen, nicht bei Verwaltung) */}
              {form.kategorie === "veranstaltung" && (
              <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-200 dark:bg-purple-950/30 space-y-3">
                <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider flex items-center gap-1.5"><PartyPopper className="h-3.5 w-3.5" />Veranstaltungs-Datum</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium">Anfang</label>
                    <Input type="date" value={form.event_start} onChange={(e) => setForm({ ...form, event_start: e.target.value })} className="mt-1 bg-card" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Ende</label>
                    <Input type="date" value={form.event_end} onChange={(e) => setForm({ ...form, event_end: e.target.value })} className="mt-1 bg-card" />
                  </div>
                </div>
              </div>
              )}

              {/* Kategorienspezifische Felder */}
              {form.kategorie === "verwaltung" ? (
                <div className="space-y-3 p-4 rounded-xl bg-blue-50/50 border border-blue-200 dark:bg-blue-950/30">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />Verwaltungs-Details</p>
                  <div>
                    <label className="text-xs font-medium">Gegebene Infrastruktur</label>
                    <textarea value={form.infrastruktur} onChange={(e) => setForm({ ...form, infrastruktur: e.target.value })} placeholder="Was ist vor Ort vorhanden? Saal, Technik, Parkplätze..." className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-card resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20" rows={2} />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Ort</label>
                    <Input value={form.ort} onChange={(e) => setForm({ ...form, ort: e.target.value })} placeholder="Adresse oder Bezeichnung" className="mt-1 bg-card" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Zielgruppe</label>
                    <Input value={form.zielgruppe} onChange={(e) => setForm({ ...form, zielgruppe: e.target.value })} placeholder="Wer wird erreicht?" className="mt-1 bg-card" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Programm</label>
                    <textarea value={form.programm} onChange={(e) => setForm({ ...form, programm: e.target.value })} placeholder="Geplantes Programm / Ablauf..." className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-card resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20" rows={2} />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Bedarf vor Ort</label>
                    <textarea value={form.bedarf_vor_ort} onChange={(e) => setForm({ ...form, bedarf_vor_ort: e.target.value })} placeholder="Was muss zusätzlich beschafft/organisiert werden?" className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-card resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20" rows={2} />
                  </div>
                </div>
              ) : (
                <div className="space-y-3 p-4 rounded-xl bg-purple-50/50 border border-purple-200 dark:bg-purple-950/30">
                  <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider flex items-center gap-1.5"><PartyPopper className="h-3.5 w-3.5" />Bedarf (Bereiche auswählen)</p>
                  {BEDARF_BEREICHE.map((b) => {
                    const hasText = !!form.bedarf[b.key]?.trim();
                    const isOpen = visibleBedarf.has(b.key) || hasText;
                    return (
                      <div key={b.key}>
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(visibleBedarf);
                            if (isOpen) next.delete(b.key); else next.add(b.key);
                            setVisibleBedarf(next);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isOpen ? "bg-purple-600 text-white" : hasText ? "bg-purple-100 text-purple-800 border border-purple-300" : "bg-card text-gray-700 border border-gray-200 hover:border-purple-300"}`}
                        >
                          <span className="flex items-center gap-2">
                            {b.label}
                            {hasText && !isOpen && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-200 text-purple-800">gespeichert</span>}
                          </span>
                          <span className="text-xs">{isOpen ? "−" : "+"}</span>
                        </button>
                        {isOpen && (
                          <textarea
                            value={form.bedarf[b.key] || ""}
                            onChange={(e) => setForm({ ...form, bedarf: { ...form.bedarf, [b.key]: e.target.value } })}
                            placeholder={`Details zu ${b.label}...`}
                            className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-card resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                            rows={2}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Kontakt als Kunde speichern */}
              {!editingId && form.firma && kundenMode === "neu" && (
                <label className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50 cursor-pointer hover:border-red-300">
                  <input type="checkbox" checked={form.create_customer} onChange={(e) => setForm({ ...form, create_customer: e.target.checked })} className="h-4 w-4" />
                  <span className="text-sm">Kontakt zusätzlich als Kunden anlegen ({form.firma})</span>
                </label>
              )}

              <div>
                <label className="text-xs font-medium">Notizen {form.kategorie === "verwaltung" && <span className="text-muted-foreground font-normal">— Beschreibe die Situation detailliert</span>}</label>
                <textarea
                  value={form.notizen}
                  onChange={(e) => setForm({ ...form, notizen: e.target.value })}
                  placeholder={form.kategorie === "verwaltung" ? "Wie ist die aktuelle Situation? Was sind die Herausforderungen, Hintergründe, wichtige Infos..." : "Notizen..."}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-y focus:outline-none focus:ring-2 focus:ring-red-500/20"
                  rows={form.kategorie === "verwaltung" ? 8 : 3}
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); setCategoryPicked(false); }}>Abbrechen</Button>
                <Button type="submit" disabled={!form.firma || saving} className="bg-red-600 hover:bg-red-700 text-white">{saving ? "Speichern..." : editingId ? "Änderungen speichern" : "Kontakt hinzufügen"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Liste */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Card key={i} className="animate-pulse bg-card"><CardContent className="p-4"><div className="h-5 bg-gray-200 rounded w-1/3" /></CardContent></Card>)}</div>
      ) : filtered.length === 0 ? (
        <Card className="bg-card border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><TrendingUp className="h-7 w-7 text-gray-400" /></div>
            <h3 className="font-semibold text-lg">Keine Kontakte</h3>
            <p className="text-sm text-muted-foreground mt-1">Erstelle deinen ersten Kontakt.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const statusConf = STATUS_OPTIONS.find((s) => s.value === c.status)!;
            const prioConf = PRIORITY_OPTIONS.find((p) => p.value === c.prioritaet)!;
            const katConf = KATEGORIE_OPTIONS.find((o) => o.value === c.kategorie);
            const KatIcon = katConf?.icon;
            const currentStepNr = c.step || 1;
            const stepLabel = STEPS.find((s) => s.nr === currentStepNr)?.label || "";
            const isGewonnen = c.status === "gewonnen";
            const isVerloren = c.status === "abgesagt";
            // Job-Nummer + Event-Datum ermitteln
            let jobNumber: number | null = null;
            let eventStart: string | null = null;
            let eventEnd: string | null = null;
            try {
              const parsed = JSON.parse(c.notizen || "{}");
              jobNumber = parsed._details?.job_number || null;
              eventStart = parsed._details?.event_start || null;
              eventEnd = parsed._details?.event_end || null;
            } catch {}
            return (
              <Card
                key={c.id}
                onClick={() => openEdit(c)}
                className={`cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 group relative ${
                  isGewonnen ? "bg-green-50 border-green-200" :
                  isVerloren ? "bg-red-50/60 border-red-200 opacity-70" :
                  "bg-card"
                }`}
              >
                <CardContent className="p-4">
                  {/* Top row: Number, Firma, Category */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-mono text-muted-foreground bg-gray-100 px-1.5 py-0.5 rounded">LEAD-{String(c.nr).padStart(4, "0")}</span>
                        {katConf && KatIcon && (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-md border ${katConf.color}`}>
                            <KatIcon className="h-2.5 w-2.5" />
                            {c.kategorie === "verwaltung" ? "Verwaltung" : "Event"}
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-[15px] leading-tight truncate">{c.firma}</h3>
                      {c.branche && <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.branche}</p>}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteContact(c.id); }}
                      className="p-1.5 rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      title="Löschen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Contact info */}
                  {(c.ansprechperson || c.email || c.telefon) && (
                    <div className="space-y-0.5 mb-3 pb-3 border-b border-gray-100">
                      {c.ansprechperson && (
                        <p className="text-xs text-gray-700 truncate">{c.ansprechperson}{c.position ? ` · ${c.position}` : ""}</p>
                      )}
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                        {c.email && <a onClick={(e) => e.stopPropagation()} href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-blue-600 truncate max-w-[180px]"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{c.email}</span></a>}
                        {c.telefon && <a onClick={(e) => e.stopPropagation()} href={`tel:${c.telefon}`} className="flex items-center gap-1 hover:text-blue-600"><Phone className="h-3 w-3" />{c.telefon}</a>}
                      </div>
                    </div>
                  )}

                  {/* Event-Datum */}
                  {eventStart && (
                    <div className="mb-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-50 text-purple-700 text-xs font-medium border border-purple-100">
                      <PartyPopper className="h-3.5 w-3.5 shrink-0" />
                      {new Date(eventStart).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      {eventEnd && eventEnd !== eventStart && ` – ${new Date(eventEnd).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })}`}
                    </div>
                  )}

                  {/* Step progress bar */}
                  {!isGewonnen && !isVerloren && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Schritt {currentStepNr}/4</span>
                        <span className="text-[10px] text-gray-500">{stepLabel}</span>
                      </div>
                      <div className="flex gap-1">
                        {STEPS.map((s) => (
                          <div key={s.nr} className={`flex-1 h-1.5 rounded-full ${s.nr <= currentStepNr ? "bg-blue-500" : "bg-gray-200"}`} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Won/Lost Banner */}
                  {isGewonnen && (
                    <div className="mb-3 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-green-100 text-green-800 text-xs font-medium">
                      <Check className="h-3.5 w-3.5" />
                      Gewonnen{jobNumber ? ` · INT-${jobNumber}` : ""}
                    </div>
                  )}
                  {isVerloren && (
                    <div className="mb-3 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-red-100 text-red-800 text-xs font-medium">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Verloren{c.verloren_grund ? `: ${c.verloren_grund}` : ""}
                    </div>
                  )}

                  {/* Status + Priority als Badges (nicht editierbar) */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[11px] font-medium px-2 py-1 rounded-md border ${statusConf.color}`}>{statusConf.label}</span>
                    <span className={`text-[11px] font-medium px-2 py-1 rounded-md border ${prioConf.color}`}>{prioConf.label}</span>
                    {c.datum_kontakt && (
                      <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-2.5 w-2.5" />
                        {(() => { const [y,m,d] = c.datum_kontakt!.split("-").map(Number); return new Date(y, m-1, d, 12).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" }); })()}
                      </span>
                    )}
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
