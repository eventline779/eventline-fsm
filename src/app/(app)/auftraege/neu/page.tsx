"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { ArrowLeft, Save, FileEdit } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

type Customer = {
  id: string;
  name: string;
};

type Location = {
  id: string;
  name: string;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
};

type JobType = "location" | "extern";

export default function NeuerAuftragPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [saving, setSaving] = useState<"draft" | "create" | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

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
      const [custRes, locRes] = await Promise.all([
        supabase.from("customers").select("id, name").eq("is_active", true).order("name"),
        supabase
          .from("locations")
          .select("id, name, address_street, address_zip, address_city")
          .eq("is_active", true)
          .order("name"),
      ]);
      if (custRes.data) setCustomers(custRes.data as Customer[]);
      if (locRes.data) setLocations(locRes.data as Location[]);
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
      // beim Wechseln die jeweils nicht-relevanten Felder zurücksetzen
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
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
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

    const { error } = await supabase.from("jobs").insert(payload);

    if (error) {
      toast.error("Fehler: " + error.message);
      setSaving(null);
      return;
    }

    toast.success(
      target === "draft" ? "Als Entwurf gespeichert" : "Auftrag erstellt"
    );
    router.push("/auftraege");
  }

  const selectedLocation = locations.find((l) => l.id === form.location_id);
  const selectedLocationFullText = selectedLocation
    ? [
        selectedLocation.name,
        selectedLocation.address_street,
        selectedLocation.address_zip,
        selectedLocation.address_city,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/auftraege">
          <button className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Neuer Auftrag</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Auftragsnummer wird automatisch vergeben.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit("create");
        }}
        className="space-y-5"
      >
        {/* Auftragstyp */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Auftragstyp
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {(["location", "extern"] as JobType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setJobType(t)}
                  className={`px-3 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                    form.job_type === t
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {t === "location" ? "Location" : "Firma / Privat"}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Was */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Was ist zu tun?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">Titel *</Label>
              <Input
                id="title"
                placeholder="kurz, was zu tun ist (z.B. Lichtaufbau)"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                className="mt-1.5"
                required
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="description">Beschreibung</Label>
              <textarea
                id="description"
                placeholder="Details zum Auftrag…"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={3}
                className="mt-1.5 w-full px-3 py-2 text-sm rounded-lg border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </CardContent>
        </Card>

        {/* Wo */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Wo?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {form.job_type === "location" ? (
              <>
                <div>
                  <Label htmlFor="location">Location *</Label>
                  <select
                    id="location"
                    value={form.location_id}
                    onChange={(e) => update("location_id", e.target.value)}
                    className="mt-1.5 w-full h-9 px-3 text-sm rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    required
                  >
                    <option value="">Location auswählen…</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  {locations.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Noch keine Locations.{" "}
                      <Link href="/standorte" className="underline">
                        Jetzt anlegen
                      </Link>
                    </p>
                  )}
                </div>
                {selectedLocation && (
                  <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    <span className="text-foreground font-medium">Standort:</span>{" "}
                    {selectedLocationFullText}
                  </div>
                )}
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="customer">Kunde *</Label>
                  <select
                    id="customer"
                    value={form.customer_id}
                    onChange={(e) => update("customer_id", e.target.value)}
                    className="mt-1.5 w-full h-9 px-3 text-sm rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    required
                  >
                    <option value="">Firma oder Privatperson…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {customers.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Noch keine Kunden.{" "}
                      <Link href="/kunden/neu" className="underline">
                        Jetzt anlegen
                      </Link>
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="ort">Ort *</Label>
                  <div className="mt-1.5">
                    <AddressAutocomplete
                      id="ort"
                      value={form.external_address}
                      onChange={(v) => update("external_address", v)}
                      localLocations={locations}
                      placeholder="Strasse, PLZ, Ort — Vorschläge erscheinen beim Tippen"
                      required
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Wann */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Wann?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start">Startdatum</Label>
                <Input
                  id="start"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => update("start_date", e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="end">Enddatum</Label>
                <Input
                  id="end"
                  type="date"
                  value={form.end_date}
                  onChange={(e) => update("end_date", e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notizen */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Notizen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              placeholder="Interne Notizen…"
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </CardContent>
        </Card>

        {/* Buttons */}
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/auftraege" className="flex-1 min-w-[120px]">
            <Button type="button" variant="outline" className="w-full">
              Abbrechen
            </Button>
          </Link>
          <Button
            type="button"
            variant="outline"
            disabled={saving !== null}
            onClick={() => submit("draft")}
            className="flex-1 min-w-[120px]"
          >
            <FileEdit className="h-4 w-4 mr-2" />
            {saving === "draft" ? "Speichert…" : "Als Entwurf"}
          </Button>
          <Button
            type="submit"
            disabled={saving !== null}
            className="flex-1 min-w-[140px]"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving === "create" ? "Speichert…" : "Auftrag erstellen"}
          </Button>
        </div>
      </form>
    </div>
  );
}
