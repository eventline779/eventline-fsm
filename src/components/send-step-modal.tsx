"use client";

// 2-Phasen-Modal fuer das Versenden eines Vermietungs-Schritts (1=Konditionen,
// 3=Angebot, 5=Vertrag).
//   Phase 1 "compose": Empfaenger ist read-only (kommt vom Kunden), CC frei,
//     Nachricht optional, Dokumente werden in den Storage-Pfad
//     anfragen/{jobId}/s{step}/... hochgeladen und an die Anfrage haengen.
//   Phase 2 "confirm": Bestaetigen ruft onAdvance(); der Aufrufer entscheidet,
//     ob ein einfaches Step-+1 oder ein Convert-zu-Auftrag passieren soll.
//
// Verwendet auf /anfragen/[id] (Detailseite) und /auftraege (inline pro Karte).

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REQUEST_STEPS } from "@/lib/constants";
import { Check, FileText, Send, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

export type SendStep = 1 | 3 | 5;

interface UploadedDoc {
  id: string;
  name: string;
  storage_path: string;
}

interface Props {
  open: boolean;
  jobId: string;
  step: 1 | 2 | 3 | 4 | 5;
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
  const [phase, setPhase] = useState<"compose" | "confirm">("compose");
  const [email, setEmail] = useState("");
  const [cc, setCc] = useState("");
  const [message, setMessage] = useState("");
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Nur Mail-Schritte (1, 3, 5) zeigen das Modal — andere Schritte sollten den
  // Modal nie oeffnen, wir verteidigen aber defensiv.
  const isMailStep = step === 1 || step === 3 || step === 5;
  const stepLabel = REQUEST_STEPS[step - 1]?.label ?? "Schritt";

  // Bei jedem Oeffnen Empfaenger + Doks neu laden, alte Eingaben verwerfen.
  useEffect(() => {
    if (!open || !isMailStep) return;
    setPhase("compose");
    setEmail(customerEmail ?? "");
    setCc("");
    setMessage("");
    (async () => {
      const prefix = `anfragen/${jobId}/s${step}/`;
      const { data } = await supabase
        .from("documents")
        .select("id, name, storage_path")
        .eq("job_id", jobId)
        .like("storage_path", `${prefix}%`)
        .order("created_at", { ascending: false });
      setDocs((data as UploadedDoc[] | null) ?? []);
    })();
  }, [open, jobId, step, customerEmail, isMailStep, supabase]);

  if (!open || !isMailStep) return null;

  async function uploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `anfragen/${jobId}/s${step}/${Date.now()}_${safeName}`;
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
      const res = await fetch("/api/anfragen/send-mail", {
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
      setPhase("confirm");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Netzwerkfehler";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  async function confirmAdvance() {
    setConfirming(true);
    try {
      onClose();
      await onAdvance();
    } finally {
      setConfirming(false);
    }
  }

  function close() {
    if (sending || confirming) return;
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={close} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="font-semibold">
              {phase === "compose" ? `${stepLabel} an Kunde` : "Schritt bestätigen"}
            </h2>
            <button
              onClick={close}
              className="p-1.5 rounded-lg hover:bg-muted"
              disabled={sending || confirming}
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {phase === "compose" ? (
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
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {uploading ? "Lädt…" : "Datei hinzufügen"}
                  </Button>
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
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={close}
                  disabled={sending}
                >
                  Abbrechen
                </Button>
                <Button
                  size="lg"
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={sendMail}
                  disabled={sending || !email.trim() || docs.length === 0}
                  title={docs.length === 0 ? "Bitte zuerst ein Dokument hochladen" : undefined}
                >
                  <Send className="h-4 w-4 mr-1.5" />
                  {sending ? "Sende…" : "Mail senden"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-xl border tinted-emerald text-xs">
                <Check className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Mail wurde versendet</p>
                  <p className="opacity-80 mt-0.5">
                    Bestätige, um den Vermietentwurf zum nächsten Schritt zu bewegen.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={close}
                  disabled={confirming}
                >
                  Später
                </Button>
                <Button
                  size="lg"
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={confirmAdvance}
                  disabled={confirming}
                >
                  <Check className="h-4 w-4 mr-1.5" />
                  {confirming ? "Bestätige…" : "Bestätigen"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
