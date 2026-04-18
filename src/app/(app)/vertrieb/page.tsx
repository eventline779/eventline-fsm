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
  // Veranstaltung: pro Bereich ein Text
  bedarf: {} as Record<string, string>,
  // Kontakt als Kunden speichern
  create_customer: false,
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
    const [{ data }, locRes] = await Promise.all([
      supabase.from("vertrieb_contacts").select("*").order("nr"),
      supabase.from("locations").select("id, name").eq("is_active", true).order("name"),
    ]);
    if (data) setContacts(data as VertriebContact[]);
    if (locRes.data) setLocations(locRes.data);
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
    setEditingStep(c.step || 1);
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
    setOffertePdf(details.offerte_pdf || null);
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
    await supabase.from("job_appointments").insert({
      job_id: null,
      title,
      description: description || null,
      start_time: `${terminForm.date}T${terminForm.time}:00${tz}`,
      end_time: `${terminForm.date}T${terminForm.end_time}:00${tz}`,
      assigned_to: user?.id || null,
    });
    toast.success(`${terminType === "telefon" ? "Telefon" : "Kunden"}-Termin im Kalender erstellt`);
    setShowTerminModal(false);
    setSavingTermin(false);
  }

  function openAuftragModal() {
    const c = currentContactWithDetails();
    if (!c) return;
    setAuftragForm({
      title: c.event_typ || c.firma,
      priority: "normal",
      start_date: c.datum_kontakt || new Date().toISOString().split("T")[0],
      end_date: "",
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
      status: "geplant",
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
    try {
      await fetch("/api/vertrieb/neuer-auftrag", {
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
    } catch {}

    toast.success(`Auftrag INT-${newJob.job_number} erstellt — Leo benachrichtigt`);
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
      {/* Termin-Modal (Schritt 2) */}
      {showTerminModal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setShowTerminModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
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
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
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
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
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
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
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
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
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
                    <Button type="button" size="sm" onClick={() => openTerminModal("telefon")} variant="outline" className="bg-white">
                      <Phone className="h-4 w-4 mr-1" />Telefon-Termin
                    </Button>
                    <Button type="button" size="sm" onClick={() => openTerminModal("kunde")} variant="outline" className="bg-white">
                      <Calendar className="h-4 w-4 mr-1" />Kunden-Termin
                    </Button>
                  </div>

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
                      <div className="mt-1.5 flex items-center justify-between p-2 rounded-lg bg-white border border-orange-200">
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
                      <label className="mt-1.5 flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-orange-300 bg-white text-sm text-orange-700 cursor-pointer hover:border-orange-500 transition-colors">
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
                        <div className="p-3 rounded-lg bg-white border border-green-200 flex items-center justify-between flex-wrap gap-2">
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
