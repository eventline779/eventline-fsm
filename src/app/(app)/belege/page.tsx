"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Receipt, Upload, Camera, Image as ImageIcon, Send, X, Check, Mail } from "lucide-react";
import { toast } from "sonner";

export default function BelegePage() {
  const [file, setFile] = useState<{ file: File; preview: string } | null>(null);
  const [form, setForm] = useState({ date: new Date().toISOString().split("T")[0], reason: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ reason: string; date: string; sentAt: string }[]>([]);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    const saved = localStorage.getItem("belege-sent");
    if (saved) {
      try { setSent(JSON.parse(saved)); } catch {}
    }
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile({ file: f, preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : "" });
    e.target.value = "";
  }

  async function sendBeleg() {
    if (!file || !form.reason.trim()) { toast.error("Datei und Grund sind erforderlich"); return; }
    setSending(true);

    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user?.id).single();

    // Upload
    const safeName = file.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `belege/${user?.id}/${Date.now()}_${safeName}`;
    try {
      const formData = new FormData();
      formData.append("file", file.file);
      formData.append("path", path);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!json.success) { toast.error("Upload-Fehler: " + (json.error || "Unbekannt")); setSending(false); return; }
    } catch { toast.error("Upload fehlgeschlagen"); setSending(false); return; }

    // Email senden
    try {
      const emailRes = await fetch("/api/invoices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: path,
          fileName: file.file.name,
          date: form.date,
          reason: form.reason,
          creatorName: profile?.full_name || "Unbekannt",
        }),
      });
      const emailJson = await emailRes.json();
      if (emailJson.success) {
        toast.success("Beleg an Buchhaltung gesendet");
        const newEntry = { reason: form.reason, date: form.date, sentAt: new Date().toISOString() };
        const updated = [newEntry, ...sent].slice(0, 20);
        setSent(updated);
        localStorage.setItem("belege-sent", JSON.stringify(updated));
        if (file.preview) URL.revokeObjectURL(file.preview);
        setFile(null);
        setForm({ date: new Date().toISOString().split("T")[0], reason: "" });
      } else {
        toast.error("E-Mail-Fehler: " + (emailJson.error || "Unbekannt"));
      }
    } catch { toast.error("E-Mail senden fehlgeschlagen"); }
    setSending(false);
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Belege</h1>
        <p className="text-sm text-muted-foreground mt-1">Kassenzettel hochladen oder abfotografieren — wird an <strong>buchhaltung@eventline-basel.com</strong> gesendet.</p>
      </div>

      <Card className="bg-card">
        <CardContent className="p-5 space-y-4">
          {/* Datei-Upload */}
          {!file ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">Beleg auswählen</label>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => cameraRef.current?.click()} className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-200 text-xs font-medium text-gray-500 hover:border-red-300 hover:text-red-500 transition-colors">
                  <Camera className="h-6 w-6" />Foto aufnehmen
                </button>
                <button type="button" onClick={() => galleryRef.current?.click()} className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-200 text-xs font-medium text-gray-500 hover:border-red-300 hover:text-red-500 transition-colors">
                  <ImageIcon className="h-6 w-6" />Aus Galerie
                </button>
                <button type="button" onClick={() => pdfRef.current?.click()} className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-200 text-xs font-medium text-gray-500 hover:border-red-300 hover:text-red-500 transition-colors">
                  <Upload className="h-6 w-6" />PDF hochladen
                </button>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
              <input ref={galleryRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
              <input ref={pdfRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" onChange={handleFile} className="hidden" />
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-gray-200">
              {file.preview ? (
                <img src={file.preview} alt="Beleg" className="w-full h-auto max-h-80 object-contain bg-gray-50" />
              ) : (
                <div className="p-6 bg-gray-50 text-center">
                  <Receipt className="h-10 w-10 text-gray-400 mx-auto" />
                  <p className="text-sm font-medium mt-2">{file.file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.file.size / 1024).toFixed(1)} KB</p>
                </div>
              )}
              <button type="button" onClick={() => { if (file.preview) URL.revokeObjectURL(file.preview); setFile(null); }} className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-red-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Datum */}
          <div>
            <label className="text-sm font-medium">Datum *</label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1.5 bg-gray-50" required />
          </div>

          {/* Grund */}
          <div>
            <label className="text-sm font-medium">Grund *</label>
            <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="z.B. Material für Auftrag INT-2620, Tankfüllung, Büromaterial..." className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500" rows={3} required />
          </div>

          <button
            type="button"
            onClick={sendBeleg}
            disabled={!file || !form.reason.trim() || sending}
            className="kasten kasten-red w-full"
          >
            <Send className="h-3.5 w-3.5" />{sending ? "Senden..." : "An Buchhaltung senden"}
          </button>
        </CardContent>
      </Card>

      {/* Verlauf */}
      {sent.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />Zuletzt gesendet</h2>
          <div className="space-y-2">
            {sent.map((s, i) => (
              <Card key={i} className="bg-card">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-50 text-green-600 shrink-0"><Check className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{s.reason}</p>
                    <p className="text-xs text-muted-foreground">{new Date(s.date).toLocaleDateString("de-CH")} · gesendet {new Date(s.sentAt).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
