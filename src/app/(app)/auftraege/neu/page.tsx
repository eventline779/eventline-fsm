"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { SearchableSelect } from "@/components/searchable-select";
import { ArrowLeft, Save, FileEdit } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

type Customer = { id: string; name: string };
type Location = {
  id: string;
  name: string;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
};
type JobType = "location" | "extern";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

export default function NeuerAuftragPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [saving, setSaving] = useState<"draft" | "create" | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [nextJobNumber, setNextJobNumber] = useState<number | null>(null);

  const [form, setForm] = useState({
    job_type: "location" as JobType,
    title: searchParams.get("title") || "",
    description: searchParams.get("description") || "",
    location_id: searchParams.get("location_id") || "",
    customer_id: searchParams.get("customer_id") || "",
    external_address: "",
    start_date: "",
    end_date: "",
    notes: "",
  });

  useEffect(() => {
    async function loadData() {
      const [custRes, locRes, maxRes] = await Promise.all([
        supabase.from("customers").select("id, name").eq("is_active", true).order("name"),
        supabase
          .from("locations")
          .select("id, name, address_street, address_zip, address_city")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("jobs")
          .select("job_number")
          .not("job_number", "is", null)
          .order("job_number", { ascending: false })
          .limit(1),
      ]);
      if (custRes.data) setCustomers(custRes.data as Customer[]);
      if (locRes.data) setLocations(locRes.data as Location[]);
      // Sequenz startet bei 26200 (Migration 011) — wenn noch keine Aufträge: 26200, sonst MAX+1
      const maxRow = maxRes.data?.[0] as { job_number: number } | undefined;
      setNextJobNumber(maxRow?.job_number ? maxRow.job_number + 1 : 26200);
    }
    loadData();
  }, []);

  function update<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function setJobType(t: JobType) {
    setForm((prev) => ({
      ...prev,
      job_type: t,
      location_id: t === "location" ? prev.location_id : "",
      customer_id: t === "extern" ? prev.customer_id : "",
      external_address: t === "extern" ? prev.external_address : "",
    }));
  }

  function validate(): string | null {
    if (!form.title.trim()) return "Titel ist Pflicht";
    if (form.job_type === "location" && !form.location_id) {
      return "Bitte eine Location auswählen";
    }
    if (form.job_type === "extern") {
      if (!form.customer_id) return "Bitte einen Kunden auswählen";
      if (!form.external_address.trim()) return "Bitte einen Ort angeben";
    }
    if (!form.start_date) return "Bitte Startdatum angeben";
    if (form.end_date && form.end_date < form.start_date) {
      return "Enddatum darf nicht vor dem Startdatum liegen";
    }
    return null;
  }

  async function submit(target: "draft" | "create") {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(target);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const payload = {
      job_type: form.job_type,
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: target === "draft" ? "entwurf" : "offen",
      priority: "normal",
      customer_id: form.job_type === "extern" ? form.customer_id : null,
      location_id: form.job_type === "location" ? form.location_id : null,
      external_address:
        form.job_type === "extern" ? form.external_address.trim() || null : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      notes: form.notes.trim() || null,
      created_by: user?.id,
    };

    const { data: inserted, error } = await supabase
      .from("jobs")
      .insert(payload)
      .select("id, job_number")
      .single();

    if (error || !inserted) {
      toast.error("Fehler: " + (error?.message ?? "unbekannt"));
      setSaving(null);
      return;
    }

    if (target === "draft") {
      toast.success(`Entwurf INT-${inserted.job_number} gespeichert`);
    } else {
      toast.success(`Auftrag INT-${inserted.job_number} erstellt`, {
        duration: 5000,
        action: {
          label: "Rückgängig",
          onClick: async () => {
            const { error: delErr } = await supabase
              .from("jobs")
              .delete()
              .eq("id", inserted.id);
            if (delErr) {
              toast.error("Konnte nicht rückgängig gemacht werden");
              return;
            }
            toast.success(`INT-${inserted.job_number} verworfen`);
          },
        },
      });
    }
    router.push("/auftraege");
  }

  const selectedLocation = locations.find((l) => l.id === form.location_id);

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/auftraege">
          <button className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Neuer Auftrag</h1>
        <span className="font-mono text-xs text-muted-foreground ml-auto">
          {nextJobNumber ? `INT-${nextJobNumber}` : "INT-…"}
        </span>
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit("create");
        }}
        className="rounded-xl border bg-card p-4 space-y-4"
      >
        {/* Auftragstyp — inline */}
        <div className="grid grid-cols-2 gap-2">
          {(["location", "extern"] as JobType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setJobType(t)}
              className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                form.job_type === t
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:bg-muted"
              }`}
            >
              {t === "location" ? "Location" : "Firma / Privat"}
            </button>
          ))}
        </div>

        {/* Was */}
        <div className="space-y-1.5">
          <SectionLabel>Titel *</SectionLabel>
          <Input
            id="title"
            placeholder="kurz, was zu tun ist (z.B. Lichtaufbau)"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            aria-required
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <SectionLabel>Beschreibung</SectionLabel>
          <textarea
            id="description"
            placeholder="Details zum Auftrag…"
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            rows={2}
            className="w-full px-3 py-1.5 text-sm rounded-lg border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <hr className="border-border/50" />

        {/* Wo — gleiches 2-Spalten-Layout in beiden Modi, damit nichts springt */}
        <div className="space-y-2">
          <SectionLabel>Wo *</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {form.job_type === "location" ? (
              <>
                <SearchableSelect
                  value={form.location_id}
                  onChange={(id) => update("location_id", id)}
                  items={locations.map((l) => ({
                    id: l.id,
                    label: l.name,
                    sub: [l.address_street, l.address_zip, l.address_city]
                      .filter(Boolean)
                      .join(", "),
                  }))}
                  placeholder="Location auswählen…"
                  required
                />
                <div className="h-9 flex items-center px-3 text-xs rounded-lg border border-dashed bg-muted/20 text-muted-foreground truncate">
                  {selectedLocation
                    ? [
                        selectedLocation.address_street,
                        selectedLocation.address_zip,
                        selectedLocation.address_city,
                      ]
                        .filter(Boolean)
                        .join(", ") || "Keine Adresse hinterlegt"
                    : "Adresse erscheint nach Auswahl"}
                </div>
              </>
            ) : (
              <>
                <SearchableSelect
                  value={form.customer_id}
                  onChange={(id) => update("customer_id", id)}
                  items={customers.map((c) => ({ id: c.id, label: c.name }))}
                  placeholder="Kunde tippen…"
                  required
                />
                <AddressAutocomplete
                  value={form.external_address}
                  onChange={(v) => update("external_address", v)}
                  localLocations={locations}
                  placeholder="Ort / Adresse…"
                  required
                />
              </>
            )}
          </div>
          {form.job_type === "location" && locations.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Noch keine Locations.{" "}
              <Link href="/standorte" className="underline">
                Jetzt anlegen
              </Link>
            </p>
          )}
          {form.job_type === "extern" && customers.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Noch keine Kunden.{" "}
              <Link href="/kunden/neu" className="underline">
                Jetzt anlegen
              </Link>
            </p>
          )}
        </div>

        <hr className="border-border/50" />

        {/* Wann */}
        <div className="space-y-1.5">
          <SectionLabel>Wann *</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => update("start_date", e.target.value)}
              aria-label="Startdatum"
            />
            <Input
              type="date"
              value={form.end_date}
              onChange={(e) => update("end_date", e.target.value)}
              aria-label="Enddatum"
            />
          </div>
        </div>

        {/* Notizen */}
        <div className="space-y-1.5">
          <SectionLabel>Notizen (intern)</SectionLabel>
          <textarea
            placeholder="Optional…"
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={2}
            className="w-full px-3 py-1.5 text-sm rounded-lg border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-2 pt-1">
          <Link href="/auftraege" className="flex-1">
            <Button type="button" variant="outline" size="sm" className="w-full">
              Abbrechen
            </Button>
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving !== null}
            onClick={() => submit("draft")}
            className="flex-1"
          >
            <FileEdit className="h-3.5 w-3.5 mr-1.5" />
            {saving === "draft" ? "Speichert…" : "Als Entwurf"}
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={saving !== null}
            className="flex-1"
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving === "create" ? "Speichert…" : "Auftrag erstellen"}
          </Button>
        </div>
      </form>
    </div>
  );
}
