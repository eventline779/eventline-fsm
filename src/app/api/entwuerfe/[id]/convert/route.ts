// /api/entwuerfe/[id]/convert — Draft -> echter Auftrag.
//
// Ein Klick der aus einem Draft einen job-Record macht:
//   1. Draft laden (nicht bereits umgewandelt, nicht storniert, nicht deleted).
//   2. Passenden Job in public.jobs anlegen (status='offen', priority='normal').
//   3. Draft-Row auf status='umgewandelt' setzen und converted_to_job_id +
//      converted_at fuellen. Der Draft-Record BLEIBT (fuer Historie/Statistik).
//
// job_type-Mapping:
//   - location_id gesetzt & customer_id NULL           -> 'location'
//   - customer_id gesetzt (mit/ohne location_id)        -> 'extern'
//   - beides NULL                                       -> 'extern' + external_address leer
//     (Rueckfall-Case; UI validiert vorher dass mindestens ein Ansprechpartner-
//      Namen existiert, sonst ist die Umwandlung nicht sinnvoll)
//
// Wenn expected_start_date/expected_end_date fehlen wird der Auftrag ohne
// Datum angelegt (das UI zwingt den User dann im Auftrag-Detail zum
// Nachpflegen bevor freigegeben werden kann).
//
// Auth-Modell: requirePermission("auftraege:edit"). RLS auf beide Tabellen
// erwartet dieselbe Permission — wir gehen aber ueber Admin-Client, weil
// wir zwei Writes in einer HTTP-Response bearbeiten und einen partial-
// Failure sauber melden wollen ohne dass RLS in der zweiten Query auf
// eine unerwartete Row-Sicht faellt.

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("auftraege:edit");
  if (auth.error) return auth.error;
  const { id: draftId } = await params;

  const admin = createAdminClient();

  // 1) Draft laden
  const { data: draft, error: draftErr } = await admin
    .from("job_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (draftErr) return NextResponse.json({ success: false, error: draftErr.message }, { status: 500 });
  if (!draft) return NextResponse.json({ success: false, error: "Entwurf nicht gefunden" }, { status: 404 });
  if (draft.status === "umgewandelt" || draft.converted_to_job_id) {
    return NextResponse.json(
      { success: false, error: "Dieser Entwurf wurde bereits umgewandelt", jobId: draft.converted_to_job_id },
      { status: 409 },
    );
  }
  if (draft.status === "storniert") {
    return NextResponse.json({ success: false, error: "Stornierte Entwuerfe koennen nicht umgewandelt werden" }, { status: 400 });
  }
  if (!draft.title?.trim()) {
    return NextResponse.json({ success: false, error: "Titel fehlt" }, { status: 400 });
  }

  // 2) job_type ableiten
  const jobType: "location" | "extern" =
    draft.location_id && !draft.customer_id ? "location" : "extern";

  const jobPayload = {
    title: draft.title,
    description: draft.description ?? draft.general_notes ?? null,
    status: "offen" as const,
    priority: "normal" as const,
    job_type: jobType,
    customer_id: jobType === "extern" ? draft.customer_id : null,
    location_id: draft.location_id ?? null,
    room_id: draft.room_id ?? null,
    external_address: null,
    start_date: draft.expected_start_date ?? null,
    end_date: draft.expected_end_date ?? null,
    guest_count: draft.guest_count ?? null,
    contact_person: draft.contact_person ?? null,
    contact_phone: draft.contact_phone ?? null,
    contact_email: draft.contact_email ?? null,
    created_by: auth.user.id,
  };

  const { data: newJob, error: jobErr } = await admin
    .from("jobs")
    .insert(jobPayload)
    .select("id, job_number")
    .single();
  if (jobErr || !newJob) {
    return NextResponse.json(
      { success: false, error: jobErr?.message ?? "Auftrag konnte nicht angelegt werden" },
      { status: 500 },
    );
  }

  // 3) Draft archivieren (status=umgewandelt + Verweis auf den neuen Job)
  const { error: updateErr } = await admin
    .from("job_drafts")
    .update({
      status: "umgewandelt",
      converted_to_job_id: newJob.id,
      converted_at: new Date().toISOString(),
    })
    .eq("id", draftId);
  if (updateErr) {
    // Best-effort rollback: den frisch angelegten Job wieder als deleted
    // markieren, sonst haben wir einen Auftrag ohne Draft-Backlink. Wir
    // melden den Original-Fehler.
    await admin.from("jobs").update({ is_deleted: true }).eq("id", newJob.id);
    return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    jobId: newJob.id,
    jobNumber: newJob.job_number,
    redirectUrl: `/auftraege/${newJob.id}`,
  });
}
