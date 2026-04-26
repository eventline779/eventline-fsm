"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/searchable-select";
import { EVENT_TYPES } from "@/lib/constants";
import type { Customer, Location } from "@/types";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { popFormDraft, saveFormDraft } from "@/lib/form-resume";

const RETURN_PATH = "/anfragen/neu";

interface DraftForm {
  customer_id: string;
  location_id: string;
  title: string;
  event_type: string;
  guest_count: string;
  start_date: string;
  end_date: string;
  description: string;
  extended_services: string;
  eventTypeCustom: boolean;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function NeueAnfragePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [nextJobNumber, setNextJobNumber] = useState<number | null>(null);

  const [form, setForm] = useState({
    customer_id: "",
    location_id: "",
    title: "",
    event_type: "",
    guest_count: "",
    start_date: "",
    end_date: "",
    description: "",
    extended_services: "",
  });
  // Event-Typ: Toggle zwischen Preset-Auswahl und Sonstige (Freitext)
  const [eventTypeCustom, setEventTypeCustom] = useState(false);

  // Draft wiederherstellen, falls wir gerade von /kunden/neu zurueckkommen.
  // Lauft synchron in der ersten Render-Runde, damit das Formular sofort den
  // gespeicherten Stand zeigt (sonst flackert der leere Default kurz auf).
  useEffect(() => {
    const newCustomerId = searchParams.get("customerId");
    if (!newCustomerId) return;
    const draft = popFormDraft<DraftForm>(RETURN_PATH);
    if (draft) {
      setForm({
        customer_id: newCustomerId,
        location_id: draft.location_id,
        title: draft.title,
        event_type: draft.event_type,
        guest_count: draft.guest_count,
        start_date: draft.start_date,
        end_date: draft.end_date,
        description: draft.description,
        extended_services: draft.extended_services,
      });
      setEventTypeCustom(draft.eventTypeCustom);
    } else {
      // Kein Draft (z.B. neu geoeffneter Tab) — wenigstens den frischen Kunden setzen
      setForm((p) => ({ ...p, customer_id: newCustomerId }));
    }
    // Query-Param entfernen, damit Reload nicht erneut "wiederherstellt"
    router.replace(RETURN_PATH, { scroll: false });
  }, [searchParams, router]);

  useEffect(() => {
    async function load() {
      const [c, l, m] = await Promise.all([
        supabase.from("customers").select("id, name").eq("is_active", true).order("name"),
        supabase.from("locations").select("id, name, address_street, address_zip, address_city").eq("is_active", true).order("name"),
        supabase.from("jobs").select("job_number").not("job_number", "is", null).order("job_number", { ascending: false }).limit(1),
      ]);
      setCustomers((c.data as Customer[]) ?? []);
      setLocations((l.data as Location[]) ?? []);
      const maxRow = m.data?.[0] as { job_number: number } | undefined;
      setNextJobNumber(maxRow?.job_number ? maxRow.job_number + 1 : 26200);
    }
    load();
  }, []);

  function startCreateCustomer(query: string) {
    saveFormDraft<DraftForm>(RETURN_PATH, { ...form, eventTypeCustom });
    const url = `/kunden/neu?prefillName=${encodeURIComponent(query)}&return=${encodeURIComponent(RETURN_PATH)}`;
    router.push(url);
  }

