// /api/entwuerfe — Liste + Anlegen.
//
// Auftrags-Entwuerfe (job_drafts). Getrennt von jobs weil andere UI-
// Beduerfnisse (viele Notizen, Owner-Person, Datum oft Jahre in Zukunft).
// Migration 206 legt die Tabellen an.
//
// Auth-Modell: requireUser + RLS.
//   - RLS-Policies auf job_drafts pruefen 'auftraege:view' / 'auftraege:edit'
//     via has_permission() — daher reicht der User-scoped Server-Client,
//     wir brauchen keinen Admin-Bypass. requireUser garantiert dass eine
//     Session da ist (sonst 401 statt undurchsichtigem 500 aus Supabase).

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";

const LIST_SELECT = `
  id,
  draft_number,
  title,
  status,
  source,
  expected_start_date,
  expected_end_date,
  guest_count,
  owner_id,
  customer_id,
  customer_name,
  contact_person,
  contact_email,
  contact_phone,
  location_id,
  created_at,
  updated_at,
  converted_to_job_id,
  converted_at,
  customer:customers(id, name),
  location:locations(id, name),
  owner:profiles!job_drafts_owner_id_fkey(id, full_name),
  notes_count:job_draft_notes(count)
`;

export async function GET(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const status = url.searchParams.get("status"); // 'aktiv' | 'wartet_auf_kunde' | 'storniert' | 'umgewandelt' | 'active_group'
  const ownerId = url.searchParams.get("owner_id");
  const search = url.searchParams.get("search")?.trim();

  const supabase = await createClient();
  let q = supabase
    .from("job_drafts")
    .select(LIST_SELECT)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  // "active_group" = aktiv + wartet_auf_kunde (alles was noch nicht in
  // Archiv/Umgewandelt ist). Segment-Toggle in der UI schickt entweder
  // active_group oder 'storniert'.
  if (status === "active_group") {
    q = q.in("status", ["aktiv", "wartet_auf_kunde"]);
  } else if (status) {
    q = q.eq("status", status);
  }
  if (ownerId) q = q.eq("owner_id", ownerId);
  if (search) {
    // Freitext-Suche in Titel, customer_name, contact_person + draft_number.
    const asNum = Number(search);
    const numericPart = Number.isFinite(asNum) && /^\d+$/.test(search) ? `,draft_number.eq.${asNum}` : "";
    q = q.or(
      `title.ilike.%${search}%,customer_name.ilike.%${search}%,contact_person.ilike.%${search}%${numericPart}`,
    );
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, drafts: data ?? [] });
}

interface CreateBody {
  title?: string;
  description?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  contact_person?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  location_id?: string | null;
  room_id?: string | null;
  expected_start_date?: string | null;
  expected_end_date?: string | null;
  guest_count?: number | null;
  owner_id?: string | null;
  status?: "aktiv" | "wartet_auf_kunde" | "storniert";
  source?: "direkt" | "partner_anfrage" | "aus_vertrieb" | "aus_vermietentwurf";
  general_notes?: string | null;
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = (await req.json().catch(() => null)) as CreateBody | null;
  if (!body?.title?.trim()) {
    return NextResponse.json({ success: false, error: "Titel ist Pflicht" }, { status: 400 });
  }

  const supabase = await createClient();
  // status default 'aktiv' — via DB-Default, aber wir setzen es defensiv
  // damit ein leeres Client-Payload nicht auf undefined faellt.
  const payload = {
    title: body.title.trim(),
    description: body.description?.trim() || null,
    customer_id: body.customer_id || null,
    customer_name: body.customer_name?.trim() || null,
    contact_person: body.contact_person?.trim() || null,
    contact_email: body.contact_email?.trim() || null,
    contact_phone: body.contact_phone?.trim() || null,
    location_id: body.location_id || null,
    room_id: body.room_id || null,
    expected_start_date: body.expected_start_date || null,
    expected_end_date: body.expected_end_date || null,
    guest_count: body.guest_count ?? null,
    owner_id: body.owner_id || null,
    status: body.status ?? "aktiv",
    source: body.source ?? "direkt",
    general_notes: body.general_notes?.trim() || null,
    created_by: auth.user.id,
  };

  const { data, error } = await supabase
    .from("job_drafts")
    .insert(payload)
    .select("id, draft_number")
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, draft: data });
}
