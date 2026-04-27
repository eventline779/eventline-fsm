"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Job } from "@/types";
import { REQUEST_STEPS } from "@/lib/constants";
import {
  ArrowLeft, MapPin, Users, Calendar, ArrowRight, Check, X, XCircle,
  StickyNote, FileText, Send, Download, Trash2,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { JobNumber } from "@/components/job-number";
import { RequestStepTracker } from "@/components/request-step-tracker";
import { SendStepModal } from "@/components/send-step-modal";

// Schritte mit Mail-Versand. 2/4 sind Warte-Schritte (kein Mail-Modal).
const MAIL_STEPS = new Set<number>([1, 3]);

export default function AnfrageDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  // Dokumente am Vermietentwurf — landen automatisch hier sobald via
  // SendStepModal hochgeladen (job_id = id, RLS via authentifizierten User).
  const [documents, setDocuments] = useState<Array<{
    id: string;
    name: string;
    storage_path: string;
    file_size: number | null;
    created_at: string;
  }>>([]);

  // Notizen — autosave
  const [notesText, setNotesText] = useState("");
  const [savedText, setSavedText] = useState("");

  // Storno-Flow: 2-Phasen-Modal wie beim Auftrag
  const [cancelPhase, setCancelPhase] = useState<"closed" | "confirm" | "reason">("closed");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);

  // Convert-Modal
  const [showConvert, setShowConvert] = useState(false);
  const [convertSaving, setConvertSaving] = useState(false);

  // Mail-Modal: gemeinsame Komponente, nur Open-Flag hier.
  const [sendOpen, setSendOpen] = useState(false);

  // Confirm-Dialoge fuer Manuell-Bestaetigen (Warte-Schritte 2/4) und Zurueck.
  const [showManualConfirm, setShowManualConfirm] = useState(false);
  const [showBackConfirm, setShowBackConfirm] = useState(false);

  useEffect(() => {
    loadJob();
    loadDocuments();
    // SendStepModal feuert dieses Event nach jedem erfolgreichen Upload —
    // dann frisch laden, damit das neue Dokument hier in der Liste auftaucht.
    const handler = () => loadDocuments();
    window.addEventListener("documents:invalidate", handler);

    // Supabase-Realtime: sobald jemand (z.B. der Kunde via Mail-Confirm) das
    // job aktualisiert, hier die Detail-Seite frisch laden — kein manuelles
    // Refresh noetig. Filter auf genau dieses id, damit wir nur unser Job
    // mitkriegen, nicht alle.
    const channel = supabase
      .channel(`vermietentwurf-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${id}` },
        () => { loadJob(); }
      )
      .subscribe();

    return () => {
      window.removeEventListener("documents:invalidate", handler);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadDocuments() {
    const { data } = await supabase
      .from("documents")
      .select("id, name, storage_path, file_size, created_at")
      .eq("job_id", id)
      .order("created_at", { ascending: false });
    setDocuments((data as typeof documents) ?? []);
  }

  async function downloadDoc(storagePath: string, name: string) {
    const { data } = await supabase.storage.from("documents").createSignedUrl(storagePath, 3600);
    if (data?.signedUrl) {
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = name;
      a.click();
    }
  }

  async function deleteDoc(docId: string, storagePath: string, name: string) {
    if (!confirm(`Dokument „${name}" wirklich löschen? Diese Aktion ist nicht rückgängig zu machen.`)) return;
    // Erst aus Storage, dann aus documents-Tabelle. Wenn Storage failt, ueberspringen
    // wir die DB-Loeschung nicht — die Verwaltung des Files muss schliesslich raus.
    await supabase.storage.from("documents").remove([storagePath]);
    const { error } = await supabase.from("documents").delete().eq("id", docId);
    if (error) {
      toast.error("Fehler beim Löschen: " + error.message);
      return;
    }
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    toast.success("Dokument gelöscht");
  }

  async function loadJob() {
    const { data, error } = await supabase
      .from("jobs")
      .select("*, customer:customers(name, email), location:locations(name, address_street, address_zip, address_city)")
      .eq("id", id)
      .single();
    if (error || !data) {
      toast.error("Vermietentwurf nicht gefunden");
      router.push("/auftraege");
      return;
    }
    if (data.status !== "anfrage" && data.status !== "storniert") {
      // Wurde bereits konvertiert -> redirect zur Auftrags-Detail
      router.replace(`/auftraege/${data.id}`);
      return;
    }
    setJob(data as unknown as Job);
    setNotesText(data.notes ?? "");
    setSavedText(data.notes ?? "");
    setLoading(false);
  }

  // Notizen autosave debounced
  useEffect(() => {
    if (notesText === savedText) return;
    const handle = setTimeout(async () => {
      await supabase.from("jobs").update({ notes: notesText || null }).eq("id", id);
      setSavedText(notesText);
    }, 800);
    return () => clearTimeout(handle);
  }, [notesText, savedText, id, supabase]);

  async function handleNextStep() {
    if (!job?.request_step) return;
    if (MAIL_STEPS.has(job.request_step)) {
      setSendOpen(true);
      return;
    }
    // Warte-Schritte (2, 4): manuelles Bestaetigen — der Kunde haette eigentlich aus
    // der Mail bestaetigen sollen. Confirm-Dialog zeigen, damit Klick nicht versehentlich
    // einen Schritt vorruckelt.
    setShowManualConfirm(true);
  }

  // Wirklich speichern. Wird sowohl von Warte-Schritten als auch von der Confirm-Phase
  // des Mail-Modals aufgerufen.
  async function advanceStepRaw() {
    if (!job?.request_step) return;
    const nextStep = job.request_step + 1;
    if (nextStep > 4) {
      // Schritt 4 (Angebot bestaetigt) erledigt -> direkt umwandeln. Kein
      // Entwurfs-Zwischenschritt, kein Confirm-Modal: die Akquise-Phase war
      // ja schon der Vermietentwurf, da gibt's nichts mehr zu pruefen.
      await convertToAuftrag();
      return;
    }
    const { error } = await supabase
      .from("jobs")
      .update({ request_step: nextStep })
      .eq("id", id);
    if (error) {
      toast.error("Fehler: " + error.message);
      return;
    }
    toast.success(REQUEST_STEPS[nextStep - 1].label);
    window.dispatchEvent(new Event("jobs:invalidate"));
    loadJob();
  }

  async function previousStep() {
    if (!job?.request_step || job.request_step <= 1) return;
    const prevStep = job.request_step - 1;
    const { error } = await supabase
      .from("jobs")
      .update({ request_step: prevStep })
      .eq("id", id);
    if (error) {
      toast.error("Fehler: " + error.message);
      return;
    }
    toast.success(`Zurück zu Schritt ${prevStep}`);
    window.dispatchEvent(new Event("jobs:invalidate"));
    loadJob();
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
        request_step: null,
        cancelled_by: user?.id ?? null,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancelReason.trim(),
        cancelled_as_anfrage: true,
      })
      .eq("id", id);
    setCancelSaving(false);
    if (error) {
      toast.error("Fehler: " + error.message);
      return;
    }
    setCancelPhase("closed");
    setCancelReason("");
    toast.success("Vermietentwurf storniert");
    window.dispatchEvent(new Event("jobs:invalidate"));
    router.push("/auftraege");
  }

  async function convertToAuftrag() {
    setConvertSaving(true);
    // status='offen' direkt — kein Entwurf-Zwischenschritt, weil die
    // Akquise/Pruefung schon im Vermietentwurf-Prozess passiert ist.
    // was_anfrage bleibt true → hellblauer Vermietung-Tag haengt am Auftrag.
    const { error } = await supabase
      .from("jobs")
      .update({
        status: "offen",
        request_step: null,
      })
      .eq("id", id);
    setConvertSaving(false);
    if (error) {
      toast.error("Fehler: " + error.message);
      return;
    }
    toast.success("Vermietentwurf in Auftrag umgewandelt");
    window.dispatchEvent(new Event("jobs:invalidate"));
    router.push(`/auftraege/${id}`);
  }

  if (loading || !job) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="h-8 w-40 rounded bg-muted animate-pulse" />
        <div className="h-32 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  const customer = (job.customer as unknown as { name: string }) || null;
  const location = (job.location as unknown as { name: string; address_street: string | null; address_zip: string | null; address_city: string | null }) || null;
  const currentStep = job.request_step ?? 1;
  const stepInfo = REQUEST_STEPS[currentStep - 1];
  const isLastStep = currentStep === 5;
  const isCancelled = job.status === "storniert";

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/auftraege">
          <button className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <JobNumber number={job.job_number} size="md" />
            <h1 className="text-2xl font-bold tracking-tight">{job.title}</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {isCancelled ? "Vermietentwurf · storniert" : "Vermietentwurf · noch nicht freigegeben"}
          </p>
        </div>
      </div>

      {/* Step-Tracker — nur wenn nicht abgelehnt */}
      {!isCancelled && (
        <Card className="bg-card">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Aktueller Schritt</p>
                <p className="text-base font-semibold mt-0.5">{currentStep}. {stepInfo.label}</p>
              </div>
              <div className="flex items-center gap-2">
                {currentStep > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowBackConfirm(true)}
                    className="kasten kasten-muted"
                  >
                    Zurück
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="kasten kasten-blue"
                >
                  {MAIL_STEPS.has(currentStep) ? (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      {stepInfo.label}
                    </>
                  ) : currentStep === 2 ? (
                    <>
                      Manuell Konditionen bestätigen
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  ) : currentStep === 4 ? (
                    <>
                      Manuell Angebot bestätigen
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      Nächster Schritt
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <RequestStepTracker currentStep={currentStep} size="lg" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Storno-Info wenn storniert */}
      {isCancelled && job.cancellation_reason && (
        <Card className="bg-card border-destructive/30">
          <CardContent className="p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <XCircle className="h-4 w-4" />
              Storniert
            </div>
            {job.cancelled_at && (
              <div className="text-sm text-muted-foreground">
                am <span className="font-medium text-foreground">{new Date(job.cancelled_at).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })}</span>
              </div>
            )}
            <div className="pt-2 border-t border-foreground/[0.06]">
              <p className="text-xs text-muted-foreground mb-1">Grund</p>
              <p className="text-sm whitespace-pre-wrap">{job.cancellation_reason}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Anfrage-Daten */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <FileText className="h-4 w-4" />Vermietentwurf-Details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0 space-y-3">
          {customer && (
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Kunde:</span>
              <span>{customer.name}</span>
            </div>
          )}
          {location && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Location:</span>
              <span>{location.name}</span>
            </div>
          )}
          {(job.start_date || job.end_date) && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Event-Datum:</span>
              <span>
                {job.start_date && new Date(job.start_date).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })}
                {job.end_date && job.end_date !== job.start_date && ` – ${new Date(job.end_date).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })}`}
              </span>
            </div>
          )}
          {(job.event_type || job.guest_count) && (
            <div className="flex items-center gap-4 text-sm flex-wrap">
              {job.event_type && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Veranstaltung:</span>
                  <span>{job.event_type}</span>
                </div>
              )}
              {job.guest_count && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Personen:</span>
                  <span>{job.guest_count}</span>
                </div>
              )}
            </div>
          )}
          {job.description && (
            <div className="pt-2 border-t border-foreground/[0.06]">
              <p className="text-xs text-muted-foreground mb-1">Beschreibung</p>
              <p className="text-sm whitespace-pre-wrap">{job.description}</p>
            </div>
          )}
          {job.extended_services && (
            <div className="pt-2 border-t border-foreground/[0.06]">
              <p className="text-xs text-muted-foreground mb-1">Zusatzleistungen</p>
              <p className="text-sm whitespace-pre-wrap">{job.extended_services}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dokumente — automatisch befuellt aus dem SendStepModal-Upload.
          Read-only hier; hochladen passiert ueber den Mail-Schritt. */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <FileText className="h-4 w-4" />Dokumente ({documents.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              Noch keine Dokumente. Anhänge aus den Mail-Schritten landen automatisch hier.
            </p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl bg-foreground/[0.02] border">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-5 w-5 text-red-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.file_size ? (doc.file_size / 1024).toFixed(0) + " KB" : ""}
                        {doc.file_size ? " · " : ""}
                        {new Date(doc.created_at).toLocaleDateString("de-CH")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => downloadDoc(doc.storage_path, doc.name)}
                      className="kasten kasten-muted"
                      title="Herunterladen"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteDoc(doc.id, doc.storage_path, doc.name)}
                      className="kasten kasten-red"
                      title="Löschen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notizen — autosave */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <StickyNote className="h-4 w-4" />Notizen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            placeholder="Reinschreiben — wird automatisch gespeichert."
            rows={4}
            style={{ fieldSizing: "content" } as React.CSSProperties}
            className="w-full px-3 py-2 text-sm rounded-xl border bg-background resize-none transition-all hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
          />
        </CardContent>
      </Card>

      {/* Stornieren — nur wenn aktiv. Gleiche Optik + 2-Phasen-Flow wie beim Auftrag. */}
      {!isCancelled && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setCancelPhase("confirm")}
            className="kasten kasten-red"
          >
            <XCircle className="h-3.5 w-3.5" />
            Stornieren
          </button>
        </div>
      )}

      {/* Manuell-bestaetigen-Confirm (Schritt 2/4 — Kunde haette aus Mail bestaetigen sollen) */}
      {showManualConfirm && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-lg" onClick={() => setShowManualConfirm(false)} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border">
              <div className="px-6 py-4 border-b">
                <h2 className="font-semibold">
                  {currentStep === 2 ? "Konditionen manuell bestätigen?" : "Angebot manuell bestätigen?"}
                </h2>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Normalerweise bestätigt der Kunde direkt aus der Mail. Bist du sicher, dass{" "}
                  {currentStep === 2 ? "die Konditionen" : "das Angebot"} bereits bestätigt wurden (z.B. telefonisch)?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowManualConfirm(false)}
                    className="kasten kasten-muted flex-1"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setShowManualConfirm(false);
                      await advanceStepRaw();
                    }}
                    className="kasten kasten-blue flex-1"
                  >
                    Ja, bestätigen
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Zurueck-Schritt-Confirm */}
      {showBackConfirm && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-lg" onClick={() => setShowBackConfirm(false)} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border">
              <div className="px-6 py-4 border-b">
                <h2 className="font-semibold">Schritt zurücksetzen?</h2>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Du gehst zurück zu Schritt {Math.max(1, currentStep - 1)} ({REQUEST_STEPS[Math.max(0, currentStep - 2)].label}). Schon gesendete Mails bleiben beim Kunden — der Klick im Mail würde diesen Schritt wieder vorruckeln.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBackConfirm(false)}
                    className="kasten kasten-muted flex-1"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setShowBackConfirm(false);
                      await previousStep();
                    }}
                    className="kasten kasten-blue flex-1"
                  >
                    Zurücksetzen
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Storno-Flow: Phase 'confirm' -> 'reason' (identisch zum Auftrag) */}
      {cancelPhase !== "closed" && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-lg" onClick={() => { if (!cancelSaving) { setCancelPhase("closed"); setCancelReason(""); } }} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h2 className="font-semibold">
                  {cancelPhase === "confirm" ? "Vermietentwurf stornieren?" : "Grund angeben"}
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
                      Der Vermietentwurf wird als storniert archiviert. Du kannst ihn nachher noch einsehen.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCancelPhase("closed")}
                        className="kasten kasten-muted flex-1"
                      >
                        Abbrechen
                      </button>
                      <button
                        type="button"
                        onClick={() => setCancelPhase("reason")}
                        className="kasten kasten-red flex-1"
                      >
                        Stornieren
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Bitte gib einen Grund an, warum dieser Vermietentwurf storniert wird.
                    </p>
                    <textarea
                      placeholder="z.B. Termin nicht verfügbar, Kunde hat abgesagt…"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      rows={3}
                      autoFocus
                      className="w-full px-3 py-2 text-sm rounded-xl border bg-background resize-none transition-all hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCancelPhase("confirm")}
                        disabled={cancelSaving}
                        className="kasten kasten-muted flex-1 disabled:opacity-50 disabled:pointer-events-none"
                      >
                        Zurück
                      </button>
                      <button
                        type="button"
                        onClick={confirmCancel}
                        disabled={cancelSaving || !cancelReason.trim()}
                        className="kasten kasten-red flex-1"
                      >
                        {cancelSaving ? "Storniere…" : "Bestätigen"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <SendStepModal
        open={sendOpen}
        jobId={String(id)}
        step={(job.request_step ?? 1) as 1 | 2 | 3 | 4}
        customerEmail={(job.customer as unknown as { email?: string | null } | undefined)?.email ?? ""}
        customerName={customer?.name ?? null}
        locationName={location?.name ?? null}
        eventDate={job.start_date}
        eventEndDate={job.end_date}
        onClose={() => setSendOpen(false)}
        onAdvance={advanceStepRaw}
      />

      {/* Convert-Modal */}
      {showConvert && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-lg" onClick={() => { if (!convertSaving) setShowConvert(false); }} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border">
              <div className="px-6 py-4 border-b">
                <h2 className="font-semibold">Vermietentwurf in Auftrag umwandeln?</h2>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Der Vermietentwurf wird zum Entwurf-Auftrag — du landest auf der Bearbeiten-Seite, kannst Details ergänzen und dann freigeben.
                </p>
                <div className="flex items-start gap-2 p-3 rounded-xl border tinted-blue text-xs">
                  <Check className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Akquise abgeschlossen</p>
                    <p className="opacity-80 mt-0.5">Alle 5 Schritte sind durchlaufen. Aus dem Vermietentwurf wird jetzt ein echter Auftrag.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowConvert(false)}
                    disabled={convertSaving}
                    className="kasten kasten-muted flex-1 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    onClick={convertToAuftrag}
                    disabled={convertSaving}
                    className="kasten kasten-red flex-1"
                  >
                    {convertSaving ? "Wandle um…" : "Umwandeln"}
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
