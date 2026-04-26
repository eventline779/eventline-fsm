"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Job } from "@/types";
import { REQUEST_STEPS } from "@/lib/constants";
import {
  ArrowLeft, MapPin, Users, Calendar, ArrowRight, Check, X, XCircle,
  StickyNote, FileText,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { JobNumber } from "@/components/job-number";
import { RequestStepTracker } from "@/components/request-step-tracker";

export default function AnfrageDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const supabase = createClient();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    loadJob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadJob() {
    const { data, error } = await supabase
      .from("jobs")
      .select("*, customer:customers(name), location:locations(name, address_street, address_zip, address_city)")
      .eq("id", id)
      .single();
    if (error || !data) {
      toast.error("Mietanfrage nicht gefunden");
      router.push("/anfragen");
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

  async function advanceStep() {
    if (!job?.request_step) return;
    const nextStep = job.request_step + 1;
    if (nextStep > 5) {
      // Letzter Schritt erledigt -> Konvertieren-Modal
      setShowConvert(true);
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
      })
      .eq("id", id);
    setCancelSaving(false);
    if (error) {
      toast.error("Fehler: " + error.message);
      return;
    }
    setCancelPhase("closed");
    setCancelReason("");
    toast.success("Mietanfrage storniert");
    window.dispatchEvent(new Event("jobs:invalidate"));
    router.push("/anfragen");
  }

  async function convertToAuftrag() {
    setConvertSaving(true);
    const { error } = await supabase
      .from("jobs")
      .update({
        status: "entwurf",
        request_step: null,
      })
      .eq("id", id);
    setConvertSaving(false);
    if (error) {
      toast.error("Fehler: " + error.message);
      return;
    }
    toast.success("In Auftrag umgewandelt — bitte vor Freigabe prüfen");
    window.dispatchEvent(new Event("jobs:invalidate"));
    router.push(`/auftraege/${id}/bearbeiten`);
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
        <Link href="/anfragen">
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
            {isCancelled ? "Mietanfrage · storniert" : "Mietanfrage · noch nicht freigegeben"}
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
                  <Button size="sm" variant="outline" onClick={previousStep}>
                    Zurück
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={advanceStep}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {isLastStep ? "Mietanfrage abschliessen" : "Nächster Schritt"}
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
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
            <FileText className="h-4 w-4" />Mietanfrage-Details
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
          <Button
            variant="destructive"
            size="lg"
            onClick={() => setCancelPhase("confirm")}
          >
            <XCircle className="h-4 w-4" />
            Stornieren
          </Button>
        </div>
      )}

      {/* Storno-Flow: Phase 'confirm' -> 'reason' (identisch zum Auftrag) */}
      {cancelPhase !== "closed" && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => { if (!cancelSaving) { setCancelPhase("closed"); setCancelReason(""); } }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h2 className="font-semibold">
                  {cancelPhase === "confirm" ? "Mietanfrage stornieren?" : "Grund angeben"}
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
                      Die Anfrage wird als storniert archiviert. Du kannst sie nachher noch einsehen.
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
                      Bitte gib einen Grund an, warum diese Anfrage storniert wird.
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

      {/* Convert-Modal */}
      {showConvert && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => { if (!convertSaving) setShowConvert(false); }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border">
              <div className="px-6 py-4 border-b">
                <h2 className="font-semibold">Mietanfrage in Auftrag umwandeln?</h2>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Die Anfrage wird zum Entwurf-Auftrag — du landest auf der Bearbeiten-Seite, kannst Details ergänzen und dann freigeben.
                </p>
                <div className="flex items-start gap-2 p-3 rounded-xl border tinted-blue text-xs">
                  <Check className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Akquise abgeschlossen</p>
                    <p className="opacity-80 mt-0.5">Alle 5 Schritte sind durchlaufen. Aus der Mietanfrage wird jetzt ein echter Auftrag.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="lg" className="flex-1" onClick={() => setShowConvert(false)} disabled={convertSaving}>
                    Abbrechen
                  </Button>
                  <Button size="lg" className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={convertToAuftrag} disabled={convertSaving}>
                    {convertSaving ? "Wandle um…" : "Umwandeln"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
