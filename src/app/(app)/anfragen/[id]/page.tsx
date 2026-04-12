"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RENTAL_STATUS } from "@/lib/constants";
import type { RentalRequest, RentalStatus, Profile } from "@/types";
import {
  ArrowLeft, Calendar, MapPin, Users, Send, Check, X,
  FileText, Upload, Trash2, Download, CheckCircle, Circle,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

const STEPS = [
  { key: "anfrage", label: "Anfrage", desc: "Anfrage prüfen" },
  { key: "angebot", label: "Angebot", desc: "Konditionen senden" },
  { key: "bestaetigung", label: "Bestätigung", desc: "Kunde bestätigt" },
  { key: "vertrag", label: "Vertrag", desc: "Mietvertrag senden" },
  { key: "termine", label: "Termine", desc: "Übergabe planen" },
];

function getStep(status: string) {
  if (status === "neu") return 0;
  if (status === "in_bearbeitung") return 1;
  if (status === "bestaetigt") return 3;
  if (status === "abgelehnt") return -1;
  return 0;
}

export default function VermietungDetailPage() {
  const { id } = useParams();
  const supabase = createClient();
  const [request, setRequest] = useState<any>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  // Angebot
  const [showOffer, setShowOffer] = useState(false);
  const [offerEmail, setOfferEmail] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [sendingOffer, setSendingOffer] = useState(false);
  const [docs, setDocs] = useState<{ name: string; path: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Vertrag
  const [showContract, setShowContract] = useState(false);
  const [contractEmail, setContractEmail] = useState("");
  const [contractMessage, setContractMessage] = useState("");
  const [sendingContract, setSendingContract] = useState(false);
  const [contractDocs, setContractDocs] = useState<{ name: string; path: string }[]>([]);
  const [uploadingContract, setUploadingContract] = useState(false);
  const contractFileRef = useRef<HTMLInputElement>(null);

  // Termin
  const [showTermin, setShowTermin] = useState(false);
  const [terminForm, setTerminForm] = useState({ title: "", date: "", time: "08:00", end_time: "17:00", assigned_to: "" });

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    const { data } = await supabase
      .from("rental_requests")
      .select("*, customer:customers(name, email), location:locations(name, id)")
      .eq("id", id).single();
    if (data) {
      setRequest(data);
      setOfferEmail(data.customer?.email || "");
      setContractEmail(data.customer?.email || "");
      if (data.details) {
        try {
          const parsed = JSON.parse(data.details);
          if (parsed._docs) setDocs(parsed._docs);
          if (parsed._contractDocs) setContractDocs(parsed._contractDocs);
        } catch {}
      }
    }
    const { data: profs } = await supabase.from("profiles").select("*").eq("is_active", true).order("full_name");
    if (profs) setProfiles(profs as Profile[]);
  }

  async function updateStatus(status: RentalStatus) {
    await supabase.from("rental_requests").update({ status }).eq("id", id);
    toast.success(`Status auf "${RENTAL_STATUS[status].label}" geändert`);
    loadData();
  }

  async function uploadViaApi(file: File, filePath: string) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", filePath);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!json.success) { toast.error("Upload-Fehler: " + (json.error || "Unbekannt")); return false; }
      return true;
    } catch (e: any) { toast.error("Upload-Fehler: " + (e.message || "Netzwerkfehler")); return false; }
  }

  async function saveDetails(newDocs: any[], newContractDocs: any[]) {
    let details: any = {};
    try { details = JSON.parse(request.details || "{}"); } catch { details = { _text: request.details }; }
    details._docs = newDocs;
    details._contractDocs = newContractDocs;
    await fetch("/api/rentals/update-details", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, details: JSON.stringify(details) }) });
  }

  async function uploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    const path = `vermietungen/${id}/${Date.now()}_${file.name}`;
    const ok = await uploadViaApi(file, path);
    if (!ok) { setUploading(false); e.target.value = ""; return; }
    const newDocs = [...docs, { name: file.name, path }];
    await saveDetails(newDocs, contractDocs);
    setDocs(newDocs);
    toast.success("Dokument hochgeladen");
    setUploading(false); e.target.value = "";
  }

  async function deleteDoc(doc: { name: string; path: string }) {
    await supabase.storage.from("documents").remove([doc.path]);
    const newDocs = docs.filter((d) => d.path !== doc.path);
    await saveDetails(newDocs, contractDocs);
    setDocs(newDocs); toast.success("Dokument gelöscht");
  }

  async function uploadContractDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingContract(true);
    const path = `vermietungen/${id}/vertrag_${Date.now()}_${file.name}`;
    const ok = await uploadViaApi(file, path);
    if (!ok) { setUploadingContract(false); e.target.value = ""; return; }
    const newDocs = [...contractDocs, { name: file.name, path }];
    await saveDetails(docs, newDocs);
    setContractDocs(newDocs);
    toast.success("Mietvertrag hochgeladen");
    setUploadingContract(false); e.target.value = "";
  }

  async function deleteContractDoc(doc: { name: string; path: string }) {
    await supabase.storage.from("documents").remove([doc.path]);
    const newDocs = contractDocs.filter((d) => d.path !== doc.path);
    await saveDetails(docs, newDocs);
    setContractDocs(newDocs); toast.success("Dokument gelöscht");
  }

  function openFile(path: string) {
    const { data } = supabase.storage.from("documents").getPublicUrl(path);
    window.open(data.publicUrl, "_blank");
  }

  async function sendOffer() {
    setSendingOffer(true);
    const pdfUrls = docs.map((d) => { const { data } = supabase.storage.from("documents").getPublicUrl(d.path); return { name: d.name, url: data.publicUrl }; });
    try {
      const res = await fetch("/api/rentals/send-offer", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rentalId: id, email: offerEmail, message: offerMessage, customerName: request.customer?.name, locationName: request.location?.name, eventDate: request.event_date, eventEndDate: request.event_end_date, pdfUrls }) });
      const json = await res.json();
      if (json.success) { toast.success("Angebot gesendet"); setShowOffer(false); updateStatus("in_bearbeitung"); }
      else toast.error("Fehler: " + (json.error || "Unbekannt"));
    } catch { toast.error("Fehler beim Senden"); }
    setSendingOffer(false);
  }

  async function sendContract() {
    if (contractDocs.length === 0) { toast.error("Bitte zuerst Mietvertrag hochladen"); return; }
    setSendingContract(true);
    const pdfUrls = contractDocs.map((d) => { const { data } = supabase.storage.from("documents").getPublicUrl(d.path); return { name: d.name, url: data.publicUrl }; });
    try {
      const res = await fetch("/api/rentals/send-contract", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: contractEmail, message: contractMessage, customerName: request.customer?.name, locationName: request.location?.name, eventDate: request.event_date, eventEndDate: request.event_end_date, pdfUrls }) });
      const json = await res.json();
      if (json.success) { toast.success("Mietvertrag gesendet"); setShowContract(false); }
      else toast.error("Fehler: " + (json.error || "Unbekannt"));
    } catch { toast.error("Fehler beim Senden"); }
    setSendingContract(false);
  }

  async function createTermin(e: React.FormEvent) {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    const tzOffset = -new Date().getTimezoneOffset();
    const tz = `${tzOffset >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, "0")}:${String(Math.abs(tzOffset) % 60).padStart(2, "0")}`;
    await supabase.from("job_appointments").insert({ title: terminForm.title, start_time: `${terminForm.date}T${terminForm.time}:00${tz}`, end_time: `${terminForm.date}T${terminForm.end_time}:00${tz}`, assigned_to: terminForm.assigned_to || user?.id, job_id: null });
    if (terminForm.assigned_to && terminForm.assigned_to !== user?.id) {
      const { data: creator } = await supabase.from("profiles").select("full_name").eq("id", user?.id).single();
      await fetch("/api/appointments/assign-notify", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedTo: terminForm.assigned_to, title: terminForm.title, date: terminForm.date, time: terminForm.time, endTime: terminForm.end_time, jobTitle: `Vermietung: ${request.customer?.name}`, creatorName: creator?.full_name || "Unbekannt" }) });
    }
    setTerminForm({ title: "", date: "", time: "08:00", end_time: "17:00", assigned_to: "" });
    setShowTermin(false); toast.success("Termin erstellt");
  }

  if (!request) return <div className="py-20 text-center text-muted-foreground">Laden...</div>;

  const currentStep = getStep(request.status);
  let services = "";
  try { const parsed = JSON.parse(request.notes); services = parsed.services || ""; } catch {}

  // Modal component
  const Modal = ({ show, onClose, title, children }: { show: boolean; onClose: () => void; title: string; children: React.ReactNode }) => !show ? null : (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">{title}</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="h-4 w-4 text-gray-500" /></button>
          </div>
          <div className="p-6 space-y-4">{children}</div>
        </div>
      </div>
    </>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/anfragen"><button className="p-2 rounded-lg hover:bg-white transition-colors"><ArrowLeft className="h-5 w-5" /></button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{request.customer?.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{request.location?.name || "Keine Location"}</p>
        </div>
      </div>

      {/* Prozess-Stepper */}
      {request.status !== "abgelehnt" && (
        <div className="flex items-center gap-1">
          {STEPS.map((step, i) => {
            const done = i < currentStep;
            const active = i === currentStep;
            return (
              <div key={step.key} className="flex items-center flex-1">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg w-full ${done ? "bg-green-50" : active ? "bg-blue-50 border border-blue-200" : "bg-gray-50"}`}>
                  <div className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${done ? "bg-green-500 text-white" : active ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                    {done ? <Check className="h-3.5 w-3.5" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
                  </div>
                  <div className="min-w-0 hidden sm:block">
                    <p className={`text-[11px] font-semibold ${done ? "text-green-700" : active ? "text-blue-700" : "text-gray-400"}`}>{step.label}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Abgelehnt Banner */}
      {request.status === "abgelehnt" && (
        <div className="flex items-center gap-4 p-5 rounded-xl bg-red-50 border-2 border-red-200">
          <X className="h-8 w-8 text-red-600 shrink-0" />
          <div><p className="font-bold text-red-800 text-lg">Abgelehnt</p></div>
        </div>
      )}

      {/* Event Details */}
      <Card className="bg-white">
        <CardContent className="p-5">
          <div className="flex flex-wrap gap-4 text-sm">
            {request.event_date && <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" />{new Date(request.event_date).toLocaleDateString("de-CH")}{request.event_end_date ? ` – ${new Date(request.event_end_date).toLocaleDateString("de-CH")}` : ""}</div>}
            {request.guest_count && <div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" />{request.guest_count} Personen</div>}
            {request.event_type && <div className="flex items-center gap-2">{request.event_type}</div>}
          </div>
          {services && <p className="text-sm mt-2"><strong>Dienstleistungen:</strong> {services}</p>}
        </CardContent>
      </Card>

      {/* SCHRITT 1: Anfrage — Angebot senden */}
      {(request.status === "neu" || request.status === "in_bearbeitung") && (
        <Card className="bg-white border-blue-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-blue-600 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold">1</span>
              Angebot & Konditionen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Dokumente hochladen */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Mietkonditionen als PDF hochladen</p>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload className="h-4 w-4 mr-1" />{uploading ? "..." : "PDF"}
              </Button>
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={uploadDoc} className="hidden" />
            </div>
            {docs.map((d) => (
              <div key={d.path} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100">
                <button onClick={() => openFile(d.path)} className="flex items-center gap-2 text-sm hover:text-blue-600"><FileText className="h-4 w-4 text-red-500" />{d.name}</button>
                <button onClick={() => deleteDoc(d)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={() => setShowOffer(true)} className="bg-blue-600 hover:bg-blue-700 text-white"><Send className="h-4 w-4 mr-1" />Angebot an Kunde senden</Button>
              <Button size="sm" variant="outline" onClick={() => updateStatus("abgelehnt")}><X className="h-4 w-4 mr-1" />Ablehnen</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SCHRITT 2: Warten auf Bestätigung */}
      {request.status === "in_bearbeitung" && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-5 flex items-center gap-3">
            <div className="animate-pulse w-3 h-3 rounded-full bg-amber-400" />
            <p className="text-sm font-medium text-amber-800">Warten auf Bestätigung vom Kunden...</p>
            <Button size="sm" className="ml-auto bg-green-600 hover:bg-green-700 text-white" onClick={() => updateStatus("bestaetigt")}><Check className="h-4 w-4 mr-1" />Manuell bestätigen</Button>
          </CardContent>
        </Card>
      )}

      {/* SCHRITT 3: Bestätigt — Mietvertrag senden */}
      {request.status === "bestaetigt" && (
        <>
          <div className="flex items-center gap-4 p-5 rounded-xl bg-green-50 border-2 border-green-200">
            <CheckCircle className="h-8 w-8 text-green-600 shrink-0" />
            <div>
              <p className="font-bold text-green-800">Kunde hat bestätigt</p>
              <p className="text-sm text-green-700 mt-0.5">Jetzt Mietvertrag senden und Termine planen.</p>
            </div>
          </div>

          <Card className="bg-white border-blue-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-blue-600 flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold">2</span>
                Mietvertrag
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Mietvertrag als PDF hochladen</p>
                <Button size="sm" variant="outline" onClick={() => contractFileRef.current?.click()} disabled={uploadingContract}>
                  <Upload className="h-4 w-4 mr-1" />{uploadingContract ? "..." : "PDF"}
                </Button>
                <input ref={contractFileRef} type="file" accept=".pdf,.doc,.docx" onChange={uploadContractDoc} className="hidden" />
              </div>
              {contractDocs.map((d) => (
                <div key={d.path} className="flex items-center justify-between p-2 rounded-lg bg-blue-50 border border-blue-100">
                  <button onClick={() => openFile(d.path)} className="flex items-center gap-2 text-sm hover:text-blue-700"><FileText className="h-4 w-4 text-blue-500" />{d.name}</button>
                  <button onClick={() => deleteContractDoc(d)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {contractDocs.length > 0 && (
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setShowContract(true)}>
                  <Send className="h-4 w-4 mr-1" />Vertrag an Kunde senden
                </Button>
              )}
            </CardContent>
          </Card>

          {/* SCHRITT 4: Termine erstellen */}
          <Card className="bg-white border-green-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-green-600 flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white text-[10px] font-bold">3</span>
                Termine planen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!showTermin ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setShowTermin(true); setTerminForm({ ...terminForm, title: `Übergabe ${request.customer?.name}`, date: request.event_date?.split("T")[0] || "" }); }}>
                    <Calendar className="h-4 w-4 mr-1" />Übergabe-Termin
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowTermin(true); setTerminForm({ ...terminForm, title: `Rücknahme ${request.customer?.name}`, date: request.event_end_date?.split("T")[0] || request.event_date?.split("T")[0] || "" }); }}>
                    <Calendar className="h-4 w-4 mr-1" />Rücknahme-Termin
                  </Button>
                </div>
              ) : (
                <form onSubmit={createTermin} className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
                  <Input placeholder="Titel *" value={terminForm.title} onChange={(e) => setTerminForm({ ...terminForm, title: e.target.value })} required />
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className="text-xs font-medium">Datum *</label><Input type="date" value={terminForm.date} onChange={(e) => setTerminForm({ ...terminForm, date: e.target.value })} className="mt-1" required /></div>
                    <div><label className="text-xs font-medium">Von *</label><Input type="time" value={terminForm.time} onChange={(e) => setTerminForm({ ...terminForm, time: e.target.value })} className="mt-1" required /></div>
                    <div><label className="text-xs font-medium">Bis *</label><Input type="time" value={terminForm.end_time} onChange={(e) => setTerminForm({ ...terminForm, end_time: e.target.value })} className="mt-1" required /></div>
                  </div>
                  <select value={terminForm.assigned_to} onChange={(e) => setTerminForm({ ...terminForm, assigned_to: e.target.value })} className="w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white">
                    <option value="">Techniker zuweisen...</option>
                    {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowTermin(false)}>Abbrechen</Button>
                    <Button type="submit" size="sm" className="bg-green-600 hover:bg-green-700 text-white">Termin erstellen</Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Modals */}
      <Modal show={showOffer} onClose={() => setShowOffer(false)} title="Angebot senden">
        <div><label className="text-sm font-medium">E-Mail *</label><Input value={offerEmail} onChange={(e) => setOfferEmail(e.target.value)} className="mt-1.5" /></div>
        <div><label className="text-sm font-medium">Nachricht</label><textarea value={offerMessage} onChange={(e) => setOfferMessage(e.target.value)} placeholder="Persönliche Nachricht..." className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none" rows={3} /></div>
        {docs.length > 0 && <div className="text-xs text-muted-foreground">{docs.length} Dokument(e) angehängt</div>}
        <p className="text-xs text-muted-foreground">Kunde erhält E-Mail mit Konditionen und Bestätigungs-Link.</p>
        <div className="flex gap-3">
          <button onClick={() => setShowOffer(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">Abbrechen</button>
          <button onClick={sendOffer} disabled={!offerEmail || sendingOffer} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"><Send className="h-4 w-4" />{sendingOffer ? "Senden..." : "Senden"}</button>
        </div>
      </Modal>

      <Modal show={showContract} onClose={() => setShowContract(false)} title="Mietvertrag senden">
        <div><label className="text-sm font-medium">E-Mail *</label><Input value={contractEmail} onChange={(e) => setContractEmail(e.target.value)} className="mt-1.5" /></div>
        <div><label className="text-sm font-medium">Nachricht</label><textarea value={contractMessage} onChange={(e) => setContractMessage(e.target.value)} placeholder="z.B. Bitte unterschrieben zurücksenden..." className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none" rows={3} /></div>
        <div className="text-xs text-muted-foreground">{contractDocs.length} Vertragsdokument(e) angehängt</div>
        <div className="flex gap-3">
          <button onClick={() => setShowContract(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">Abbrechen</button>
          <button onClick={sendContract} disabled={sendingContract} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"><Send className="h-4 w-4" />{sendingContract ? "Senden..." : "Senden"}</button>
        </div>
      </Modal>
    </div>
  );
}
