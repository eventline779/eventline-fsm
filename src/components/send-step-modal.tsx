"use client";

// Single-Phase-Modal fuer das Versenden eines Vermietungs-Schritts (1=Konditionen,
// 3=Angebot, 5=Vertrag). Der "Mail senden"-Klick ist gleichzeitig die
// Bestaetigung — bei Erfolg wird sofort onAdvance() gerufen und das Modal
// geschlossen. Empfaenger ist read-only (kommt vom Kunden), CC frei,
// Nachricht optional, Dokumente werden in den Storage-Pfad
// vermietentwurf/{jobId}/s{step}/... hochgeladen und an die Anfrage haengen.
//
// Verwendet auf /auftraege/vermietentwurf/[id] (Detailseite) und /auftraege (inline pro Karte).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { REQUEST_STEPS } from "@/lib/constants";
import { FileText, Send, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

export type SendStep = 1 | 3;

interface UploadedDoc {
  id: string;
  name: string;
  storage_path: string;
}

interface Props {
  open: boolean;
  jobId: string;
  step: 1 | 2 | 3 | 4;
  customerEmail: string | null | undefined;
  customerName?: string | null;
  locationName?: string | null;
  eventDate?: string | null;
  eventEndDate?: string | null;
  onClose: () => void;
  /**
   * Wird nach erfolgreichem "Bestaetigen" aufgerufen. Der Aufrufer ist dafuer
   * zustaendig, den Job-Step in der DB hochzuzaehlen (oder beim letzten Schritt
   * den Convert-Modal zu oeffnen).
   */
  onAdvance: () => Promise<void> | void;
}

export function SendStepModal({
  open,
  jobId,
  step,
  customerEmail,
  customerName,
  locationName,
  eventDate,
  eventEndDate,
  onClose,
  onAdvance,
}: Props) {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [cc, setCc] = useState("");
  const [message, setMessage] = useState("");
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Nur Mail-Schritte (1, 3) zeigen das Modal — andere Schritte sollten den
  // Modal nie oeffnen, wir verteidigen aber defensiv.
  const isMailStep = step === 1 || step === 3;
  const stepLabel = REQUEST_STEPS[step - 1]?.label ?? "Schritt";

  // Bei jedem Oeffnen alle Felder zuruecksetzen — auch die Anhang-Liste.
  // Bereits hochgeladene Doks bleiben in der documents-Tabelle (job_id ist
  // gesetzt), tauchen also weiterhin in der Auftrag-Detail-Seite auf, werden
  // aber im Modal nicht mehr angezeigt. So startet jeder Mail-Versand mit
  // frischem Anhang-Slot.
  useEffect(() => {
    if (!open || !isMailStep) return;
    setEmail(customerEmail ?? "");
    setCc("");
    setMessage("");
    setDocs([]);
  }, [open, jobId, step, customerEmail, isMailStep]);

  if (!open || !isMailStep) return null;

  async function uploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `vermietentwurf/${jobId}/s${step}/${Date.now()}_${safeName}`;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("path", path);
      const upRes = await fetch("/api/upload", { method: "POST", body: fd });
      const upJson = await upRes.json();
      if (!upJson.success) {
        toast.error("Upload-Fehler: " + (upJson.error || "Unbekannt"));
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      const { data: inserted, error } = await supabase
        .from("documents")
        .insert({
          name: file.name,
          storage_path: path,
          file_size: file.size,
          mime_type: file.type || null,
          job_id: jobId,
          uploaded_by: user?.id,
        })
        .select("id, name, storage_path")
        .single();
      if (error || !inserted) {
        toast.error("Fehler: " + (error?.message ?? "Speichern fehlgeschlagen"));
        return;
      }
      setDocs((prev) => [inserted as UploadedDoc, ...prev]);
      // Detail-Seite ueber neuen Upload informieren — der dortige Dokumente-
      // Block laedt sich neu und zeigt die frische Datei sofort.
      window.dispatchEvent(new Event("documents:invalidate"));
      toast.success("Dokument hochgeladen");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeDoc(doc: UploadedDoc) {
    await supabase.storage.from("documents").remove([doc.storage_path]);
    await supabase.from("documents").delete().eq("id", doc.id);
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
  }

  async function sendMail() {
    if (!email.trim()) {
      toast.error("Beim Kunden ist keine E-Mail hinterlegt");
      return;
    }
    if (docs.length === 0) {
      toast.error("Bitte zuerst ein Dokument hochladen");
      return;
    }
    const ccList = cc
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const invalidCc = ccList.find((m) => !m.includes("@"));
    if (invalidCc) {
      toast.error(`Ungültige CC-Adresse: ${invalidCc}`);
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/jobs/rental-draft/send-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          step,
          email: email.trim(),
          cc: ccList,
          message: message.trim(),
          customerName: customerName ?? null,
          locationName: locationName ?? null,
          eventDate: eventDate ?? null,
          eventEndDate: eventEndDate ?? null,
          documentPaths: docs.map((d) => d.storage_path),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error("Mail-Fehler: " + (json.error || "Unbekannt"));
        return;
      }
      toast.success("Mail gesendet");
      // "Mail senden"-Klick ist gleichzeitig die Bestaetigung — Step direkt
      // weiterruckeln und Modal zu. Kein zweiter "Bestaetigen"-Schritt mehr.
      onClose();
      await onAdvance();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Netzwerkfehler";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  function close() {
    if (sending) return;
    onClose();
  }

  // Modal via Portal direkt an document.body — damit kein Ancestor (sticky
  // Sidebar, transformierte Container, overflow-hidden Wrapper, etc.) das
  // fixed inset-0 einschraenken kann. Backdrop und Panel sitzen auf
  // Root-Stacking-Level und ueberdecken garantiert den vollen Viewport.
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-lg" onClick={close} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="font-semibold">{stepLabel} an Kunde</h2>
            <button
              onClick={close}
              className="p-1.5 rounded-lg hover:bg-muted"
              disabled={sending}
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div className="p-6 space-y-4">
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Empfänger</p>
                {email ? (
                  <div className="flex h-9 items-center px-3 text-sm rounded-xl border bg-muted/30 text-muted-foreground select-text">
                    {email}
                  </div>
                ) : (
                  <div className="flex h-9 items-center px-3 text-sm rounded-xl border border-destructive/40 bg-destructive/5 text-destructive">
                    Beim Kunden ist keine E-Mail hinterlegt.
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">CC (optional)</p>
                <Input
                  type="text"
                  placeholder="z.B. partner@firma.ch, buchhaltung@firma.ch"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground/80">Mehrere Adressen mit Komma trennen.</p>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Persönliche Nachricht (optional)</p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Optionaler Text, der im Mail-Body erscheint."
                  rows={3}
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                  className="w-full px-3 py-2 text-sm rounded-xl border bg-background resize-none transition-all hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Anhänge</p>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="kasten kasten-muted"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {uploading ? "Lädt…" : "Datei hinzufügen"}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={uploadDoc}
                    className="hidden"
                  />
                </div>
                {docs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Noch keine Datei hochgeladen.</p>
                ) : (
                  <div className="space-y-1.5">
                    {docs.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border bg-foreground/[0.02]">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs truncate">{d.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDoc(d)}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
                          title="Entfernen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={sending}
                  className="kasten kasten-muted flex-1 disabled:opacity-50 disabled:pointer-events-none"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={sendMail}
                  disabled={sending || !email.trim() || docs.length === 0}
                  title={docs.length === 0 ? "Bitte zuerst ein Dokument hochladen" : undefined}
                  className="kasten kasten-blue flex-1"
                >
                  <Send className="h-3.5 w-3.5" />
                  {sending ? "Sende…" : "Mail senden"}
                </button>
              </div>
            </div>
          </div>
      </div>
    </>,
    document.body
  );
}
