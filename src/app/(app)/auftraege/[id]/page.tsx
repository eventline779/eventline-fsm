"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JOB_STATUS, JOB_PRIORITY } from "@/lib/constants";
import type { Job, JobAssignment, JobAppointment, Profile, Document as DocType, JobStatus } from "@/types";
import {
  ArrowLeft, MapPin, User, Calendar, Clock, FileText, Plus, Upload,
  Check, Play, CheckCircle, XCircle, Trash2, UserCheck, Users, Download, Send,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function AuftragDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();

  const [job, setJob] = useState<Job | null>(null);
  const [assignments, setAssignments] = useState<JobAssignment[]>([]);
  const [appointments, setAppointments] = useState<JobAppointment[]>([]);
  const [documents, setDocuments] = useState<DocType[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  // Appointment form
  const [showApptForm, setShowApptForm] = useState(false);
  const [apptForm, setApptForm] = useState({ title: "", date: new Date().toISOString().split("T")[0], time: "09:00", end_time: "17:00", assigned_to: "", description: "" });
  const [notifiedAppts, setNotifiedAppts] = useState<Set<string>>(new Set());

  useEffect(() => { loadAll(); }, [id]);

  async function loadAll() {
    const [jobRes, assignRes, apptRes, docRes, profRes, repRes] = await Promise.all([
      supabase.from("jobs").select("*, customer:customers(name, address_street, address_zip, address_city), location:locations(name, address_street, address_zip, address_city), project_lead:profiles!project_lead_id(full_name)").eq("id", id).single(),
      supabase.from("job_assignments").select("*, profile:profiles(full_name, role)").eq("job_id", id),
      supabase.from("job_appointments").select("*, assignee:profiles!assigned_to(full_name)").eq("job_id", id).order("start_time"),
      supabase.from("documents").select("*").eq("job_id", id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").eq("is_active", true).order("full_name"),
      supabase.from("service_reports").select("*, creator:profiles!created_by(full_name)").eq("job_id", id).order("created_at", { ascending: false }),
    ]);
    if (jobRes.data) setJob(jobRes.data as unknown as Job);
    if (assignRes.data) setAssignments(assignRes.data as unknown as JobAssignment[]);
    if (apptRes.data) setAppointments(apptRes.data as unknown as JobAppointment[]);
    if (docRes.data) setDocuments(docRes.data as DocType[]);
    if (profRes.data) setProfiles(profRes.data as Profile[]);
    if (repRes.data) setReports(repRes.data);
  }

  async function updateStatus(newStatus: JobStatus) {
    const wasEntwurf = job?.status === "entwurf";

    if (newStatus === "abgeschlossen") {
      await supabase.from("jobs").update({ status: newStatus }).eq("id", id);
      toast.success("Auftrag abgeschlossen – Einsatzrapport ausfüllen");
      router.push(`/rapporte/neu?job_id=${id}`);
      return;
    }

    await supabase.from("jobs").update({ status: newStatus }).eq("id", id);
    toast.success(`Status auf "${JOB_STATUS[newStatus].label}" geändert`);

    // Wenn von Entwurf freigegeben → Schichten erstellen & Team benachrichtigen
    if (wasEntwurf && newStatus !== "storniert" && job) {
      const allPersons: string[] = [];
      if (job.project_lead_id) allPersons.push(job.project_lead_id);
      assignments.forEach((a) => {
        if (!allPersons.includes(a.profile_id)) allPersons.push(a.profile_id);
      });

      if (allPersons.length > 0) {
        try {
          await fetch("/api/jobs/assign-notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              job_id: id,
              profile_ids: allPersons,
              job_title: job.title,
              start_date: job.start_date || null,
              end_date: job.end_date || null,
            }),
          });
          toast.success("Team wurde benachrichtigt");
        } catch {}
      }
    }

    loadAll();
  }

  async function addAppointment(e: React.FormEvent) {
    e.preventDefault();
    const tzOffset = -new Date().getTimezoneOffset();
    const tzSign = tzOffset >= 0 ? "+" : "-";
    const tzHours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, "0");
    const tzMins = String(Math.abs(tzOffset) % 60).padStart(2, "0");
    const tz = `${tzSign}${tzHours}:${tzMins}`;
    const startTime = `${apptForm.date}T${apptForm.time || "00:00"}:00${tz}`;
    const endTime = `${apptForm.date}T${apptForm.end_time || "17:00"}:00${tz}`;

    await supabase.from("job_appointments").insert({
      job_id: id,
      title: apptForm.title,
      start_time: startTime,
      end_time: endTime,
      assigned_to: apptForm.assigned_to || null,
      description: apptForm.description || null,
    });

    // Schicht erstellen für zugewiesene Person + alle Techniker des Auftrags
    if (job && job.status !== "entwurf") {
      const personIds: string[] = [];
      if (apptForm.assigned_to) personIds.push(apptForm.assigned_to);
      // Auch Projektleiter und zugewiesene Techniker
      if (job.project_lead_id && !personIds.includes(job.project_lead_id)) personIds.push(job.project_lead_id);
      assignments.forEach((a) => {
        if (!personIds.includes(a.profile_id)) personIds.push(a.profile_id);
      });

      if (personIds.length > 0) {
        try {
          await fetch("/api/jobs/assign-notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              job_id: id,
              profile_ids: personIds,
              job_title: `${apptForm.title} (${job.title})`,
              start_date: startTime,
              end_date: endTime,
            }),
          });
          toast.success("Schicht erstellt & Team benachrichtigt");
        } catch {}
      }
    }

    setApptForm({ title: "", date: new Date().toISOString().split("T")[0], time: "09:00", end_time: "17:00", assigned_to: "", description: "" });
    setShowApptForm(false);
    loadAll();
    toast.success("Termin hinzugefügt");
  }

  async function toggleAppointment(apptId: string, isDone: boolean) {
    await supabase.from("job_appointments").update({ is_done: !isDone }).eq("id", apptId);
    loadAll();
  }

  async function deleteAppointment(apptId: string) {
    if (!confirm("Termin wirklich löschen?")) return;
    await supabase.from("job_appointments").delete().eq("id", apptId);
    loadAll();
    toast.success("Termin gelöscht");
  }

  async function notifyAppointment(apptId: string) {
    toast.info("E-Mails werden gesendet...");
    try {
      const res = await fetch("/api/appointments/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointment_id: apptId, job_id: id }),
      });
      const result = await res.json();
      if (result.sentTo?.length > 0) {
        toast.success(`E-Mail gesendet an: ${result.sentTo.join(", ")}`);
        setNotifiedAppts((prev) => new Set(prev).add(apptId));
      } else {
        toast.error("Keine E-Mails gesendet — Empfänger haben keine E-Mail-Adresse");
      }
    } catch {
      toast.error("Fehler beim Senden");
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    for (const file of Array.from(files)) {
      const path = `jobs/${id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(path, file);
      if (uploadError) { toast.error("Upload fehlgeschlagen: " + uploadError.message); continue; }
      await supabase.from("documents").insert({
        name: file.name, storage_path: path, file_size: file.size, mime_type: file.type,
        job_id: id as string, uploaded_by: user.id,
      });
    }
    toast.success("Datei(en) hochgeladen");
    loadAll();
    setUploading(false);
    e.target.value = "";
  }

  if (!job) return <div className="py-20 text-center text-muted-foreground">Laden...</div>;

  const customer = job.customer as unknown as { name: string; address_street?: string; address_zip?: string; address_city?: string } | undefined;
  const location = job.location as unknown as { name: string; address_street?: string; address_zip?: string; address_city?: string } | undefined;
  const locationAddress = location ? [location.address_street, `${location.address_zip || ""} ${location.address_city || ""}`.trim()].filter(Boolean).join(", ") : "";
  const customerAddress = customer ? [customer.address_street, `${customer.address_zip || ""} ${customer.address_city || ""}`.trim()].filter(Boolean).join(", ") : "";
  const mapsAddress = locationAddress || customerAddress;
  const mapsQuery = mapsAddress || location?.name || customer?.name || "";
  const mapsUrl = mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}` : "";
  const projectLead = (job as unknown as { project_lead: { full_name: string } | null }).project_lead;

  // Status transition buttons
  const statusActions: { from: JobStatus[]; to: JobStatus; label: string; icon: React.ReactNode; color: string }[] = [
    { from: ["entwurf"], to: "offen", label: "Freigeben", icon: <CheckCircle className="h-4 w-4" />, color: "bg-purple-600 hover:bg-purple-700 text-white" },
    { from: ["offen", "entwurf"], to: "geplant", label: "Planen", icon: <Calendar className="h-4 w-4" />, color: "bg-blue-600 hover:bg-blue-700 text-white" },
    { from: ["offen", "geplant"], to: "in_arbeit", label: "Starten", icon: <Play className="h-4 w-4" />, color: "bg-yellow-600 hover:bg-yellow-700 text-white" },
    { from: ["in_arbeit", "geplant"], to: "abgeschlossen", label: "Abschliessen", icon: <CheckCircle className="h-4 w-4" />, color: "bg-green-600 hover:bg-green-700 text-white" },
    { from: ["entwurf", "offen", "geplant", "in_arbeit"], to: "storniert", label: "Stornieren", icon: <XCircle className="h-4 w-4" />, color: "bg-gray-600 hover:bg-gray-700 text-white" },
  ];

  const availableActions = statusActions.filter((a) => a.from.includes(job.status));

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/auftraege"><button className="p-2 rounded-lg hover:bg-white transition-colors"><ArrowLeft className="h-5 w-5" /></button></Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {job.job_number && <span className="text-sm font-mono text-muted-foreground">INT-{job.job_number}</span>}
            <h1 className="text-2xl font-bold tracking-tight">{job.title}</h1>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${JOB_STATUS[job.status].color}`}>{JOB_STATUS[job.status].label}</span>
            <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${JOB_PRIORITY[job.priority].color}`}>{JOB_PRIORITY[job.priority].label}</span>
          </div>
        </div>
      </div>

      {/* Status Actions */}
      {availableActions.length > 0 && (
        <Card className="bg-white">
          <CardContent className="p-4 flex flex-wrap gap-2">
            {availableActions.map((a) => (
              <Button key={a.to} onClick={() => updateStatus(a.to)} size="sm" className={a.color}>
                {a.icon}<span className="ml-1.5">{a.label}</span>
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Card className="bg-white">
        <CardContent className="p-5 space-y-3">
          {customer && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Kunde:</span>
                <span>{customer.name}{!location && customerAddress ? ` — ${customerAddress}` : ""}</span>
              </div>
              {!location && mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200 hover:bg-blue-100 transition-colors">
                  <MapPin className="h-3.5 w-3.5" />
                  Google Maps
                </a>
              )}
            </div>
          )}
          {location && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Standort:</span>
                <span>{location.name}{locationAddress ? ` — ${locationAddress}` : ""}</span>
              </div>
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200 hover:bg-blue-100 transition-colors">
                  <MapPin className="h-3.5 w-3.5" />
                  Google Maps
                </a>
              )}
            </div>
          )}
          {projectLead && <div className="flex items-center gap-2 text-sm"><UserCheck className="h-4 w-4 text-muted-foreground" /><span className="font-medium">Projektleiter:</span> {projectLead.full_name}</div>}
          {job.start_date && <div className="flex items-center gap-2 text-sm"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="font-medium">Zeitraum:</span> {new Date(job.start_date).toLocaleDateString("de-CH")} {job.end_date ? `– ${new Date(job.end_date).toLocaleDateString("de-CH")}` : ""}</div>}
          {job.description && <div className="pt-2 border-t"><p className="text-sm text-muted-foreground">{job.description}</p></div>}
          {job.notes && <div className="pt-2 border-t"><p className="text-sm text-muted-foreground italic">{job.notes}</p></div>}
        </CardContent>
      </Card>

      {/* Zugewiesene Techniker */}
      <Card className="bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Users className="h-4 w-4" />Zugewiesene Techniker ({assignments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Keine Techniker zugewiesen.</p>
          ) : (
            <div className="space-y-2">
              {assignments.map((a) => {
                const prof = a.profile as unknown as { full_name: string; role: string } | undefined;
                return (
                  <div key={a.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                    <div className="h-8 w-8 rounded-lg bg-gray-200 flex items-center justify-center text-xs font-bold">{prof?.full_name?.charAt(0) || "?"}</div>
                    <span className="text-sm font-medium">{prof?.full_name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Termine */}
      <Card className="bg-white">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Calendar className="h-4 w-4" />Termine ({appointments.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowApptForm(!showApptForm)}><Plus className="h-4 w-4 mr-1" />Termin</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {showApptForm && (
            <form onSubmit={addAppointment} className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
              <Input placeholder="Termin-Titel *" value={apptForm.title} onChange={(e) => setApptForm({ ...apptForm, title: e.target.value })} required />
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs font-medium">Datum *</label><Input type="date" value={apptForm.date} onChange={(e) => setApptForm({ ...apptForm, date: e.target.value })} className="mt-1" required /></div>
                <div><label className="text-xs font-medium">Von *</label><Input type="time" value={apptForm.time} onChange={(e) => setApptForm({ ...apptForm, time: e.target.value })} className="mt-1" required /></div>
                <div><label className="text-xs font-medium">Bis *</label><Input type="time" value={apptForm.end_time} onChange={(e) => setApptForm({ ...apptForm, end_time: e.target.value })} className="mt-1" required /></div>
              </div>
              <select value={apptForm.assigned_to} onChange={(e) => setApptForm({ ...apptForm, assigned_to: e.target.value })} className="w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white">
                <option value="">Zuweisen an (optional)...</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
              <textarea placeholder="Beschreibung..." value={apptForm.description} onChange={(e) => setApptForm({ ...apptForm, description: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white resize-none" rows={2} />
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowApptForm(false)}>Abbrechen</Button>
                <Button type="submit" size="sm" className="bg-red-600 hover:bg-red-700 text-white">Termin erstellen</Button>
              </div>
            </form>
          )}
          {appointments.length === 0 && !showApptForm && <p className="text-sm text-muted-foreground py-2">Keine Termine.</p>}
          {appointments.map((appt) => {
            const assignee = (appt as unknown as { assignee: { full_name: string } | null }).assignee;
            return (
              <div key={appt.id} className={`flex items-center justify-between p-3 rounded-xl border ${appt.is_done ? "bg-green-50 border-green-100" : "bg-gray-50 border-gray-100"}`}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button onClick={() => toggleAppointment(appt.id, appt.is_done)} className={`flex items-center justify-center w-6 h-6 rounded-md border-2 shrink-0 transition-all ${appt.is_done ? "bg-green-500 border-green-500 text-white" : "border-gray-300 hover:border-red-400"}`}>
                    {appt.is_done && <Check className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0">
                    <span className={`font-medium text-sm ${appt.is_done ? "line-through text-muted-foreground" : ""}`}>{appt.title}</span>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(appt.start_time).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}{appt.end_time ? ` – ${new Date(appt.end_time).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
                      {assignee && <span className="flex items-center gap-1"><User className="h-3 w-3" />{assignee.full_name}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!appt.is_done && (
                    <button
                      onClick={() => !notifiedAppts.has(appt.id) && notifyAppointment(appt.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        notifiedAppts.has(appt.id)
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                      }`}
                      title={notifiedAppts.has(appt.id) ? "E-Mail wurde gesendet" : "Termin-E-Mail an Kunde, Projektleiter und Techniker senden"}
                    >
                      {notifiedAppts.has(appt.id) ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                      {notifiedAppts.has(appt.id) ? "Gesendet" : "Benachrichtigen"}
                    </button>
                  )}
                  <button
                    onClick={() => deleteAppointment(appt.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium border border-red-200 hover:bg-red-100 transition-colors"
                    title="Termin löschen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Löschen
                  </button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Einsatzrapporte */}
      <Card className="bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><FileText className="h-4 w-4" />Einsatzrapporte ({reports.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Noch keine Rapporte für diesen Auftrag.</p>
          ) : (
            <div className="space-y-2">
              {reports.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Rapport vom {new Date(r.report_date).toLocaleDateString("de-CH")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.creator?.full_name} · {r.status === "abgeschlossen" ? "Abgeschlossen" : "Entwurf"}
                    </p>
                  </div>
                  <a href={`/api/reports/${r.id}/pdf`} download={`Rapport_${r.report_date}.pdf`}>
                    <Button size="sm" variant="outline">
                      <Download className="h-4 w-4 mr-1" />PDF
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dokumente / PDFs */}
      <Card className="bg-white">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Upload className="h-4 w-4" />Dokumente ({documents.length})</CardTitle>
          <div>
            <input type="file" id="jobFileUpload" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" className="hidden" onChange={handleFileUpload} />
            <Button size="sm" variant="outline" onClick={() => document.getElementById("jobFileUpload")?.click()} disabled={uploading}>
              <Upload className="h-4 w-4 mr-1" />{uploading ? "Laden..." : "Hochladen"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Keine Dokumente. Klicke auf "Hochladen" um PDFs/Dateien anzuhängen.</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-5 w-5 text-red-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">{doc.file_size ? (doc.file_size / 1024).toFixed(0) + " KB" : ""} · {new Date(doc.created_at).toLocaleDateString("de-CH")}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={async () => {
                    const { data } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 3600);
                    if (data?.signedUrl) {
                      const a = document.createElement("a");
                      a.href = data.signedUrl;
                      a.download = doc.name;
                      a.click();
                    }
                  }}>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
