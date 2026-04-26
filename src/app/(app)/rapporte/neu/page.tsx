"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignaturePad } from "@/components/signature-pad";
import { ArrowLeft, Save, Plus, Trash2, Camera, Image as ImageIcon, X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface JobWithDetails {
  id: string;
  title: string;
  job_number: number | null;
  customer: { name: string } | null;
  location: { name: string } | null;
}

interface TimeRange {
  date: string;
  start: string;
  end: string;
  pause: number;
}

interface PhotoFile {
  file: File;
  preview: string;
  caption: string;
}

export default function NeuerRapportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedJobId = searchParams.get("job_id") || "";
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [jobs, setJobs] = useState<JobWithDetails[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobWithDetails | null>(null);
  const [form, setForm] = useState({
    job_id: preselectedJobId,
    work_description: "",
    equipment_used: "",
    issues: "",
    client_name: "",
    technician_name: "",
  });
  const [timeRanges, setTimeRanges] = useState<TimeRange[]>([
    { date: new Date().toISOString().split("T")[0], start: "08:00", end: "17:00", pause: 30 },
  ]);
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [clientSignature, setClientSignature] = useState("");
  const [techSignature, setTechSignature] = useState("");
  const [signerType, setSignerType] = useState<"kunde" | "mieter">("kunde");
  const [signerRole, setSignerRole] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("jobs")
        .select("id, title, job_number, customer:customers(name), location:locations(name)")
        .order("created_at", { ascending: false });
      if (data) {
        const jobList = data as unknown as JobWithDetails[];
        setJobs(jobList);
        if (preselectedJobId) {
          const found = jobList.find((j) => j.id === preselectedJobId);
          if (found) {
            setSelectedJob(found);
            const locName = (found.location as any)?.name?.toLowerCase() || "";
            const isOwnVenue = ["scala", "bau3", "barakuba"].some((v) => locName.includes(v));
            setForm((f) => ({
              ...f,
              job_id: preselectedJobId,
              client_name: isOwnVenue ? "" : (found.customer?.name || ""),
            }));
            if (isOwnVenue) setSignerType("mieter");
          }
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
        if (profile) setForm((f) => ({ ...f, technician_name: profile.full_name }));
      }
    }
    load();
  }, []);

  function update(field: string, value: string) { setForm((p) => ({ ...p, [field]: value })); }

  function handleJobChange(jobId: string) {
    setForm((f) => ({ ...f, job_id: jobId }));
    const found = jobs.find((j) => j.id === jobId);
    setSelectedJob(found || null);
    const locName = (found?.location as any)?.name?.toLowerCase() || "";
    const isOwnVenue = ["scala", "bau3", "barakuba"].some((v) => locName.includes(v));
    setSignerType(isOwnVenue ? "mieter" : "kunde");
    if (found?.customer?.name) {
      setForm((f) => ({ ...f, job_id: jobId, client_name: isOwnVenue ? "" : (found.customer?.name || "") }));
    }
  }

  // Zeiträume
  function addTimeRange() {
    const last = timeRanges[timeRanges.length - 1];
    setTimeRanges([...timeRanges, {
      date: last?.date || new Date().toISOString().split("T")[0],
      start: "08:00", end: "17:00", pause: 30,
    }]);
  }

  function removeTimeRange(index: number) {
    if (timeRanges.length <= 1) return;
    setTimeRanges(timeRanges.filter((_, i) => i !== index));
  }

  function updateTimeRange(index: number, field: keyof TimeRange, value: string | number) {
    setTimeRanges(timeRanges.map((tr, i) => i === index ? { ...tr, [field]: value } : tr));
  }

  function calcDuration(tr: TimeRange): string {
    const [sh, sm] = tr.start.split(":").map(Number);
    const [eh, em] = tr.end.split(":").map(Number);
    const totalMin = (eh * 60 + em) - (sh * 60 + sm) - tr.pause;
    if (totalMin <= 0) return "–";
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h ${m > 0 ? m + "m" : ""}`.trim();
  }

  function calcTotalHours(): string {
    let totalMin = 0;
    for (const tr of timeRanges) {
      const [sh, sm] = tr.start.split(":").map(Number);
      const [eh, em] = tr.end.split(":").map(Number);
      totalMin += (eh * 60 + em) - (sh * 60 + sm) - tr.pause;
    }
    if (totalMin <= 0) return "0h";
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h ${m > 0 ? m + "m" : ""}`.trim();
  }

  // Fotos
  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    const newPhotos: PhotoFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      newPhotos.push({
        file,
        preview: URL.createObjectURL(file),
        caption: "",
      });
    }
    setPhotos((prev) => [...prev, ...newPhotos]);
    e.target.value = "";
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  function updateCaption(index: number, caption: string) {
    setPhotos((prev) => prev.map((p, i) => i === index ? { ...p, caption } : p));
  }

  async function uploadPhoto(photo: PhotoFile, reportId: string, sortOrder: number): Promise<boolean> {
    const ext = photo.file.name.split(".").pop() || "jpg";
    const path = `rapport-photos/${reportId}/${sortOrder}.${ext}`;
    const { error } = await supabase.storage.from("documents").upload(path, photo.file, {
      contentType: photo.file.type,
    });
    if (error) return false;

    await supabase.from("report_photos").insert({
      report_id: reportId,
      storage_path: path,
      caption: photo.caption || null,
      sort_order: sortOrder,
    });
    return true;
  }

  async function uploadSignature(dataUrl: string, folder: string): Promise<string | null> {
    if (!dataUrl) return null;
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${folder}/${Date.now()}.png`;
    const { error } = await supabase.storage.from("documents").upload(path, blob, { contentType: "image/png" });
    if (error) return null;
    return path;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();

    const [clientSigPath, techSigPath] = await Promise.all([
      uploadSignature(clientSignature, "signatures/client"),
      uploadSignature(techSignature, "signatures/tech"),
    ]);

    const { data: report, error } = await supabase.from("service_reports").insert({
      job_id: form.job_id,
      created_by: user?.id,
      report_date: timeRanges[0]?.date || new Date().toISOString().split("T")[0],
      work_description: form.work_description,
      equipment_used: form.equipment_used || null,
      issues: form.issues || null,
      client_name: form.client_name ? (signerType === "mieter" && signerRole ? `${form.client_name} (${signerRole})` : form.client_name) : null,
      signature_url: clientSigPath,
      technician_name: form.technician_name || null,
      technician_signature_url: techSigPath,
      time_ranges: timeRanges,
      status: "abgeschlossen",
    }).select("id").single();

    if (error) {
      toast.error("Fehler: " + error.message);
      setSaving(false);
      return;
    }

    // Auftrag auf 'abgeschlossen' setzen — passiert ERST jetzt, nicht beim Klick
    // auf 'Abschliessen' in der Auftrag-Detail-Page (sonst bleibt der Auftrag
    // fälschlich geschlossen wenn der User den Rapport abbricht).
    if (form.job_id) {
      await supabase.from("jobs").update({ status: "abgeschlossen" }).eq("id", form.job_id);
      window.dispatchEvent(new Event("jobs:invalidate"));
    }

    // Fotos hochladen
    if (report?.id && photos.length > 0) {
      toast.info(`${photos.length} Foto(s) werden hochgeladen...`);
      for (let i = 0; i < photos.length; i++) {
        await uploadPhoto(photos[i], report.id, i);
      }
    }

    toast.success("Rapport gespeichert – PDF wird generiert...");

    if (report?.id) {
      try {
        const res = await fetch(`/api/reports/${report.id}/send-invoice`, { method: "POST" });
        const result = await res.json();
        if (result.emailSent) {
          toast.success("PDF erstellt & E-Mail gesendet");
        } else {
          toast.success("PDF erstellt und am Auftrag gespeichert");
        }
      } catch {
        toast.info("Rapport gespeichert, PDF-Generierung wird nachgeholt");
      }
    }

    router.push(preselectedJobId ? `/auftraege/${preselectedJobId}` : "/rapporte");
  }

  return (
    <div className="max-w-2xl space-y-6 mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/rapporte"><button className="p-2 rounded-lg hover:bg-card transition-colors"><ArrowLeft className="h-5 w-5" /></button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Einsatzrapport</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {selectedJob?.job_number ? `Auftrag INT-${selectedJob.job_number}` : "Rapport erfassen"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Auftrag */}
        <Card className="bg-card">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Auftrag</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Auftrag *</Label>
              <select value={form.job_id} onChange={(e) => handleJobChange(e.target.value)} className="mt-1.5 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500" required>
                <option value="">Auftrag auswählen...</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.job_number ? `INT-${j.job_number} – ` : ""}{j.title}
                  </option>
                ))}
              </select>
            </div>
            {selectedJob && (
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-1">
                {selectedJob.job_number && <div className="text-xs"><span className="font-medium">Auftragsnr.:</span> INT-{selectedJob.job_number}</div>}
                {selectedJob.customer?.name && <div className="text-xs"><span className="font-medium">Kunde:</span> {selectedJob.customer.name}</div>}
                {selectedJob.location?.name && <div className="text-xs"><span className="font-medium">Standort:</span> {selectedJob.location.name}</div>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Zeiträume */}
        <Card className="bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Einsatzzeiten</CardTitle>
              <span className="text-xs font-semibold text-red-600">Total: {calcTotalHours()}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {timeRanges.map((tr, i) => (
              <div key={i} className="p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">
                    {timeRanges.length > 1 ? `Tag ${i + 1}` : "Einsatztag"}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600">{calcDuration(tr)}</span>
                    {timeRanges.length > 1 && (
                      <button type="button" onClick={() => removeTimeRange(i)} className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Datum</label>
                    <Input type="date" value={tr.date} onChange={(e) => updateTimeRange(i, "date", e.target.value)} className="mt-1 bg-card border-gray-200 text-xs h-8" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Von</label>
                    <Input type="time" value={tr.start} onChange={(e) => updateTimeRange(i, "start", e.target.value)} className="mt-1 bg-card border-gray-200 text-xs h-8" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Bis</label>
                    <Input type="time" value={tr.end} onChange={(e) => updateTimeRange(i, "end", e.target.value)} className="mt-1 bg-card border-gray-200 text-xs h-8" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Pause (Min)</label>
                    <Input type="number" min={0} step={5} value={tr.pause} onChange={(e) => updateTimeRange(i, "pause", parseInt(e.target.value) || 0)} className="mt-1 bg-card border-gray-200 text-xs h-8" />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addTimeRange}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm font-medium text-gray-400 hover:border-red-300 hover:text-red-500 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Weiteren Tag hinzufügen
            </button>
          </CardContent>
        </Card>

        {/* Arbeit */}
        <Card className="bg-card">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Ausgeführte Arbeiten</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Arbeitsbeschreibung *</Label>
              <textarea placeholder="Was wurde gemacht?" value={form.work_description} onChange={(e) => update("work_description", e.target.value)} className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500" rows={5} required />
            </div>
            <div>
              <Label>Eingesetztes Material / Equipment</Label>
              <textarea placeholder="Welche Geräte/Material wurden verwendet?" value={form.equipment_used} onChange={(e) => update("equipment_used", e.target.value)} className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500" rows={3} />
            </div>
            <div>
              <Label>Probleme / Bemerkungen</Label>
              <textarea placeholder="Gab es Probleme oder besondere Vorkommnisse?" value={form.issues} onChange={(e) => update("issues", e.target.value)} className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500" rows={3} />
            </div>
          </CardContent>
        </Card>

        {/* Fotos */}
        <Card className="bg-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Fotos</CardTitle>
              {photos.length > 0 && <span className="text-xs text-muted-foreground">{photos.length} Foto{photos.length !== 1 ? "s" : ""}</span>}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Foto-Vorschau */}
            {photos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((photo, i) => (
                  <div key={i} className="relative group rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
                    <div className="aspect-square relative">
                      <img
                        src={photo.preview}
                        alt={`Foto ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Beschreibung..."
                      value={photo.caption}
                      onChange={(e) => updateCaption(i, e.target.value)}
                      className="w-full px-2.5 py-2 text-xs border-t border-gray-100 bg-card focus:outline-none focus:bg-gray-50"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Foto-Buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm font-medium text-gray-400 hover:border-red-300 hover:text-red-500 transition-colors"
              >
                <Camera className="h-5 w-5" />
                Foto aufnehmen
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-200 text-sm font-medium text-gray-400 hover:border-red-300 hover:text-red-500 transition-colors"
              >
                <ImageIcon className="h-5 w-5" />
                Aus Galerie
              </button>
            </div>

            {/* Hidden File Inputs */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoSelect}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoSelect}
              className="hidden"
            />
          </CardContent>
        </Card>

        {/* Unterschriften */}
        <Card className="bg-card">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-muted-foreground">Unterschriften</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="mb-2">
                <Label>Service-Techniker</Label>
                <Input placeholder="Name Techniker" value={form.technician_name} onChange={(e) => update("technician_name", e.target.value)} className="mt-1.5 bg-gray-50 border-gray-200" />
              </div>
              <SignaturePad label="Unterschrift Techniker" onSave={setTechSignature} />
            </div>
            <div className="border-t border-gray-100" />
            <div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <button type="button" onClick={() => setSignerType("kunde")} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${signerType === "kunde" ? "bg-black text-white border-black" : "bg-card text-gray-600 border-gray-200"}`}>
                  Kunde / Auftraggeber
                </button>
                <button type="button" onClick={() => setSignerType("mieter")} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${signerType === "mieter" ? "bg-red-600 text-white border-red-600" : "bg-card text-gray-600 border-gray-200"}`}>
                  Mieter vor Ort
                </button>
              </div>
              <div className="mb-2">
                <Label>{signerType === "mieter" ? "Mieter / Person vor Ort" : "Kunde / Auftraggeber"}</Label>
                <Input placeholder={signerType === "mieter" ? "Name Mieter vor Ort" : "Name Kunde"} value={form.client_name} onChange={(e) => update("client_name", e.target.value)} className="mt-1.5 bg-gray-50 border-gray-200" />
              </div>
              {signerType === "mieter" && (
                <div className="mb-2">
                  <Label>Funktion / Rolle (optional)</Label>
                  <Input placeholder="z.B. Veranstalter, Produktionsleitung, Regie..." value={signerRole} onChange={(e) => setSignerRole(e.target.value)} className="mt-1.5 bg-gray-50 border-gray-200" />
                </div>
              )}
              <SignaturePad label={signerType === "mieter" ? "Unterschrift Mieter vor Ort" : "Unterschrift Kunde"} onSave={setClientSignature} />
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex gap-3 pt-2">
          <Link
            href={preselectedJobId ? `/auftraege/${preselectedJobId}` : "/rapporte"}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl ring-1 ring-foreground/10 bg-card text-foreground/70 hover:text-foreground hover:bg-foreground/[0.03] transition-all"
          >
            Abbrechen
          </Link>
          <button
            type="submit"
            disabled={!form.job_id || !form.work_description || saving}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl ring-1 ring-foreground/10 bg-card text-red-700 dark:text-red-300 hover:bg-foreground/[0.03] transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            <Save className="h-3.5 w-3.5" />{saving ? "Speichern..." : "Rapport abschliessen"}
          </button>
        </div>
      </form>
    </div>
  );
}
