"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AuftragFormFields,
  type AuftragFormState,
  type Customer,
  type Location,
} from "@/components/auftrag-form-fields";
import { ArrowLeft, Save, CheckCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

function dateToISODate(d: string | null): string {
  if (!d) return "";
  return d.slice(0, 10);
}

export default function AuftragBearbeitenPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;
  const supabase = createClient();

  const [saving, setSaving] = useState<"save" | "publish" | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [jobNumber, setJobNumber] = useState<number | null>(null);
  const [originalStatus, setOriginalStatus] = useState<string>("");
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [locations, setLocations] = useState<Location[] | null>(null);

  const [form, setForm] = useState<AuftragFormState>({
    job_type: "location",
    title: "",
    description: "",
    location_id: "",
    customer_id: "",
    external_address: "",
    start_date: "",
    end_date: "",
    urgent: false,
  });

  useEffect(() => {
    async function loadAll() {
      const [jobRes, custRes, locRes] = await Promise.all([
        supabase
          .from("jobs")
          .select(
            "id, job_number, job_type, title, description, status, priority, customer_id, location_id, external_address, start_date, end_date"
          )
          .eq("id", jobId)
          .single(),
        supabase.from("customers").select("id, name").eq("is_active", true).order("name"),
        supabase
          .from("locations")
          .select("id, name, address_street, address_zip, address_city")
          .eq("is_active", true)
          .order("name"),
      ]);

      setCustomers((custRes.data as Customer[]) ?? []);
      setLocations((locRes.data as Location[]) ?? []);

      if (jobRes.error || !jobRes.data) {
        toast.error("Auftrag nicht gefunden");
        router.push("/auftraege");
        return;
      }

      const j = jobRes.data;
      setJobNumber(j.job_number);
      setOriginalStatus(j.status);
      setForm({
        job_type: (j.job_type as "location" | "extern") ?? "location",
        title: j.title ?? "",
        description: j.description ?? "",
        location_id: j.location_id ?? "",
        customer_id: j.customer_id ?? "",
        external_address: j.external_address ?? "",
        start_date: dateToISODate(j.start_date),
        end_date: dateToISODate(j.end_date),
        urgent: j.priority === "dringend",
      });
      setLoadingJob(false);
    }
    loadAll();
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  function validate(target: "save" | "publish"): string | null {
    if (!form.title.trim()) return "Titel ist Pflicht";
    if (target === "save" && originalStatus === "entwurf") {
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
    if (form.end_date < form.start_date) {
      return "Enddatum darf nicht vor dem Startdatum liegen";
    }
    return null;
  }

  async function submit(target: "save" | "publish") {
    const err = validate(target);
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(target);

    const newStatus = target === "publish" ? "offen" : originalStatus;

    const payload = {
      job_type: form.job_type,
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: newStatus,
      priority: form.urgent ? "dringend" : "normal",
      customer_id: form.job_type === "extern" && form.customer_id ? form.customer_id : null,
      location_id: form.job_type === "location" && form.location_id ? form.location_id : null,
      external_address: form.job_type === "extern" ? form.external_address.trim() || null : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    };

    const { data: updated, error } = await supabase
      .from("jobs")
      .update(payload)
      .eq("id", jobId)
      .select("id");

    if (error || !updated || updated.length === 0) {
      toast.error("Fehler: " + (error?.message ?? "konnte nicht gespeichert werden"));
      setSaving(null);
      return;
    }

    if (target === "publish") {
      toast.success(`Auftrag INT-${jobNumber} freigegeben`);
    } else {
      toast.success(`Änderungen gespeichert`);
    }
    window.dispatchEvent(new Event("jobs:invalidate"));
    router.push("/auftraege");
  }

  const isDraft = originalStatus === "entwurf";

  if (loadingJob) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="h-8 w-40 rounded bg-muted animate-pulse mb-4" />
        <div className="h-96 rounded-xl bg-muted animate-pulse" />
      </div>
    );
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
        <h1 className="text-xl font-bold tracking-tight">
          {isDraft ? "Entwurf bearbeiten" : "Auftrag bearbeiten"}
        </h1>
        <span className="font-mono text-xs text-muted-foreground ml-auto">
          {jobNumber ? `INT-${jobNumber}` : ""}
        </span>
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit("save");
        }}
        className="rounded-xl border bg-card p-5 space-y-5"
      >
        <AuftragFormFields
          form={form}
          onChange={setForm}
          customers={customers}
          locations={locations}
          enforceNoPastDates={false}
        />

        {/* Buttons */}
        <div className="flex gap-3 pt-2">
          <Link href="/auftraege" className="flex-1">
            <Button type="button" variant="outline" size="sm" className="w-full">
              Abbrechen
            </Button>
          </Link>
          <Button
            type="submit"
            variant={isDraft ? "outline" : undefined}
            size="sm"
            disabled={saving !== null}
            className={isDraft ? "flex-1" : "flex-1 bg-red-600 hover:bg-red-700 text-white"}
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving === "save" ? "Speichert…" : "Speichern"}
          </Button>
          {isDraft && (
            <Button
              type="button"
              size="sm"
              disabled={saving !== null}
              onClick={() => submit("publish")}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
              {saving === "publish" ? "Speichert…" : "Freigeben"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
