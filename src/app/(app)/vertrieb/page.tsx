"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteRow } from "@/lib/db-mutations";
import { logError } from "@/lib/log";
import { TOAST } from "@/lib/messages";
import { validateFileSize } from "@/lib/file-upload";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import type { VertriebContact, VertriebStatus, VertriebPriority, VertriebKategorie } from "@/types";
import { Plus, TrendingUp, Phone, Mail, Calendar, Search, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  KATEGORIE_OPTIONS,
  STEPS,
  BEDARF_LABELS,
  emptyForm,
  VERTRIEB_PASSWORD,
} from "./constants";
import { TerminModalBody } from "@/components/vertrieb/termin-modal-body";
import { AuftragModalBody } from "@/components/vertrieb/auftrag-modal-body";
import { BuchhaltungModalBody } from "@/components/vertrieb/buchhaltung-modal-body";
import { VerbesserungModalBody } from "@/components/vertrieb/verbesserung-modal-body";
import { LostModalBody } from "@/components/vertrieb/lost-modal-body";
import { LeadCard } from "@/components/vertrieb/lead-card";
import { LeadForm } from "@/components/vertrieb/lead-form";
import { CategoryPicker } from "@/components/vertrieb/category-picker";
import { useConfirm } from "@/components/ui/use-confirm";

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
  const { confirm, ConfirmModalElement } = useConfirm();

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("vertrieb-unlocked") === "1") {
      setUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    load();
    // Realtime statt Polling: nur reload wenn sich an den Vertrieb-Contacts
    // wirklich was aendert. Vorher: 10-Sekunden-Polling auch wenn nichts passiert.
    const channel = supabase
      .channel("vertrieb-contacts")
      .on("postgres_changes", { event: "*", schema: "public", table: "vertrieb_contacts" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              <button type="submit" disabled={!pwInput} className="kasten kasten-red w-full">Zugang</button>
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
    // Guard gegen Doppelklick: React state-Updates sind async, der Button-
    // disabled-State wird erst nach dem Re-Render wirksam. Synchroner Check
    // hier verhindert dass ein schneller zweiter Klick einen zweiten Insert ausloest.
    if (saving) return;
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
      if (error) { TOAST.supabaseError(error); setSaving(false); return; }
      toast.success("Eintrag aktualisiert");
    } else {
      const { error } = await supabase.from("vertrieb_contacts").insert(payload);
      if (error) { TOAST.supabaseError(error); setSaving(false); return; }
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
      const res = await fetch("/api/sales/accounting", {
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
    if (!validateFileSize(file)) return;
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
      const res = await fetch("/api/sales/accounting", {
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
      const res = await fetch("/api/sales/accounting", {
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
    if (!editingId) return;
    const ok = await confirm({
      title: "Termin löschen?",
      confirmLabel: "Löschen",
      variant: "red",
    });
    if (!ok) return;
    const c = contacts.find((x) => x.id === editingId);
    if (!c) return;
    // Aus Kalender löschen
    await deleteRow("job_appointments", terminId);
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
      const res = await fetch("/api/sales/new-job", {
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
      if (!emailOk) logError("vertrieb.send-email", json.error);
    } catch (e) { logError("vertrieb.send-fetch", e); }

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
    const ok = await confirm({
      title: "Lead löschen?",
      confirmLabel: "Löschen",
      variant: "red",
    });
    if (!ok) return;
    const result = await deleteRow("vertrieb_contacts", id);
    if (!result.ok) {
      toast.error("Löschen fehlgeschlagen: " + (result.error ?? "Unbekannt"));
      return;
    }
    toast.success("Eintrag gelöscht");
    load();
  }

  async function removeOfferte() {
    if (!offertePdf || !editingId) return;
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
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setCategoryPicked(false);
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
          className="kasten kasten-red"
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
      <Modal
        open={showTerminModal}
        onClose={() => setShowTerminModal(false)}
        title={terminType === "telefon" ? "Telefon-Termin" : "Kunden-Termin"}
        icon={terminType === "telefon" ? <Phone className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
        size="md"
        closable={!savingTermin}
      >
        <TerminModalBody
          terminType={terminType}
          terminForm={terminForm}
          setTerminForm={setTerminForm}
          onSave={saveTermin}
          onClose={() => setShowTerminModal(false)}
          saving={savingTermin}
        />
      </Modal>

      {/* Auftrag-Modal (Schritt 4) */}
      <Modal
        open={showAuftragModal}
        onClose={() => setShowAuftragModal(false)}
        title="Auftrag erstellen"
        icon={<Check className="h-4 w-4 text-green-600" />}
        size="lg"
        closable={!creatingAuftrag}
      >
        <AuftragModalBody
          auftragForm={auftragForm}
          setAuftragForm={setAuftragForm}
          locations={locations}
          onCreate={createAuftrag}
          onClose={() => setShowAuftragModal(false)}
          creating={creatingAuftrag}
        />
      </Modal>

      {/* Buchhaltungs-Benachrichtigung Modal (Schritt 2) */}
      <Modal
        open={showBuchhaltung}
        onClose={() => setShowBuchhaltung(false)}
        title="Benachrichtigung Buchhaltung"
        icon={<Mail className="h-4 w-4 text-blue-600" />}
        size="md"
        closable={!sendingBuchhaltung}
      >
        <BuchhaltungModalBody
          buchhaltungMessage={buchhaltungMessage}
          setBuchhaltungMessage={setBuchhaltungMessage}
          onSend={sendBuchhaltungsBenachrichtigung}
          onClose={() => setShowBuchhaltung(false)}
          sending={sendingBuchhaltung}
        />
      </Modal>

      {/* Verbesserungs-Modal (Schritt 3) */}
      <Modal
        open={showVerbesserung}
        onClose={() => setShowVerbesserung(false)}
        title="Verbesserungs-Vorschlag"
        icon={<Mail className="h-4 w-4 text-orange-600" />}
        size="md"
        closable={!sendingVerbesserung}
      >
        <VerbesserungModalBody
          verbesserungText={verbesserungText}
          setVerbesserungText={setVerbesserungText}
          onSend={sendVerbesserung}
          onClose={() => setShowVerbesserung(false)}
          sending={sendingVerbesserung}
        />
      </Modal>

      {/* Verloren-Modal */}
      <Modal
        open={showLostModal}
        onClose={() => setShowLostModal(false)}
        title="Auftrag verloren"
        icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
        size="md"
      >
        <LostModalBody
          lostReason={lostReason}
          setLostReason={setLostReason}
          onConfirm={markLost}
          onClose={() => setShowLostModal(false)}
        />
      </Modal>

      {showForm && !editingId && !categoryPicked && (
        <CategoryPicker
          onPick={pickCategory}
          onClose={() => { setShowForm(false); setCategoryPicked(false); }}
        />
      )}

      {showForm && (editingId || categoryPicked) && (
        <LeadForm
          editingId={editingId}
          editingStep={editingStep}
          form={form}
          setForm={setForm}
          saving={saving}
          offertePdf={offertePdf}
          uploadingOfferte={uploadingOfferte}
          sendingBestaetigung={sendingBestaetigung}
          visibleBedarf={visibleBedarf}
          setVisibleBedarf={setVisibleBedarf}
          kundenMode={kundenMode}
          setKundenMode={setKundenMode}
          selectedCustomerId={selectedCustomerId}
          setSelectedCustomerId={setSelectedCustomerId}
          customers={customers}
          contacts={contacts}
          onSubmit={save}
          onClose={closeForm}
          onAdvanceStep={advanceStep}
          onOpenLost={openLostModal}
          onOpenBuchhaltung={() => setShowBuchhaltung(true)}
          onOpenVerbesserung={() => setShowVerbesserung(true)}
          onOpenTermin={openTerminModal}
          onDeleteTermin={deleteTerminFromLead}
          onUploadOfferte={uploadOfferte}
          onRemoveOfferte={removeOfferte}
          onSendBestaetigung={sendOffertenBestaetigung}
          onOpenAuftrag={openAuftragModal}
          onSelectExistingCustomer={selectExistingCustomer}
          currentContactWithDetails={currentContactWithDetails}
        />
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
          {filtered.map((c) => (
            <LeadCard key={c.id} contact={c} onClick={openEdit} onDelete={deleteContact} />
          ))}
        </div>
      )}
      {ConfirmModalElement}
    </div>
  );
}
