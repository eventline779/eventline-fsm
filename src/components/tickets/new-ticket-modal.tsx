"use client";

/**
 * Modal zum Erstellen eines neuen Tickets.
 *
 * Phase 1: Typ-Picker — Mitarbeiter waehlt zwischen IT, Beleg,
 *          Stempel-Aenderung, Material.
 * Phase 2: Typ-spezifisches Formular mit allen Pflicht-Feldern und
 *          optionalem File-Upload (mehrere Dateien).
 *
 * Beim Submit:
 *   1. INSERT in tickets (mit type, title, description, priority, data)
 *   2. Upload aller Files in storage-bucket "documents" unter
 *      tickets/{ticket_id}/{filename}
 *   3. INSERT-Rows in ticket_attachments
 *   4. POST /api/tickets/notify-admins triggert In-App-Notification
 */

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/searchable-select";
import { TypePickerCard, type TypePickerTone } from "@/components/ui/type-picker-card";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Wrench, Receipt, Clock, Package, Upload, X, CheckCircle2, AlertCircle, Loader2, AlertTriangle, Sparkles } from "lucide-react";
import type { TicketType } from "@/types";

type Step = "pick" | "form";
type StempelMode = "korrektur" | "vergessen";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const TYPES: { id: TicketType; label: string; description: string; icon: React.ComponentType<{ className?: string }>; tone: TypePickerTone }[] = [
  { id: "it",                label: "IT-Problem",       description: "Drucker, Software, Login, Hardware", icon: Wrench,  tone: "purple" },
  { id: "beleg",             label: "Beleg",            description: "Quittung einreichen für Erstattung", icon: Receipt, tone: "amber"  },
  { id: "stempel_aenderung", label: "Stempel-Änderung", description: "Korrektur oder Nacherfassung",       icon: Clock,   tone: "blue"   },
  { id: "material",          label: "Material",         description: "Etwas einkaufen — Genehmigung",      icon: Package, tone: "red"    },
];

