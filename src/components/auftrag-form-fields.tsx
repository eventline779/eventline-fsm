"use client";

/**
 * Gemeinsame Form-Felder für /auftraege/neu und /auftraege/[id]/bearbeiten.
 * Nur UI-Rendering — State, Validation und Submit bleiben in den Parent-Pages.
 */

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { SearchableSelect } from "@/components/searchable-select";
import { AlertCircle } from "lucide-react";

export type AuftragJobType = "location" | "extern";

export type AuftragFormState = {
  job_type: AuftragJobType;
  title: string;
  description: string;
  location_id: string;
  customer_id: string;
  external_address: string;
  start_date: string;
  end_date: string;
  urgent: boolean;
};

export type Customer = { id: string; name: string };
export type Location = {
  id: string;
  name: string;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

// "YYYY-MM-DD" für die lokale Zeitzone — passt zu <input type="date">
export function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  form: AuftragFormState;
  onChange: (form: AuftragFormState) => void;
  customers: Customer[] | null;
  locations: Location[] | null;
  /** Bei Edit-Page wollen wir nicht zwingend "Datum nicht in der Vergangenheit" enforcen. */
  enforceNoPastDates?: boolean;
}

export function AuftragFormFields({
  form,
  onChange,
  customers,
  locations,
  enforceNoPastDates = true,
}: Props) {
  function update<K extends keyof AuftragFormState>(field: K, value: AuftragFormState[K]) {
    onChange({ ...form, [field]: value });
  }

  function setJobType(t: AuftragJobType) {
    onChange({
      ...form,
      job_type: t,
      location_id: t === "location" ? form.location_id : "",
      customer_id: t === "extern" ? form.customer_id : "",
      external_address: t === "extern" ? form.external_address : "",
    });
  }

  const selectedLocation = locations?.find((l) => l.id === form.location_id);
  const minDate = enforceNoPastDates ? todayLocalISO() : undefined;

  return (
    <>
      {/* Auftragstyp */}
      <div className="grid grid-cols-2 gap-3">
        {(["location", "extern"] as AuftragJobType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setJobType(t)}
            className={`px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
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
      <div className="space-y-2">
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
      <div className="space-y-2">
        <SectionLabel>Beschreibung</SectionLabel>
        <textarea
          id="description"
          placeholder="Details zum Auftrag…"
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          rows={2}
          style={{ fieldSizing: "content" } as React.CSSProperties}
          className="w-full px-3 py-1.5 text-sm rounded-xl border bg-background resize-none transition-all hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
        />
      </div>

      <hr className="border-border/50" />

      {/* Wo */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionLabel>Wo</SectionLabel>
          <button
            type="button"
            onClick={() => update("urgent", !form.urgent)}
            title={form.urgent ? "Dringend markiert (klicken zum entfernen)" : "Als dringend markieren"}
            aria-pressed={form.urgent}
            aria-label="Dringend markieren"
            className={`inline-flex items-center justify-center h-7 w-7 rounded-md transition-all ${
              form.urgent
                ? "bg-red-500 text-white shadow-sm shadow-red-500/30"
                : "text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10"
            }`}
          >
            <AlertCircle className="h-4 w-4" strokeWidth={form.urgent ? 2.5 : 2} />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {form.job_type === "location" ? (
            <>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground/70 ml-1">Location *</p>
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
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground/70 ml-1">Adresse</p>
                <div className="h-9 flex items-center px-3 text-xs rounded-xl border border-dashed bg-muted/20 text-muted-foreground truncate">
                  {selectedLocation
                    ? [selectedLocation.address_street, selectedLocation.address_zip, selectedLocation.address_city]
                        .filter(Boolean)
                        .join(", ") || "Keine Adresse hinterlegt"
                    : "Adresse erscheint nach Auswahl"}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground/70 ml-1">Kunde *</p>
                <SearchableSelect
                  value={form.customer_id}
                  onChange={(id) => update("customer_id", id)}
                  items={(customers ?? []).map((c) => ({ id: c.id, label: c.name }))}
                  placeholder="Kunde tippen…"
                  required
                />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground/70 ml-1">Ort *</p>
                <AddressAutocomplete
                  value={form.external_address}
                  onChange={(v) => update("external_address", v)}
                  localLocations={locations ?? []}
                  placeholder="Ort / Adresse…"
                  required
                />
              </div>
            </>
          )}
        </div>
        {form.job_type === "location" && locations !== null && locations.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Noch keine Locations.{" "}
            <Link href="/standorte" className="underline">
              Jetzt anlegen
            </Link>
          </p>
        )}
        {form.job_type === "extern" && customers !== null && customers.length === 0 && (
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
      <div className="space-y-2">
        <SectionLabel>Wann</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground/70 ml-1">Start *</p>
            <Input
              type="date"
              min={minDate}
              value={form.start_date}
              onChange={(e) => update("start_date", e.target.value)}
              aria-label="Startdatum"
            />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground/70 ml-1">Ende *</p>
            <Input
              type="date"
              min={form.start_date || minDate}
              value={form.end_date}
              onChange={(e) => update("end_date", e.target.value)}
              aria-label="Enddatum"
            />
          </div>
        </div>
      </div>
    </>
  );
}
