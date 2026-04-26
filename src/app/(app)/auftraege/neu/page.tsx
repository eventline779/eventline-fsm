"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AuftragFormFields,
  type AuftragFormState,
  type Customer,
  type Location,
  todayLocalISO,
} from "@/components/auftrag-form-fields";
import { ArrowLeft, Save, FileEdit } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function NeuerAuftragPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [saving, setSaving] = useState<"draft" | "create" | null>(null);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [nextJobNumber, setNextJobNumber] = useState<number | null>(null);

  const [form, setForm] = useState<AuftragFormState>({
    job_type: "location",
    title: searchParams.get("title") || "",
    description: searchParams.get("description") || "",
    location_id: searchParams.get("location_id") || "",
    customer_id: searchParams.get("customer_id") || "",
    external_address: "",
    start_date: "",
    end_date: "",
    urgent: false,
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
      setCustomers((custRes.data as Customer[]) ?? []);
      setLocations((locRes.data as Location[]) ?? []);
      const maxRow = maxRes.data?.[0] as { job_number: number } | undefined;
      setNextJobNumber(maxRow?.job_number ? maxRow.job_number + 1 : 26200);
    }
    loadData();
  }, []);

  function validate(target: "draft" | "create"): string | null {
    if (!form.title.trim()) return "Titel ist Pflicht";
    if (target === "draft") {
      if (form.start_date && form.end_date && form.end_date < form.start_date) {
        return "Enddatum darf nicht vor dem Startdatum liegen";
      }
      return null;
    }
    if (form.job_type === "location" && !form.location_id) {
      return "Bitte eine Location auswählen";
    }
    if (form.job_type === "extern") {
      if (!form.customer_id) return "Bitte einen Kunden auswählen";
      if (!form.external_address.trim()) return "Bitte einen Ort angeben";
    }
    if (!form.start_date) return "Bitte Startdatum angeben";
    if (!form.end_date) return "Bitte Enddatum angeben";
    const todayStr = todayLocalISO();
    if (form.start_date < todayStr) return "Startdatum darf nicht in der Vergangenheit liegen";
    if (form.end_date < todayStr) return "Enddatum darf nicht in der Vergangenheit liegen";
    if (form.end_date < form.start_date) {
      return "Enddatum darf nicht vor dem Startdatum liegen";
    }
    return null;
  }

  async function submit(target: "draft" | "create") {
    const err = validate(target);
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
      priority: form.urgent ? "dringend" : "normal",
      customer_id: form.job_type === "extern" && form.customer_id ? form.customer_id : null,
      location_id: form.job_type === "location" && form.location_id ? form.location_id : null,
      external_address: form.job_type === "extern" ? form.external_address.trim() || null : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
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
            const { data: updated, error: delErr } = await supabase
              .from("jobs")
              .update({ is_deleted: true })
              .eq("id", inserted.id)
              .select("id");
            if (delErr || !updated || updated.length === 0) {
              toast.error("Konnte nicht rückgängig gemacht werden");
              return;
            }
            toast.success(`INT-${inserted.job_number} verworfen`);
            window.dispatchEvent(new Event("jobs:invalidate"));
          },
        },
      });
    }
    router.push("/auftraege");
  }

  return (
    <div className="max-w-2xl mx-auto">
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
        className="rounded-xl border bg-card p-5 space-y-5"
      >
        <AuftragFormFields
          form={form}
          onChange={setForm}
          customers={customers}
          locations={locations}
        />

        {/* Buttons */}
        <div className="flex gap-3 pt-2">
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
            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving === "create" ? "Speichert…" : "Auftrag erstellen"}
          </Button>
        </div>
      </form>
    </div>
  );
}