export function NewTicketModal({ open, onClose, onCreated }: Props) {
  const supabase = createClient();
  const [step, setStep] = useState<Step>("pick");
  const [type, setType] = useState<TicketType | null>(null);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  // Gemeinsame Felder.
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgent, setUrgent] = useState(false);

  // Beleg-spezifisch.
  const [beleg, setBeleg] = useState({ betrag_chf: "", kaufdatum: "", lieferant: "" });
  // KI-Analyse-State fuer Beleg: laeuft beim ersten File-Pick.
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisIssues, setAnalysisIssues] = useState<string[]>([]);
  const [analysisDone, setAnalysisDone] = useState(false);

  // Stempel-Aenderung-spezifisch.
  const [stempelMode, setStempelMode] = useState<StempelMode>("korrektur");
  const [timeEntries, setTimeEntries] = useState<Array<{ id: string; clock_in: string; clock_out: string | null; job_label: string | null }>>([]);
  const [stempel, setStempel] = useState({
    time_entry_id: "",
    neu_start: "",        // datetime-local
    neu_end: "",          // datetime-local
    job_id: "",
    beschreibung: "",
    grund: "",
  });
  const [jobs, setJobs] = useState<{ id: string; job_number: number; title: string }[]>([]);

  // Material-spezifisch.
  const [material, setMaterial] = useState({ artikel: "", menge: "1", betrag_chf: "", auftrag_id: "" });

  // IT-spezifisch.
  const [device, setDevice] = useState("");

  // Beim Oeffnen Reset; bei Stempel-Auswahl die letzten Stempel-Eintraege laden.
  useEffect(() => {
    if (!open) {
      setStep("pick");
      setType(null);
      setSaving(false);
      setFiles([]);
      setTitle("");
      setDescription("");
      setUrgent(false);
      setBeleg({ betrag_chf: "", kaufdatum: "", lieferant: "" });
      setAnalyzing(false);
      setAnalysisIssues([]);
      setAnalysisDone(false);
      setStempelMode("korrektur");
      setStempel({ time_entry_id: "", neu_start: "", neu_end: "", job_id: "", beschreibung: "", grund: "" });
      setMaterial({ artikel: "", menge: "1", betrag_chf: "", auftrag_id: "" });
      setDevice("");
    }
  }, [open]);

  // Stempel-Eintraege laden wenn Typ Stempel-Aenderung gewaehlt wird.
  useEffect(() => {
    if (type !== "stempel_aenderung") return;
    (async () => {
      const { data } = await supabase
        .from("time_entries")
        .select("id, clock_in, clock_out, description, job:jobs(job_number, title)")
        .order("clock_in", { ascending: false })
        .limit(30);
      if (data) {
        setTimeEntries(
          (data as unknown as Array<{
            id: string; clock_in: string; clock_out: string | null; description: string | null;
            job: { job_number: number; title: string } | null;
          }>).map((e) => ({
            id: e.id,
            clock_in: e.clock_in,
            clock_out: e.clock_out,
            job_label: e.job ? `INT-${e.job.job_number}` : (e.description || "Andere Arbeit"),
          })),
        );
      }
    })();
  }, [type, supabase]);

  // Jobs fuer Stempel-/Material-Form laden.
  useEffect(() => {
    if (type !== "stempel_aenderung" && type !== "material") return;
    (async () => {
      const { data } = await supabase
        .from("jobs")
        .select("id, job_number, title")
        .in("status", ["offen", "anfrage", "entwurf"])
        .order("start_date", { ascending: false, nullsFirst: false })
        .limit(50);
      if (data) setJobs(data);
    })();
  }, [type, supabase]);

  function pickType(t: TicketType) {
    setType(t);
    setStep("form");
    // Default-Title je nach Typ vorbelegen damit der User nicht jedes Mal tippen muss.
    if (t === "it") setTitle("");
    if (t === "beleg") setTitle("Beleg-Erstattung");
    if (t === "stempel_aenderung") setTitle("Stempelzeit-Änderung");
    if (t === "material") setTitle("Material-Anfrage");
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list) return;
    const newFiles = Array.from(list);
    setFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";

    // Beim Beleg-Typ: erste Datei automatisch via KI analysieren.
    // Wir analysieren NUR die erste Datei, weitere Dateien bleiben unangetastet.
    if (type === "beleg" && newFiles.length > 0 && !analysisDone) {
      const first = newFiles[0];
      if (!first.type.startsWith("image/")) {
        // PDF-Belege analysieren wir nicht — User soll selbst eintragen.
        return;
      }
      analyzeReceipt(first);
    }
  }

  async function analyzeReceipt(file: File) {
    setAnalyzing(true);
    setAnalysisIssues([]);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/tickets/analyze-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: base64, mime_type: file.type }),
      });
      const json = await res.json();
      if (!json.success) {
        setAnalysisIssues([`Analyse fehlgeschlagen: ${json.error ?? "Unbekannt"}`]);
        return;
      }
      const r = json.result as {
        ok?: boolean;
        issues?: string[];
        extracted?: { betrag_chf?: number | null; kaufdatum?: string | null; lieferant?: string | null };
      };
      // Felder vorausfuellen wenn KI was erkannt hat — User kann jederzeit ueberschreiben.
      const ex = r.extracted ?? {};
      setBeleg((prev) => ({
        betrag_chf: prev.betrag_chf || (typeof ex.betrag_chf === "number" ? ex.betrag_chf.toFixed(2) : ""),
        kaufdatum: prev.kaufdatum || (typeof ex.kaufdatum === "string" ? ex.kaufdatum : ""),
        lieferant: prev.lieferant || (typeof ex.lieferant === "string" ? ex.lieferant : ""),
      }));
      setAnalysisIssues(Array.isArray(r.issues) ? r.issues : []);
      setAnalysisDone(true);
    } catch (err) {
      setAnalysisIssues([err instanceof Error ? err.message : "Analyse fehlgeschlagen"]);
    } finally {
      setAnalyzing(false);
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Konnte Bild nicht lesen"));
          return;
        }
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error ?? new Error("FileReader-Fehler"));
      reader.readAsDataURL(file);
    });
  }

  function removeFile(idx: number) {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // Wenn alle Files weg, Analyse-State zuruecksetzen.
      if (next.length === 0) {
        setAnalysisIssues([]);
        setAnalysisDone(false);
      }
      return next;
    });
  }

  function validate(): string | null {
    if (!type) return "Typ fehlt";
    if (!title.trim()) return "Titel fehlt";
    if (type === "it" && !description.trim()) return "Problem-Beschreibung fehlt";
    if (type === "beleg") {
      if (files.length === 0) return "Beleg-Foto oder PDF ist Pflicht — bitte Datei hochladen";
      if (!beleg.betrag_chf || isNaN(parseFloat(beleg.betrag_chf))) return "Betrag fehlt";
      if (!beleg.kaufdatum) return "Kaufdatum fehlt";
    }
    if (type === "stempel_aenderung") {
      if (!stempel.grund.trim()) return "Grund ist Pflicht";
      if (stempelMode === "korrektur" && !stempel.time_entry_id) return "Stempel-Eintrag auswählen";
      if (stempelMode === "vergessen" && (!stempel.neu_start || !stempel.neu_end)) return "Neue Start/End-Zeit fehlt";
    }
    if (type === "material") {
      if (!material.artikel.trim()) return "Artikel fehlt";
      if (!material.menge || parseInt(material.menge) < 1) return "Menge muss mindestens 1 sein";
      // Mindestens eines: Betrag ODER File-Upload
      const hasBetrag = !!material.betrag_chf && !isNaN(parseFloat(material.betrag_chf));
      const hasFile = files.length > 0;
      if (!hasBetrag && !hasFile) return "Entweder Betrag eingeben ODER Quittung/Foto hochladen";
    }
    return null;
  }

  async function submit() {
    const err = validate();
    if (err) { toast.error(err); return; }
    if (!type) return;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht eingeloggt");

      // Typ-spezifisches data-Object zusammenbauen.
      let data: Record<string, unknown> = {};
      if (type === "it") {
        data = { device: device || undefined };
      } else if (type === "beleg") {
        data = {
          betrag_chf: parseFloat(beleg.betrag_chf),
          kaufdatum: beleg.kaufdatum,
          lieferant: beleg.lieferant || undefined,
        };
      } else if (type === "stempel_aenderung") {
        if (stempelMode === "korrektur") {
          data = {
            time_entry_id: stempel.time_entry_id,
            neu_start: stempel.neu_start ? new Date(stempel.neu_start).toISOString() : undefined,
            neu_end: stempel.neu_end ? new Date(stempel.neu_end).toISOString() : undefined,
            grund: stempel.grund,
          };
        } else {
          data = {
            neu_start: new Date(stempel.neu_start).toISOString(),
            neu_end: new Date(stempel.neu_end).toISOString(),
            job_id: stempel.job_id || undefined,
            beschreibung: stempel.beschreibung || undefined,
            grund: stempel.grund,
          };
        }
      } else if (type === "material") {
        data = {
          artikel: material.artikel,
          menge: parseInt(material.menge),
          betrag_chf: material.betrag_chf ? parseFloat(material.betrag_chf) : undefined,
          auftrag_id: material.auftrag_id || undefined,
        };
      }

      // Ticket erstellen.
      const { data: created, error: insErr } = await supabase
        .from("tickets")
        .insert({
          type,
          title: title.trim(),
          description: description.trim() || null,
          priority: urgent ? "dringend" : "normal",
          data,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (insErr || !created) throw new Error(insErr?.message || "Insert fehlgeschlagen");

      // Files hochladen.
      for (const file of files) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `tickets/${created.id}/${Date.now()}_${safe}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
        if (upErr) {
          // Soft-fail — Ticket ist schon angelegt, Datei fehlt eben.
          toast.error(`Datei "${file.name}" konnte nicht hochgeladen werden: ${upErr.message}`);
          continue;
        }
        await supabase.from("ticket_attachments").insert({
          ticket_id: created.id,
          storage_path: path,
          filename: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          uploaded_by: user.id,
        });
      }

      // In-App-Notification an Admins triggern.
      await fetch("/api/tickets/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: created.id, event: "created" }),
      }).catch(() => {});

      toast.success("Ticket eingereicht");
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Anlegen");
    } finally {
      setSaving(false);
    }
  }

  const modalTitle = step === "pick" ? "Neues Ticket" : `${TYPES.find((t) => t.id === type)?.label}`;
  const typeMeta = type ? TYPES.find((t) => t.id === type) : null;

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title={modalTitle} size="lg" closable={!saving}>
      {step === "pick" && (
        <div className="grid grid-cols-2 gap-3">
          {TYPES.map((t) => (
            <TypePickerCard
              key={t.id}
              icon={t.icon}
              tone={t.tone}
              label={t.label}
              description={t.description}
              onClick={() => pickType(t.id)}
            />
          ))}
        </div>
      )}

      {step === "form" && type && typeMeta && (
        <div className="space-y-4">
          {/* Titel + Dringend-Toggle (gleicher Stil wie Auftrag-Form). */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground/70 ml-1">Titel *</p>
              <button
                type="button"
                onClick={() => setUrgent((u) => !u)}
                aria-pressed={urgent}
                aria-label="Dringend markieren"
                className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[11px] font-medium transition-all ${
                  urgent
                    ? "bg-red-500 text-white shadow-sm shadow-red-500/30"
                    : "text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10"
                }`}
              >
                <AlertCircle className="h-3.5 w-3.5" strokeWidth={urgent ? 2.5 : 2} />
                Dringend
              </button>
            </div>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          {/* Typ-spezifische Felder */}
          {type === "it" && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground/70 ml-1">Betroffenes Gerät / Bereich</p>
              <Input
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                placeholder="z.B. Drucker Büro, Outlook, WLAN-Halle"
              />
            </div>
          )}

          {type === "beleg" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground/70 ml-1">Betrag (CHF) *</p>
                <Input type="number" step="0.05" value={beleg.betrag_chf} onChange={(e) => setBeleg({ ...beleg, betrag_chf: e.target.value })} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground/70 ml-1">Kaufdatum *</p>
                <Input type="date" value={beleg.kaufdatum} onChange={(e) => setBeleg({ ...beleg, kaufdatum: e.target.value })} />
              </div>
              <div className="space-y-1 col-span-2">
                <p className="text-[10px] text-muted-foreground/70 ml-1">Lieferant / Geschäft</p>
                <Input value={beleg.lieferant} onChange={(e) => setBeleg({ ...beleg, lieferant: e.target.value })} placeholder="z.B. Conrad, Migros" />
              </div>
            </div>
          )}

          {type === "stempel_aenderung" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStempelMode("korrektur")}
                  className={stempelMode === "korrektur" ? "kasten-active flex-1" : "kasten-toggle-off flex-1"}
                >
                  Bestehenden Eintrag korrigieren
                </button>
                <button
                  type="button"
                  onClick={() => setStempelMode("vergessen")}
                  className={stempelMode === "vergessen" ? "kasten-active flex-1" : "kasten-toggle-off flex-1"}
                >
                  Vergessen einzustempeln
                </button>
              </div>

              {stempelMode === "korrektur" && (
                <>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground/70 ml-1">Welcher Eintrag? *</p>
                    <SearchableSelect
                      value={stempel.time_entry_id}
                      onChange={(v) => setStempel({ ...stempel, time_entry_id: v })}
                      items={timeEntries.map((e) => ({
                        id: e.id,
                        label: `${new Date(e.clock_in).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} — ${e.job_label ?? "—"}`,
                      }))}
                      placeholder="Stempel-Eintrag auswählen…"
                      clearable={false}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground/70 ml-1">Korrigiertes Start</p>
                      <Input type="datetime-local" value={stempel.neu_start} onChange={(e) => setStempel({ ...stempel, neu_start: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground/70 ml-1">Korrigiertes Ende</p>
                      <Input type="datetime-local" value={stempel.neu_end} onChange={(e) => setStempel({ ...stempel, neu_end: e.target.value })} />
                    </div>
                  </div>
                </>
              )}

              {stempelMode === "vergessen" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground/70 ml-1">Start *</p>
                      <Input type="datetime-local" value={stempel.neu_start} onChange={(e) => setStempel({ ...stempel, neu_start: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground/70 ml-1">Ende *</p>
                      <Input type="datetime-local" value={stempel.neu_end} onChange={(e) => setStempel({ ...stempel, neu_end: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground/70 ml-1">Auftrag (optional)</p>
                    <SearchableSelect
                      value={stempel.job_id}
                      onChange={(v) => setStempel({ ...stempel, job_id: v })}
                      items={[
                        { id: "", label: "Kein Auftrag (Andere Arbeit)" },
                        ...jobs.map((j) => ({ id: j.id, label: `INT-${j.job_number} — ${j.title}` })),
                      ]}
                      clearable={false}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground/70 ml-1">Beschreibung der Arbeit</p>
                    <Input value={stempel.beschreibung} onChange={(e) => setStempel({ ...stempel, beschreibung: e.target.value })} placeholder="kurz: was wurde gemacht" />
                  </div>
                </>
              )}

              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground/70 ml-1">Grund der Änderung *</p>
                <textarea
                  value={stempel.grund}
                  onChange={(e) => setStempel({ ...stempel, grund: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-card resize-none"
                  placeholder="warum gehört das angepasst…"
                />
              </div>
            </div>
          )}

          {type === "material" && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <p className="text-[10px] text-muted-foreground/70 ml-1">Artikel *</p>
                  <Input value={material.artikel} onChange={(e) => setMaterial({ ...material, artikel: e.target.value })} placeholder="z.B. XLR-Kabel 5m" />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground/70 ml-1">Menge *</p>
                  <Input type="number" min="1" value={material.menge} onChange={(e) => setMaterial({ ...material, menge: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground/70 ml-1">Auftrag (optional)</p>
                <SearchableSelect
                  value={material.auftrag_id}
                  onChange={(v) => setMaterial({ ...material, auftrag_id: v })}
                  items={[
                    { id: "", label: "Kein Auftrag" },
                    ...jobs.map((j) => ({ id: j.id, label: `INT-${j.job_number} — ${j.title}` })),
                  ]}
                  clearable={false}
                />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground/70 ml-1">Betrag (CHF)</p>
                <Input type="number" step="0.05" value={material.betrag_chf} onChange={(e) => setMaterial({ ...material, betrag_chf: e.target.value })} placeholder="z.B. 24.50" />
                <p className="text-[10px] text-muted-foreground/70 ml-1 mt-1">
                  Genauer Betrag — entweder hier eintragen <strong>oder</strong> ein Bild/eine Datei hochladen wo er ersichtlich ist.
                </p>
              </div>
            </div>
          )}

          {/* Beschreibung — universal */}
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground/70 ml-1">
              {type === "it" ? "Problem-Beschreibung *" : "Beschreibung / Notiz"}
            </p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-card resize-none"
            />
          </div>

          {/* File-Upload */}
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground/70 ml-1">
              {type === "beleg"
                ? "Beleg-Foto oder PDF *"
                : type === "material"
                  ? "Anhänge (Foto / Quittung)"
                  : "Anhänge"}
            </p>
            <label className="kasten kasten-muted cursor-pointer w-full justify-center">
              <Upload className="h-3.5 w-3.5" />
              Datei wählen (Bild oder PDF)
              <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={handleFiles}
                className="hidden"
              />
            </label>
            {files.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/40">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
                    <span className="text-xs flex-1 truncate">{f.name}</span>
                    <span className="text-[10px] text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                    <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-red-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* KI-Analyse-Status fuer Beleg */}
            {type === "beleg" && analyzing && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/[0.08] border border-blue-500/20 text-blue-700 dark:text-blue-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                <span className="text-xs">Beleg wird analysiert…</span>
              </div>
            )}
            {type === "beleg" && !analyzing && analysisDone && analysisIssues.length === 0 && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/[0.08] border border-green-500/20 text-green-700 dark:text-green-300">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs">Beleg ist klar lesbar — Felder vorausgefüllt, gerne anpassen.</span>
              </div>
            )}
            {type === "beleg" && !analyzing && analysisIssues.length > 0 && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-amber-500/[0.08] border border-amber-500/30">
                <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-0.5 flex-1">
                    <p className="font-medium">KI-Hinweis:</p>
                    {analysisIssues.map((iss, i) => (
                      <p key={i}>· {iss}</p>
                    ))}
                    <p className="text-[10px] opacity-75 mt-1">
                      Du kannst die Felder manuell ausfüllen oder ein besseres Foto hochladen.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setStep("pick")} disabled={saving} className="kasten kasten-muted flex-1">
              Zurück
            </button>
            <button type="button" onClick={submit} disabled={saving} className="kasten kasten-red flex-1">
              {saving ? "Erstellt…" : "Ticket einreichen"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
