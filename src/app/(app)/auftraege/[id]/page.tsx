"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JOB_STATUS } from "@/lib/constants";
import type { Job, JobAssignment, JobAppointment, Profile, Document as DocType, JobStatus } from "@/types";
import {
  ArrowLeft, MapPin, User, Calendar, Clock, FileText, Plus, Upload,
  Check, CheckCircle, XCircle, Trash2, UserCheck, Download, Send, X, StickyNote, Pencil, AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { JobNumber } from "@/components/job-number";

export default function AuftragDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [apptForm, setApptForm] = useState({ title: "", date: new Date().toISOString().split("T")[0], time: "09:00", end_time: "17:00", assigned_to: [] as string[], description: "" });
  const [notifiedAppts, setNotifiedAppts] = useState<Set<string>>(new Set());
  const [notifyPopup, setNotifyPopup] = useState<string | null>(null);
  const [emailField1, setEmailField1] = useState("");
  const [emailField2, setEmailField2] = useState("");
  const [deleteApptTarget, setDeleteApptTarget] = useState<string | null>(null);
  const [deleteApptCode, setDeleteApptCode] = useState("");

  // Notizen — Direkt-Eingabe (kein Toggle)
  const [notesList, setNotesList] = useState<{ id: string; content: string; created_at: string; author?: string }[]>([]);
  const [newNote, setNewNote] = useState("");

  // Stornieren-Flow: Modal mit zwei Phasen (confirm -> reason)
  const [cancelPhase, setCancelPhase] = useState<"closed" | "confirm" | "reason">("closed");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);

  useEffect(() => { loadAll(); }, [id]);

  // Auto-open Termin-Formular wenn von der Liste mit ?termin=neu hierher navigiert wurde.
  useEffect(() => {
    if (searchParams.get("termin") === "neu") {
      setShowApptForm(true);
      // Param entfernen, damit Refresh nicht erneut das Formular oeffnet
      router.replace(`/auftraege/${id}`, { scroll: false });
      // Sanft zum Termin-Bereich scrollen, sobald die Seite geladen ist
      setTimeout(() => {
        document.getElementById("termin-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [searchParams, id, router]);

  async function loadAll() {
    const [jobRes, assignRes, apptRes, docRes, profRes, repRes] = await Promise.all([
      supabase.from("jobs").select("*, customer:customers(name, address_street, address_zip, address_city), location:locations(name, address_street, address_zip, address_city), project_lead:profiles!project_lead_id(full_name), cancelled_by_profile:profiles!cancelled_by(full_name)").eq("id", id).single(),
      supabase.from("job_assignments").select("*, profile:profiles(full_name, role)").eq("job_id", id),
      supabase.from("job_appointments").select("*, assignee:profiles!assigned_to(full_name)").eq("job_id", id).order("start_time"),
      supabase.from("documents").select("*").eq("job_id", id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").eq("is_active", true).order("full_name"),
      supabase.from("service_reports").select("*, creator:profiles!created_by(full_name)").eq("job_id", id).order("created_at", { ascending: false }),
    ]);
    if (jobRes.data) {
      setJob(jobRes.data as unknown as Job);
      // Notizen aus JSON parsen
      if (jobRes.data.notes) {
        try {
          const parsed = JSON.parse(jobRes.data.notes);
          if (Array.isArray(parsed._notes)) setNotesList(parsed._notes);
          else setNotesList([]);
        } catch {
          // Alte Notiz im Textformat → als eine Notiz einlesen
          setNotesList([{ id: "legacy", content: jobRes.data.notes, created_at: jobRes.data.created_at }]);
        }
      } else setNotesList([]);
    }
    if (assignRes.data) setAssignments(assignRes.data as unknown as JobAssignment[]);
    if (apptRes.data) setAppointments(apptRes.data as unknown as JobAppointment[]);
    if (docRes.data) setDocuments(docRes.data as DocType[]);
    if (profRes.data) setProfiles(profRes.data as Profile[]);
    if (repRes.data) setReports(repRes.data);
  }

  async function saveNotes(notes: typeof notesList) {
    await supabase.from("jobs").update({ notes: JSON.stringify({ _notes: notes }) }).eq("id", id);
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user?.id).single();
    const updated = [{ id: crypto.randomUUID(), content: newNote, created_at: new Date().toISOString(), author: profile?.full_name }, ...notesList];
    await saveNotes(updated);
    setNotesList(updated);
    setNewNote("");
    toast.success("Notiz hinzugefügt");
  }

  async function deleteNote(noteId: string) {
    const updated = notesList.filter((n) => n.id !== noteId);
    await saveNotes(updated);
    setNotesList(updated);
    toast.success("Notiz gelöscht");
  }

  async function updateStatus(newStatus: JobStatus) {
    if (newStatus === "abgeschlossen") {
      // Status wird ERST in der Rapport-Page nach erfolgreichem Speichern auf
      // 'abgeschlossen' gesetzt — sonst bleibt ein Auftrag fälschlich "geschlossen"
      // wenn der User den Rapport-Flow abbricht.
      toast.info("Bitte zuerst den Einsatzrapport ausfüllen");
      router.push(`/rapporte/neu?job_id=${id}`);
      return;
    }

    await supabase.from("jobs").update({ status: newStatus }).eq("id", id);
    toast.success(`Status auf "${JOB_STATUS[newStatus].label}" geändert`);
    loadAll();
  }

  async function confirmCancel() {
    if (!cancelReason.trim()) {
      toast.error("Bitte einen Grund angeben");
      return;
    }
    setCancelSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("jobs")
      .update({
        status: "storniert",
        cancelled_by: user?.id ?? null,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancelReason.trim(),
      })
      .eq("id", id);
    setCancelSaving(false);
    if (error) {
      toast.error("Fehler: " + error.message);
      return;
    }
    setCancelPhase("closed");
    setCancelReason("");
    toast.success("Auftrag storniert");
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

    const { data: { user } } = await supabase.auth.getUser();
    const assignees = apptForm.assigned_to.length > 0 ? apptForm.assigned_to : [user?.id || ""];

    const rows = assignees.map((personId) => ({
      job_id: id,
      title: apptForm.title,
      start_time: startTime,
      end_time: endTime,
      assigned_to: personId,
      description: apptForm.description || null,
    }));
    await supabase.from("job_appointments").insert(rows);

    // E-Mail an zugewiesene Personen
    const { data: creator } = await supabase.from("profiles").select("full_name").eq("id", user?.id).single();
    for (const personId of assignees) {
      if (personId && personId !== user?.id) {
        await fetch("/api/appointments/assign-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignedTo: personId,
            title: apptForm.title,
            date: apptForm.date,
            time: apptForm.time,
            endTime: apptForm.end_time,
            jobTitle: job?.title || null,
            creatorName: creator?.full_name || "Unbekannt",
          }),
        });
      }
    }

    setApptForm({ title: "", date: new Date().toISOString().split("T")[0], time: "09:00", end_time: "17:00", assigned_to: [], description: "" });
    setShowApptForm(false);
    loadAll();
    toast.success(`Termin für ${assignees.length} Person${assignees.length > 1 ? "en" : ""} erstellt`);
  }

  async function toggleAppointment(apptId: string, isDone: boolean) {
    await supabase.from("job_appointments").update({ is_done: !isDone }).eq("id", apptId);
    loadAll();
  }

  async function deleteAppointment() {
    if (deleteApptCode !== "5225" || !deleteApptTarget) {
      toast.error("Falscher Code");
      return;
    }
    await supabase.from("job_appointments").delete().eq("id", deleteApptTarget);
    setDeleteApptTarget(null);
    setDeleteApptCode("");
    loadAll();
    toast.success("Termin gelöscht");
  }

  async function notifyAppointment(apptId: string) {
    const emails = [emailField1, emailField2].filter((e) => e.trim() && e.includes("@"));
    if (emails.length === 0) { toast.error("Mindestens eine E-Mail eingeben"); return; }
    toast.info("E-Mails werden gesendet...");
    try {
      const res = await fetch("/api/appointments/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointment_id: apptId, job_id: id, send_to_emails: emails }),
      });
      const result = await res.json();
      if (result.sentTo?.length > 0) {
        toast.success(`E-Mail gesendet an: ${result.sentTo.join(", ")}`);
        setNotifiedAppts((prev) => new Set(prev).add(apptId));
      } else {
        toast.error("Keine E-Mails gesendet");
      }
    } catch {
      toast.error("Fehler beim Senden");
    }
    setNotifyPopup(null);
    setEmailField1("");
    setEmailField2("");
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUploading(false); return; }

    for (const file of Array.from(files)) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `jobs/${id}/${Date.now()}_${safeName}`;
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("path", path);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const json = await res.json();
        if (!json.success) { toast.error("Upload-Fehler: " + (json.error || "Unbekannt")); continue; }
        await supabase.from("documents").insert({
          name: file.name, storage_path: path, file_size: file.size, mime_type: file.type,
          job_id: id as string, uploaded_by: user.id,
        });
      } catch (err: any) { toast.error("Upload-Fehler: " + (err.message || "Netzwerkfehler")); continue; }
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

  // Status-Aktionen — knapp: Freigeben (Entwurf → Bevorstehend), Abschliessen, Stornieren.
  // 'Starten' entfernt (siehe in_arbeit-Status weg).
  const statusActions: { from: JobStatus[]; to: JobStatus; label: string; icon: React.ReactNode; variant: "primary" | "outline" | "destructive" }[] = [
    { from: ["entwurf"], to: "offen", label: "Freigeben", icon: <CheckCircle className="h-4 w-4" />, variant: "primary" },
    { from: ["offen"], to: "abgeschlossen", label: "Abschliessen", icon: <CheckCircle className="h-4 w-4" />, variant: "outline" },
    { from: ["entwurf", "offen"], to: "storniert", label: "Stornieren", icon: <XCircle className="h-4 w-4" />, variant: "destructive" },
  ];

  const availableActions = statusActions.filter((a) => a.from.includes(job.status));
  const isDringend = job.priority === "dringend";

  // Abschliessen ist erst möglich, wenn das Enddatum erreicht ist
  const todayISO = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const endDateISO = job.end_date ? job.end_date.slice(0, 10) : null;
  const canFinish = !endDateISO || endDateISO <= todayISO;
  const finishBlockReason = !canFinish && endDateISO
    ? `Auftrag kann erst ab dem Enddatum (${new Date(endDateISO).toLocaleDateString("de-CH")}) abgeschlossen werden`
    : "";

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/auftraege"><button className="p-2 rounded-lg hover:bg-muted transition-colors"><ArrowLeft className="h-5 w-5" /></button></Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <JobNumber number={job.job_number} size="md" />
            <h1 className="text-2xl font-bold tracking-tight">{job.title}</h1>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            {/* Konsistent zur Liste: 'offen' = Default, kein Badge */}
            {job.status !== "offen" && (
              <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${JOB_STATUS[job.status].color}`}>{JOB_STATUS[job.status].label}</span>
            )}
            {isDringend && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">
                <AlertCircle className="h-3 w-3" />
                Dringend
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Aktionen: Status-Uebergaenge + Bearbeiten + Stornieren — alle als <Button> mit konsistenten Variants */}
      <div className="flex flex-wrap gap-2">
        {availableActions
          .filter((a) => a.to !== "storniert")
          .map((a) => {
            const isFinish = a.to === "abgeschlossen";
            const disabled = isFinish && !canFinish;
            // Primaere Aktionen (Freigeben) brand-rot, sekundaere (Abschliessen) outline
            const isPrimary = a.variant === "primary";
            return (
              <Button
                key={a.to}
                size="lg"
                variant={isPrimary ? undefined : "outline"}
                onClick={() => updateStatus(a.to)}
                disabled={disabled}
                title={disabled ? finishBlockReason : undefined}
                className={isPrimary ? "bg-red-600 hover:bg-red-700 text-white" : ""}
              >
                {a.icon}
                {a.label}
              </Button>
            );
          })}

        {/* Bearbeiten — nur bei Entwuerfen */}
        {job.status === "entwurf" && (
          <Link href={`/auftraege/${id}/bearbeiten`}>
            <Button size="lg" variant="outline">
              <Pencil className="h-4 w-4" />
              Bearbeiten
            </Button>
          </Link>
        )}

        {/* Stornieren als Letztes — destructive variant (sichtbar rot, nicht erst auf Hover) */}
        {availableActions
          .filter((a) => a.to === "storniert")
          .map((a) => (
            <Button
              key={a.to}
              size="lg"
              variant="destructive"
              onClick={() => setCancelPhase("confirm")}
            >
              {a.icon}
              {a.label}
            </Button>
          ))}
      </div>

      {/* Info */}
      <Card className="bg-card">
        <CardContent className="p-5 space-y-3">
          {customer && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Kunde:</span>
                <span>{customer.name}{!location && customerAddress ? ` — ${customerAddress}` : ""}</span>
              </div>
              {!location && mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border tinted-blue transition-colors"
                >
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
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border tinted-blue transition-colors"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Google Maps
                </a>
              )}
            </div>
          )}
          {projectLead && <div className="flex items-center gap-2 text-sm"><UserCheck className="h-4 w-4 text-muted-foreground" /><span className="font-medium">Projektleiter:</span> {projectLead.full_name}</div>}
          {job.start_date && <div className="flex items-center gap-2 text-sm"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="font-medium">Event-Datum:</span> {new Date(job.start_date).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })} {job.end_date && job.end_date !== job.start_date ? `– ${new Date(job.end_date).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })}` : ""}</div>}
          {job.description && <div className="pt-2 border-t"><p className="text-sm text-muted-foreground">{job.description}</p></div>}
        </CardContent>
      </Card>

      {/* Storno-Info — nur sichtbar wenn storniert */}
      {job.status === "storniert" && (job.cancelled_at || job.cancellation_reason) && (
        <Card className="bg-card border-destructive/30">
          <CardContent className="p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <XCircle className="h-4 w-4" />
              Storniert
            </div>
            <div className="text-sm text-muted-foreground">
              {job.cancelled_by_profile?.full_name && (
                <>von <span className="font-medium text-foreground">{job.cancelled_by_profile.full_name}</span></>
              )}
              {job.cancelled_at && (
                <> am <span className="font-medium text-foreground">{new Date(job.cancelled_at).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })}</span></>
              )}
            </div>
            {job.cancellation_reason && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-1">Grund</p>
                <p className="text-sm whitespace-pre-wrap">{job.cancellation_reason}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notizen */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><StickyNote className="h-4 w-4" />Notizen ({notesList.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Direkt-Eingabe — kein Toggle, kein "Neue Notiz"-Button */}
          <form onSubmit={addNote} className="space-y-2">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Notiz hinzufügen…"
              rows={2}
              style={{ fieldSizing: "content" } as React.CSSProperties}
              className="w-full px-3 py-2 text-sm rounded-xl border bg-background resize-none transition-all hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
            />
            {newNote.trim() && (
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setNewNote("")}>Abbrechen</Button>
                <Button type="submit" size="sm">Speichern</Button>
              </div>
            )}
          </form>
          {notesList.length === 0 && !newNote && <p className="text-sm text-muted-foreground py-2 text-center">Noch keine Notizen.</p>}
          {notesList.map((n) => (
            <div key={n.id} className="flex items-start justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="min-w-0 flex-1">
                <p className="text-sm whitespace-pre-wrap">{n.content.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                  part.match(/^https?:\/\//) ? (
                    <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{part}</a>
                  ) : part
                )}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {n.author ? `${n.author} · ` : ""}
                  {new Date(n.created_at).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <button onClick={() => deleteNote(n.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors ml-2 shrink-0"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Termine */}
      <Card id="termin-form" className="bg-card scroll-mt-4">
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
              <div>
                <label className="text-xs font-medium">Zuweisen an {apptForm.assigned_to.length > 0 && <span className="text-red-500">({apptForm.assigned_to.length})</span>}</label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {profiles.map((p) => {
                    const selected = apptForm.assigned_to.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setApptForm({ ...apptForm, assigned_to: selected ? apptForm.assigned_to.filter((pid) => pid !== p.id) : [...apptForm.assigned_to, p.id] })}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${selected ? "bg-foreground text-background border-foreground" : "border-border hover:border-foreground/30"}`}
                      >
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${selected ? "bg-card/20 text-white" : "bg-gray-200 text-gray-600"}`}>
                          {p.full_name.charAt(0)}
                        </div>
                        {p.full_name.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
                {apptForm.assigned_to.length === 0 && <p className="text-[11px] text-muted-foreground mt-1">Keine Auswahl = mir selbst</p>}
              </div>
              <textarea placeholder="Beschreibung..." value={apptForm.description} onChange={(e) => setApptForm({ ...apptForm, description: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-card resize-none" rows={2} />
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowApptForm(false)}>Abbrechen</Button>
                <Button type="submit" size="sm">Termin erstellen</Button>
              </div>
            </form>
          )}
          {appointments.length === 0 && !showApptForm && (
            !["abgeschlossen", "storniert"].includes(job.status) ? (
              <div className="flex items-center gap-3 p-3 rounded-xl border tinted-amber">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/20 shrink-0">
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Kein Termin geplant</p>
                  <p className="text-xs opacity-80 mt-0.5">
                    {job.start_date ? (() => {
                      const days = Math.ceil((new Date(job.start_date).getTime() - Date.now()) / 86400000);
                      return days > 0 ? `Auftrag beginnt in ${days} Tag${days === 1 ? "" : "en"}` : days === 0 ? "Auftrag beginnt heute" : `Auftrag hat vor ${Math.abs(days)} Tag${Math.abs(days) === 1 ? "" : "en"} begonnen`;
                    })() : "Kein Startdatum gesetzt"}
                    {" · oben rechts \"Termin\" anlegen"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2">Keine Termine.</p>
            )
          )}
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
                    <div className="relative">
                      <button
                        onClick={() => setNotifyPopup(notifyPopup === appt.id ? null : appt.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          notifiedAppts.has(appt.id)
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                        }`}
                      >
                        {notifiedAppts.has(appt.id) ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                        {notifiedAppts.has(appt.id) ? "Gesendet" : "Benachrichtigen"}
                      </button>
                      {notifyPopup === appt.id && (
                        <>
                          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => { setNotifyPopup(null); setEmailField1(""); setEmailField2(""); }} />
                          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-2">
                                  <Send className="h-5 w-5 text-blue-500" />
                                  <h2 className="font-semibold text-gray-900 dark:text-white">Terminbestätigung senden</h2>
                                </div>
                                <button onClick={() => { setNotifyPopup(null); setEmailField1(""); setEmailField2(""); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                                  <X className="h-4 w-4 text-gray-500" />
                                </button>
                              </div>
                              <div className="p-6 space-y-4">
                                <div>
                                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">E-Mail 1 *</label>
                                  <input
                                    type="email"
                                    value={emailField1}
                                    onChange={(e) => setEmailField1(e.target.value)}
                                    placeholder="empfaenger@beispiel.ch"
                                    className="mt-1.5 w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-gray-900 dark:text-white"
                                  />
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">E-Mail 2 (optional)</label>
                                  <input
                                    type="email"
                                    value={emailField2}
                                    onChange={(e) => setEmailField2(e.target.value)}
                                    placeholder="weitere@beispiel.ch"
                                    className="mt-1.5 w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-gray-900 dark:text-white"
                                  />
                                </div>
                                <div className="flex gap-3 pt-2">
                                  <button onClick={() => { setNotifyPopup(null); setEmailField1(""); setEmailField2(""); }} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                    Abbrechen
                                  </button>
                                  <button onClick={() => notifyAppointment(appt.id)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                                    <Send className="h-4 w-4" />Senden
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => setDeleteApptTarget(appt.id)}
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
      <Card className="bg-card">
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
      <Card className="bg-card">
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
      {/* Stornieren-Flow: Phase 'confirm' -> 'reason' */}
      {cancelPhase !== "closed" && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => { if (!cancelSaving) { setCancelPhase("closed"); setCancelReason(""); } }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h2 className="font-semibold">
                  {cancelPhase === "confirm" ? "Auftrag stornieren?" : "Grund angeben"}
                </h2>
                <button
                  onClick={() => { if (!cancelSaving) { setCancelPhase("closed"); setCancelReason(""); } }}
                  className="p-1.5 rounded-lg hover:bg-muted"
                  disabled={cancelSaving}
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-muted-foreground">
                  {job.job_number ? `INT-${job.job_number} — ` : ""}
                  <span className="font-medium text-foreground">&quot;{job.title}&quot;</span>
                </p>
                {cancelPhase === "confirm" ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Der Auftrag wird als storniert markiert. Du kannst ihn im Archiv wieder einsehen.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="lg" className="flex-1" onClick={() => setCancelPhase("closed")}>
                        Abbrechen
                      </Button>
                      <Button variant="destructive" size="lg" className="flex-1" onClick={() => setCancelPhase("reason")}>
                        Stornieren
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Bitte gib einen Grund an, warum dieser Auftrag storniert wird.
                    </p>
                    <textarea
                      placeholder="z.B. Kunde hat abgesagt, Termin verschoben…"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      rows={3}
                      autoFocus
                      className="w-full px-3 py-2 text-sm rounded-xl border bg-background resize-none transition-all hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="lg"
                        className="flex-1"
                        onClick={() => setCancelPhase("confirm")}
                        disabled={cancelSaving}
                      >
                        Zurück
                      </Button>
                      <Button
                        variant="destructive"
                        size="lg"
                        className="flex-1"
                        onClick={confirmCancel}
                        disabled={cancelSaving || !cancelReason.trim()}
                      >
                        {cancelSaving ? "Storniere…" : "Bestätigen"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete Appointment Modal */}
      {deleteApptTarget && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => { setDeleteApptTarget(null); setDeleteApptCode(""); }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold text-gray-900 dark:text-white">Termin löschen</h2>
                <button onClick={() => { setDeleteApptTarget(null); setDeleteApptCode(""); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-300">Der Termin wird unwiderruflich gelöscht.</p>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Bestätigungscode eingeben</label>
                  <Input value={deleteApptCode} onChange={(e) => setDeleteApptCode(e.target.value)} placeholder="Code eingeben..." className="mt-1.5 text-center text-lg tracking-widest font-mono" maxLength={4} />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setDeleteApptTarget(null); setDeleteApptCode(""); }} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Abbrechen</button>
                  <button onClick={deleteAppointment} disabled={deleteApptCode.length < 4} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-30">Endgültig löschen</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