  function update<K extends keyof typeof form>(field: K, value: typeof form[K]) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Titel ist Pflicht"); return; }
    if (!form.customer_id) { toast.error("Kunde ist Pflicht"); return; }
    if (!form.location_id) { toast.error("Location ist Pflicht"); return; }
    if (!form.event_type.trim()) { toast.error("Veranstaltungstyp ist Pflicht"); return; }
    if (!form.guest_count.trim()) { toast.error("Personenanzahl ist Pflicht"); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: inserted, error } = await supabase
      .from("jobs")
      .insert({
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: "anfrage",
        priority: "normal",
        job_type: "location",
        customer_id: form.customer_id,
        location_id: form.location_id,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        request_step: 1,
        event_type: form.event_type.trim(),
        guest_count: parseInt(form.guest_count, 10),
        extended_services: form.extended_services.trim() || null,
        was_anfrage: true,
        created_by: user?.id,
      })
      .select("id, job_number")
      .single();
    if (error || !inserted) {
      toast.error("Fehler: " + (error?.message ?? "konnte nicht angelegt werden"));
      setSaving(false);
      return;
    }
    toast.success(`Mietanfrage INT-${inserted.job_number} angelegt`);
    window.dispatchEvent(new Event("jobs:invalidate"));
    router.push(`/anfragen/${inserted.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/auftraege">
          <button className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
        </Link>
        {nextJobNumber ? (
          <span className="font-mono font-semibold text-xl px-3 py-1 rounded inline-flex items-center bg-foreground/[0.08]">INT-{nextJobNumber}</span>
        ) : (
          <span className="font-mono text-xl font-semibold text-muted-foreground">INT-…</span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-5 space-y-5">
        {/* Was */}
        <div className="space-y-2">
          <SectionLabel>Titel *</SectionLabel>
          <Input
            placeholder="z.B. Hochzeit Müller, Konzert Stadthalle"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <SectionLabel>Beschreibung</SectionLabel>
          <textarea
            placeholder="Was hat der Kunde angefragt? (Originaltext, ggf. zusammengefasst)"
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            rows={3}
            style={{ fieldSizing: "content" } as React.CSSProperties}
            className="w-full px-3 py-1.5 text-sm rounded-xl border bg-background resize-none transition-all hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
          />
        </div>

        <hr className="border-border/50" />

        {/* Wer */}
        <div className="space-y-2">
          <SectionLabel>Kunde *</SectionLabel>
          <SearchableSelect
            value={form.customer_id}
            onChange={(id) => update("customer_id", id)}
            items={(customers ?? []).map((c) => ({ id: c.id, label: c.name }))}
            placeholder="Kunde tippen…"
            required
            onCreateNew={startCreateCustomer}
            createNewLabel="Neuer Kunde"
          />
          {customers !== null && customers.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Noch keine Kunden — einfach Namen tippen und „Neuer Kunde" aus dem Vorschlag wählen.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <SectionLabel>Location *</SectionLabel>
          <SearchableSelect
            value={form.location_id}
            onChange={(id) => update("location_id", id)}
            items={(locations ?? []).map((l) => ({
              id: l.id,
              label: l.name,
              sub: [l.address_street, l.address_zip, l.address_city].filter(Boolean).join(", "),
            }))}
            placeholder="Location auswählen…"
            required
          />
          {locations !== null && locations.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Noch keine Locations.{" "}
              <Link href="/standorte" className="underline">Jetzt anlegen</Link>
            </p>
          )}
        </div>

        <hr className="border-border/50" />

        {/* Wann */}
        <div className="space-y-2">
          <SectionLabel>Event-Datum (geplant)</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground/70 ml-1">Start</p>
              <Input type="date" value={form.start_date} onChange={(e) => update("start_date", e.target.value)} />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground/70 ml-1">Ende</p>
              <Input type="date" value={form.end_date} onChange={(e) => update("end_date", e.target.value)} min={form.start_date || undefined} />
            </div>
          </div>
        </div>

        <hr className="border-border/50" />

        {/* Veranstaltungstyp — Preset-Pills + "Sonstige" mit Freitext */}
        <div className="space-y-2">
          <SectionLabel>Veranstaltungstyp *</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {EVENT_TYPES.map((t) => {
              const active = !eventTypeCustom && form.event_type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setEventTypeCustom(false); update("event_type", t); }}
                  className={`px-3 py-2 rounded-xl border text-sm transition-all ${
                    active
                      ? "bg-foreground/[0.08] border-foreground/40 font-semibold"
                      : "border-border text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => { setEventTypeCustom(true); update("event_type", ""); }}
              className={`px-3 py-2 rounded-xl border text-sm transition-all ${
                eventTypeCustom
                  ? "bg-foreground/[0.08] border-foreground/40 font-semibold"
                  : "border-border text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
              }`}
            >
              Sonstige…
            </button>
          </div>
          {eventTypeCustom && (
            <Input
              placeholder="z.B. Workshop, Generalversammlung, Vereinsfeier"
              value={form.event_type}
              onChange={(e) => update("event_type", e.target.value)}
              autoFocus
            />
          )}
        </div>

        {/* Personenanzahl */}
        <div className="space-y-2">
          <SectionLabel>Personen (geplant) *</SectionLabel>
          <Input
            type="number"
            placeholder="z.B. 80"
            value={form.guest_count}
            onChange={(e) => update("guest_count", e.target.value)}
            required
            min={1}
          />
        </div>

        <div className="space-y-2">
          <SectionLabel>Zusatzleistungen</SectionLabel>
          <textarea
            placeholder="z.B. Tontechnik, Lichttechnik, Catering, Reinigung…"
            value={form.extended_services}
            onChange={(e) => update("extended_services", e.target.value)}
            rows={2}
            style={{ fieldSizing: "content" } as React.CSSProperties}
            className="w-full px-3 py-1.5 text-sm rounded-xl border bg-background resize-none transition-all hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Link href="/auftraege" className="flex-1">
            <Button type="button" variant="outline" size="sm" className="w-full">
              Abbrechen
            </Button>
          </Link>
          <Button
            type="submit"
            size="sm"
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? "Anlegen…" : "Vermietung anlegen"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NeueAnfragePage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-muted-foreground">Laden…</div>}>
      <NeueAnfragePageContent />
    </Suspense>
  );
}
