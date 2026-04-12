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
  FileText, Upload, Trash2, Download, AlertTriangle, CheckCircle,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function VermietungDetailPage() {
  const { id } = useParams();
  const supabase = createClient();
  const [request, setRequest] = useState<any>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showOffer, setShowOffer] = useState(false);
  const [offerEmail, setOfferEmail] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [sendingOffer, setSendingOffer] = useState(false);
  const [docs, setDocs] = useState<{ name: string; path: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Mietvertrag
  const [showContract, setShowContract] = useState(false);
  const [contractEmail, setContractEmail] = useState("");
  const [contractMessage, setContractMessage] = useState("");
  const [sendingContract, setSendingContract] = useState(false);
  const [contractDocs, setContractDocs] = useState<{ name: string; path: string }[]>([]);
  const [uploadingContract, setUploadingContract] = useState(false);
  const contractFileRef = useRef<HTMLInputElement>(null);

  // Termin erstellen
  const [showTermin, setShowTermin] = useState(false);
  const [terminForm, setTerminForm] = useState({ title: "", date: "", time: "08:00", end_time: "17:00", assigned_to: "" });

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    const { data } = await supabase
      .from("rental_requests")
      .select("*, customer:customers(name, email), location:locations(name, id)")
      .eq("id", id)
      .single();
    if (data) {
      setRequest(data);
      setOfferEmail(data.customer?.email || "");
      setContractEmail(data.customer?.email || "");
      // Parse services from notes
      let services = "";
      try { const parsed = JSON.parse(data.notes); services = parsed.services || ""; } catch {}

      // Load docs
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
      if (!json.success) {
        toast.error("Upload-Fehler: " + (json.error || "Unbekannt"));
        return false;
      }
      return true;
    } catch (e: any) {
      toast.error("Upload-Fehler: " + (e.message || "Netzwerkfehler"));
      return false;
    }
  }

  async function uploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `vermietungen/${id}/${Date.now()}_${file.name}`;
    const ok = await uploadViaApi(file, path);
    if (!ok) { toast.error("Upload fehlgeschlagen"); setUploading(false); e.target.value = ""; return; }
    const newDocs = [...docs, { name: file.name, path }];
    // Save docs in details field
    let details: any = {};
    try { details = JSON.parse(request.details || "{}"); } catch { details = { _text: request.details }; }
    details._docs = newDocs;
    await fetch(`/api/rentals/update-details`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, details: JSON.stringify(details) }) });
    setDocs(newDocs);
    toast.success("Dokument hochgeladen");
    setUploading(false);
    e.target.value = "";
  }

  async function deleteDoc(doc: { name: string; path: string }) {
    await supabase.storage.from("documents").remove([doc.path]);
    const newDocs = docs.filter((d) => d.path !== doc.path);
    let details: any = {};
    try { details = JSON.parse(request.details || "{}"); } catch { details = {}; }
    details._docs = newDocs;
    await fetch(`/api/rentals/update-details`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, details: JSON.stringify(details) }) });
    setDocs(newDocs);
    toast.success("Dokument gelöscht");
  }

  function openFile(path: string) {
    const { data } = supabase.storage.from("documents").getPublicUrl(path);
    window.open(data.publicUrl, "_blank");
  }

  async function uploadContractDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingContract(true);
    const path = `vermietungen/${id}/vertrag_${Date.now()}_${file.name}`;
    const ok = await uploadViaApi(file, path);
    if (!ok) { toast.error("Upload fehlgeschlagen"); setUploadingContract(false); e.target.value = ""; return; }
    const newDocs = [...contractDocs, { name: file.name, path }];
    let details: any = {};
    try { details = JSON.parse(request.details || "{}"); } catch { details = { _text: request.details }; }
    details._contractDocs = newDocs;
    await fetch(`/api/rentals/update-details`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, details: JSON.stringify(details) }) });
    setContractDocs(newDocs);
    toast.success("Mietvertrag hochgeladen");
    setUploadingContract(false);
    e.target.value = "";
  }

  async function deleteContractDoc(doc: { name: string; path: string }) {
    await supabase.storage.from("documents").remove([doc.path]);
    const newDocs = contractDocs.filter((d) => d.path !== doc.path);
    let details: any = {};
    try { details = JSON.parse(request.details || "{}"); } catch { details = {}; }
    details._contractDocs = newDocs;
    await fetch(`/api/rentals/update-details`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, details: JSON.stringify(details) }) });
    setContractDocs(newDocs);
    toast.success("Dokument gelöscht");
  }

  async function sendContract() {
    if (contractDocs.length === 0) { toast.error("Bitte zuerst Mietvertrag hochladen"); return; }
    setSendingContract(true);
    const pdfUrls = contractDocs.map((d) => {
      const { data } = supabase.storage.from("documents").getPublicUrl(d.path);
      return { name: d.name, url: data.publicUrl };
    });

    try {
      const res = await fetch("/api/rentals/send-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: contractEmail,
          message: contractMessage,
          customerName: request.customer?.name,
          locationName: request.location?.name,
          eventDate: request.event_date,
          eventEndDate: request.event_end_date,
          pdfUrls,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Mietvertrag gesendet");
        setShowContract(false);
      } else {
        toast.error("Fehler: " + (json.error || "Unbekannt"));
      }
    } catch {
      toast.error("Fehler beim Senden");
    }
    setSendingContract(false);
  }

  async function sendOffer() {
    setSendingOffer(true);
    // Collect PDF URLs
    const pdfUrls = docs.map((d) => {
      const { data } = supabase.storage.from("documents").getPublicUrl(d.path);
      return { name: d.name, url: data.publicUrl };
    });

    try {
      const res = await fetch("/api/rentals/send-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rentalId: id,
          email: offerEmail,
          message: offerMessage,
          customerName: request.customer?.name,
          locationName: request.location?.name,
          eventDate: request.event_date,
          eventEndDate: request.event_end_date,
          pdfUrls,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Angebot gesendet");
        setShowOffer(false);
        updateStatus("in_bearbeitung");
      } else {
        toast.error("Fehler: " + (json.error || "Unbekannt"));
      }
    } catch {
      toast.error("Fehler beim Senden");
    }
    setSendingOffer(false);
  }

  async function createTermin(e: React.FormEvent) {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    const tzOffset = -new Date().getTimezoneOffset();
    const tzSign = tzOffset >= 0 ? "+" : "-";
    const tzH = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, "0");
    const tzM = String(Math.abs(tzOffset) % 60).padStart(2, "0");
    const tz = `${tzSign}${tzH}:${tzM}`;

    await supabase.from("job_appointments").insert({
      title: terminForm.title,
      start_time: `${terminForm.date}T${terminForm.time}:00${tz}`,
      end_time: `${terminForm.date}T${terminForm.end_time}:00${tz}`,
      assigned_to: terminForm.assigned_to || user?.id,
      job_id: null,
    });

    if (terminForm.assigned_to && terminForm.assigned_to !== user?.id) {
      const { data: creator } = await supabase.from("profiles").select("full_name").eq("id", user?.id).single();
      await fetch("/api/appointments/assign-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedTo: terminForm.assigned_to,
          title: terminForm.title,
          date: terminForm.date,
          time: terminForm.time,
          endTime: terminForm.end_time,
          jobTitle: `Vermietung: ${request.customer?.name}`,
          creatorName: creator?.full_name || "Unbekannt",
        }),
      });
    }

    setTerminForm({ title: "", date: "", time: "08:00", end_time: "17:00", assigned_to: "" });
    setShowTermin(false);
    toast.success("Termin erstellt");
  }

  if (!request) return <div className="py-20 text-center text-muted-foreground">Laden...</div>;

  let services = "";
  try { const parsed = JSON.parse(request.notes); services = parsed.services || ""; } catch {}
  let detailsText = request.details || "";
  try { const parsed = JSON.parse(request.details); detailsText = parsed._text || ""; } catch {}

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/anfragen"><button className="p-2 rounded-lg hover:bg-white transition-colors"><ArrowLeft className="h-5 w-5" /></button></Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{request.customer?.name}</h1>
            <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${RENTAL_STATUS[request.status as RentalStatus].color}`}>
              {RENTAL_STATUS[request.status as RentalStatus].label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{request.location?.name || "Keine Location"}</p>
        </div>
      </div>

      {/* Bestätigt Banner */}
      {request.status === "bestaetigt" && (
        <div className="flex items-center gap-4 p-5 rounded-xl bg-green-50 border-2 border-green-200">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-green-100 shrink-0">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <p className="font-bold text-green-800 text-lg">Kunde hat bestätigt</p>
            <p className="text-sm text-green-700 mt-0.5">Die Vermietung wurde vom Kunden verbindlich bestätigt. Bitte Übergabe- und Rücknahme-Termine erstellen.</p>
          </div>
        </div>
      )}

      {/* Abgelehnt Banner */}
      {request.status === "abgelehnt" && (
        <div className="flex items-center gap-4 p-5 rounded-xl bg-red-50 border-2 border-red-200">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-red-100 shrink-0">
            <X className="h-6 w-6 text-red-600" />
          </div>
          <div>
            <p className="font-bold text-red-800 text-lg">Abgelehnt</p>
            <p className="text-sm text-red-700 mt-0.5">Diese Vermietung wurde abgelehnt.</p>
          </div>
        </div>
      )}

      {/* Mietvertrag - nach Bestätigung */}
      {request.status === "bestaetigt" && (
        <Card className="bg-white border-blue-100">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-blue-600 flex items-center gap-2"><FileText className="h-4 w-4" />Mietvertrag</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => contractFileRef.current?.click()} disabled={uploadingContract}>
                <Upload className="h-4 w-4 mr-1" />{uploadingContract ? "Hochladen..." : "PDF hochladen"}
              </Button>
              {contractDocs.length > 0 && (
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setShowContract(true)}>
                  <Send className="h-4 w-4 mr-1" />Vertrag senden
                </Button>
              )}
            </div>
            <input ref={contractFileRef} type="file" accept=".pdf,.doc,.docx" onChange={uploadContractDoc} className="hidden" />
          </CardHeader>
          <CardContent className="space-y-2">
            {contractDocs.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Mietvertrag als PDF hochladen, dann an den Kunden senden.</p>}
            {contractDocs.map((d) => (
              <div key={d.path} className="flex items-center justify-between p-3 rounded-xl bg-blue-50 border border-blue-100">
                <button onClick={() => openFile(d.path)} className="flex items-center gap-3 min-w-0 flex-1 text-left hover:text-blue-700 transition-colors">
                  <FileText className="h-5 w-5 text-blue-500 shrink-0" />
                  <span className="font-medium text-sm truncate">{d.name}</span>
                </button>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <button onClick={() => openFile(d.path)} className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-400 hover:text-blue-600"><Download className="h-4 w-4" /></button>
                  <button onClick={() => deleteContractDoc(d)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Vertrag senden Modal */}
      {showContract && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setShowContract(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold text-gray-900 dark:text-white">Mietvertrag senden</h2>
                <button onClick={() => setShowContract(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="h-4 w-4 text-gray-500" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-sm font-medium">E-Mail *</label>
                  <Input value={contractEmail} onChange={(e) => setContractEmail(e.target.value)} className="mt-1.5" required />
                </div>
                <div>
                  <label className="text-sm font-medium">Nachricht (optional)</label>
                  <textarea value={contractMessage} onChange={(e) => setContractMessage(e.target.value)} placeholder="z.B. Bitte den Vertrag unterschrieben zurücksenden..." className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none" rows={3} />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Angehängte Verträge:</p>
                  {contractDocs.map((d) => (
                    <p key={d.path} className="text-xs text-blue-600 flex items-center gap-1"><FileText className="h-3 w-3" />{d.name}</p>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowContract(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">Abbrechen</button>
                  <button onClick={sendContract} disabled={sendingContract} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                    <Send className="h-4 w-4" />{sendingContract ? "Senden..." : "Vertrag senden"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Details */}
      <Card className="bg-white">
        <CardContent className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            {request.event_date && (
              <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><span><strong>Datum:</strong> {new Date(request.event_date).toLocaleDateString("de-CH")}{request.event_end_date ? ` – ${new Date(request.event_end_date).toLocaleDateString("de-CH")}` : ""}</span></div>
            )}
            {request.guest_count && (
              <div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /><span><strong>Personen:</strong> {request.guest_count}</span></div>
            )}
          </div>
          {request.event_type && <p className="text-sm"><strong>Typ:</strong> {request.event_type}</p>}
          {services && <p className="text-sm"><strong>Dienstleistungen:</strong> {services}</p>}
          {detailsText && <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-sm">{detailsText}</div>}

          {/* Status Buttons */}
          <div className="flex flex-wrap gap-2 pt-2">
            {request.status === "neu" && (
              <>
                <Button size="sm" onClick={() => setShowOffer(true)} className="bg-blue-600 hover:bg-blue-700 text-white"><Send className="h-4 w-4 mr-1" />Angebot senden</Button>
                <Button size="sm" variant="outline" onClick={() => updateStatus("abgelehnt")}><X className="h-4 w-4 mr-1" />Ablehnen</Button>
              </>
            )}
            {request.status === "in_bearbeitung" && (
              <>
                <Button size="sm" onClick={() => setShowOffer(true)} className="bg-blue-600 hover:bg-blue-700 text-white"><Send className="h-4 w-4 mr-1" />Angebot erneut senden</Button>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => updateStatus("bestaetigt")}><Check className="h-4 w-4 mr-1" />Bestätigen</Button>
                <Button size="sm" variant="outline" onClick={() => updateStatus("abgelehnt")}><X className="h-4 w-4 mr-1" />Ablehnen</Button>
              </>
            )}
            {request.status === "bestaetigt" && (
              <div className="flex items-center gap-2 text-green-700 text-sm font-medium"><CheckCircle className="h-4 w-4" />Vermietung bestätigt</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Angebot senden Modal */}
      {showOffer && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setShowOffer(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold text-gray-900 dark:text-white">Angebot senden</h2>
                <button onClick={() => setShowOffer(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="h-4 w-4 text-gray-500" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-sm font-medium">E-Mail des Kunden *</label>
                  <Input value={offerEmail} onChange={(e) => setOfferEmail(e.target.value)} placeholder="kunde@beispiel.ch" className="mt-1.5" required />
                </div>
                <div>
                  <label className="text-sm font-medium">Nachricht (optional)</label>
                  <textarea value={offerMessage} onChange={(e) => setOfferMessage(e.target.value)} placeholder="Persönliche Nachricht zum Angebot..." className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none" rows={3} />
                </div>
                {docs.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Angehängte Dokumente:</p>
                    {docs.map((d) => (
                      <p key={d.path} className="text-xs text-blue-600 flex items-center gap-1"><FileText className="h-3 w-3" />{d.name}</p>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Der Kunde erhält eine E-Mail mit den Mietkonditionen und einem Bestätigungs-Link.</p>
                <div className="flex gap-3">
                  <button onClick={() => setShowOffer(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">Abbrechen</button>
                  <button onClick={sendOffer} disabled={!offerEmail || sendingOffer} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                    <Send className="h-4 w-4" />{sendingOffer ? "Senden..." : "Angebot senden"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Dokumente */}
      <Card className="bg-white">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><FileText className="h-4 w-4" />Dokumente ({docs.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4 mr-1" />{uploading ? "Hochladen..." : "PDF hochladen"}
          </Button>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={uploadDoc} className="hidden" />
        </CardHeader>
        <CardContent className="space-y-2">
          {docs.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Noch keine Dokumente. Lade Mietkonditionen als PDF hoch.</p>}
          {docs.map((d) => (
            <div key={d.path} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
              <button onClick={() => openFile(d.path)} className="flex items-center gap-3 min-w-0 flex-1 text-left hover:text-blue-600 transition-colors">
                <FileText className="h-5 w-5 text-red-500 shrink-0" />
                <span className="font-medium text-sm truncate">{d.name}</span>
              </button>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <button onClick={() => openFile(d.path)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-500"><Download className="h-4 w-4" /></button>
                <button onClick={() => deleteDoc(d)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Termine erstellen */}
      {request.status === "bestaetigt" && (
        <Card className="bg-white">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Calendar className="h-4 w-4" />Termine</CardTitle>
            <Button size="sm" variant="outline" onClick={() => {
              setShowTermin(!showTermin);
              if (!showTermin && request.event_date) {
                setTerminForm({ ...terminForm, title: `Übergabe ${request.customer?.name}`, date: request.event_date.split("T")[0] });
              }
            }}>
              {showTermin ? <X className="h-4 w-4 mr-1" /> : <><Calendar className="h-4 w-4 mr-1" />Termin erstellen</>}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {showTermin && (
              <form onSubmit={createTermin} className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
                <Input placeholder="Titel (z.B. Übergabe, Rücknahme) *" value={terminForm.title} onChange={(e) => setTerminForm({ ...terminForm, title: e.target.value })} required />
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
                  <Button type="submit" size="sm" className="bg-red-600 hover:bg-red-700 text-white">Termin erstellen</Button>
                </div>
              </form>
            )}
            <p className="text-xs text-muted-foreground">Erstelle Übergabe- und Rücknahme-Termine für die Vermietung.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
