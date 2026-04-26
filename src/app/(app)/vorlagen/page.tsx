"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Plus, Send, Pencil, Trash2, Eye, Variable } from "lucide-react";
import { toast } from "sonner";

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  bestätigung: {
    label: "Bestätigung",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  absage: {
    label: "Absage",
    color: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  },
  info: {
    label: "Info",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  },
  angebot: {
    label: "Angebot",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  vertrag: {
    label: "Vertrag",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  },
  rechnung: {
    label: "Rechnung",
    color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  },
  sonstiges: {
    label: "Sonstiges",
    color: "bg-zinc-100 text-zinc-700 dark:bg-zinc-500/15 dark:text-zinc-300",
  },
};

const AVAILABLE_VARS = [
  { key: "{{kunde_name}}", desc: "Name des Kunden" },
  { key: "{{location_name}}", desc: "Veranstaltungsort" },
  { key: "{{event_datum}}", desc: "Datum der Veranstaltung" },
  { key: "{{event_typ}}", desc: "Typ der Veranstaltung" },
  { key: "{{personen_anzahl}}", desc: "Anzahl Personen" },
  { key: "{{nachricht}}", desc: "Freie Nachricht" },
  { key: "{{ansprechperson}}", desc: "Ansprechperson Eventline" },
];

const SAMPLE_VALUES: Record<string, string> = {
  "{{kunde_name}}": "Maria Beispiel",
  "{{location_name}}": "Theater BAU3",
  "{{event_datum}}": "15. Mai 2026",
  "{{event_typ}}": "Geburtstag",
  "{{personen_anzahl}}": "85",
  "{{nachricht}}": "[hier deine Nachricht]",
  "{{ansprechperson}}": "Leo",
};

type Template = {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  type: string;
};

const EMPTY_FORM = { name: "", subject: "", body_html: "", type: "info" };

export default function VorlagenPage() {
  const supabase = createClient();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPreview, setShowPreview] = useState<Template | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabase
      .from("email_templates")
      .select("*")
      .order("type")
      .order("name");
    setTemplates((data as Template[]) ?? []);
    setLoading(false);
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(t: Template) {
    setEditing(t);
    setForm({
      name: t.name,
      subject: t.subject,
      body_html: t.body_html,
      type: t.type,
    });
    setShowForm(true);
  }

  function insertVariable(v: string) {
    const ta = bodyRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = form.body_html.slice(0, start);
    const after = form.body_html.slice(end);
    const next = before + v + after;
    setForm({ ...form, body_html: next });
    setTimeout(() => {
      ta.focus();
      const pos = start + v.length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.subject.trim() || !form.body_html.trim()) {
      toast.error("Bitte Name, Betreff und Inhalt ausfüllen");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      subject: form.subject.trim(),
      body_html: form.body_html,
      type: form.type,
    };
    if (editing) {
      const { error } = await supabase
        .from("email_templates")
        .update(payload)
        .eq("id", editing.id);
      if (error) {
        toast.error("Fehler beim Speichern");
        setSaving(false);
        return;
      }
      toast.success("Vorlage aktualisiert");
    } else {
      const { error } = await supabase.from("email_templates").insert(payload);
      if (error) {
        toast.error("Fehler beim Anlegen");
        setSaving(false);
        return;
      }
      toast.success("Vorlage angelegt");
    }
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function handleDelete(t: Template) {
    if (!confirm(`Vorlage "${t.name}" wirklich löschen?`)) return;
    const { error } = await supabase.from("email_templates").delete().eq("id", t.id);
    if (error) {
      toast.error("Fehler beim Löschen");
      return;
    }
    toast.success("Vorlage gelöscht");
    load();
  }

  function renderPreview(html: string) {
    let out = html;
    for (const [k, v] of Object.entries(SAMPLE_VALUES)) {
      out = out.split(k).join(v);
    }
    return out;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            E-Mail-Vorlagen
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Wiederverwendbare Vorlagen für Bestätigungen, Absagen, Angebote, Rechnungen.
            Variablen wie <code className="px-1 py-0.5 rounded bg-muted">{"{{kunde_name}}"}</code>{" "}
            werden beim Versand ersetzt.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="kasten kasten-red"
        >
          <Plus className="h-3.5 w-3.5" />
          Neue Vorlage
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-44 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Send className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Noch keine Vorlagen.</p>
          <button
            type="button"
            onClick={openNew}
            className="mt-4 kasten kasten-red"
          >
            Erste Vorlage anlegen
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {templates.map((t) => {
            const typeMeta = TYPE_LABELS[t.type] ?? TYPE_LABELS.sonstiges;
            return (
              <Card key={t.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate">{t.name}</h3>
                      <span
                        className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium ${typeMeta.color}`}
                      >
                        {typeMeta.label}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setShowPreview(t)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                        title="Vorschau"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => openEdit(t)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                        title="Bearbeiten"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(t)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        title="Löschen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground">Betreff</p>
                    <p className="text-sm truncate">{t.subject}</p>
                  </div>

                  <div className="mt-2 pt-2 border-t">
                    <div
                      className="text-xs text-muted-foreground line-clamp-3"
                      dangerouslySetInnerHTML={{
                        __html: t.body_html.replace(/<[^>]+>/g, " "),
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit form */}
      <Sheet open={showForm} onOpenChange={setShowForm}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Vorlage bearbeiten" : "Neue Vorlage"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSave} className="px-4 pb-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Label htmlFor="t-name">Name *</Label>
                <Input
                  id="t-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="z.B. Buchungsbestätigung Standard"
                  required
                />
              </div>
              <div>
                <Label htmlFor="t-type">Kategorie</Label>
                <select
                  id="t-type"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full h-9 rounded-lg border bg-background px-3 text-sm"
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="t-subject">Betreff *</Label>
              <Input
                id="t-subject"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Ihre Buchung bei EVENTLINE – Bestätigung"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="t-body">Inhalt (HTML) *</Label>
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Variable className="h-3 w-3" /> Variable einfügen:
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {AVAILABLE_VARS.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    className="text-[11px] font-mono px-2 py-0.5 rounded bg-muted hover:bg-muted/70 transition"
                    title={v.desc}
                  >
                    {v.key}
                  </button>
                ))}
              </div>
              <textarea
                id="t-body"
                ref={bodyRef}
                value={form.body_html}
                onChange={(e) => setForm({ ...form, body_html: e.target.value })}
                rows={12}
                className="w-full rounded-lg border bg-background p-3 text-sm font-mono leading-relaxed"
                placeholder="<p>Guten Tag {{kunde_name}},</p><p>...</p>"
                required
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                HTML wird unterstützt. Variablen werden beim E-Mail-Versand ersetzt.
              </p>
            </div>

            {form.body_html && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">
                  Vorschau (mit Beispieldaten):
                </p>
                <div
                  className="rounded-lg border bg-muted/20 p-4 prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{
                    __html: renderPreview(form.body_html),
                  }}
                />
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="kasten kasten-muted flex-1"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={saving}
                className="kasten kasten-red flex-1"
              >
                {saving ? "Speichert…" : editing ? "Speichern" : "Anlegen"}
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Preview-only sheet */}
      <Sheet
        open={!!showPreview}
        onOpenChange={(o) => !o && setShowPreview(null)}
      >
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Vorschau: {showPreview?.name}</SheetTitle>
          </SheetHeader>
          {showPreview && (
            <div className="px-4 pb-6 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">Betreff</p>
                <p className="text-sm font-medium">
                  {(() => {
                    let s = showPreview.subject;
                    for (const [k, v] of Object.entries(SAMPLE_VALUES))
                      s = s.split(k).join(v);
                    return s;
                  })()}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Inhalt</p>
                <div
                  className="rounded-lg border bg-background p-4 text-sm"
                  dangerouslySetInnerHTML={{
                    __html: renderPreview(showPreview.body_html),
                  }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground italic">
                Beispieldaten — beim echten Versand werden Variablen mit den Daten der
                Anfrage/des Auftrags ersetzt.
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
