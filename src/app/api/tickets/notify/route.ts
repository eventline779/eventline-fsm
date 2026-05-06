// POST /api/tickets/notify — In-App-Notification fuer Ticket-Events.
// Events:
//   "created"          → an alle Admins (neues Ticket vom Mitarbeiter)
//   "status_changed"   → an Ersteller (Admin hat erledigt/abgelehnt)
//
// Notifications gehen NUR in die In-App-notifications-Tabelle (Glocke
// in der Sidebar) — KEINE Mails. Das ist eine bewusste Eventline-Regel
// damit der Mail-Eingang nicht von App-Events ueberschwemmt wird.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/api-auth";

const TYPE_LABEL: Record<string, string> = {
  it: "IT-Problem",
  beleg: "Beleg",
  stempel_aenderung: "Stempel-Änderung",
  material: "Material-Anfrage",
};

const STATUS_LABEL: Record<string, string> = {
  offen: "offen",
  erledigt: "erledigt",
  abgelehnt: "abgelehnt",
};

export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body?.ticket_id || !body?.event) {
    return NextResponse.json({ success: false, error: "ticket_id + event noetig" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Ticket laden (mit creator-Name fuer den Notification-Text).
  const { data: ticket } = await admin
    .from("tickets")
    .select("id, type, status, title, created_by, creator:profiles!created_by(full_name)")
    .eq("id", body.ticket_id)
    .maybeSingle();

  if (!ticket) {
    return NextResponse.json({ success: false, error: "Ticket nicht gefunden" }, { status: 404 });
  }

  type TicketRow = {
    id: string;
    type: string;
    status: string;
    title: string;
    created_by: string;
    creator: { full_name: string } | null;
  };
  const t = ticket as unknown as TicketRow;

  if (body.event === "created") {
    // An alle aktiven Admins — die kuemmern sich um die Bearbeitung.
    const { data: admins } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .eq("is_active", true);

    const adminIds = (admins ?? []).map((a) => a.id).filter((id) => id !== t.created_by);
    if (adminIds.length === 0) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    const rows = adminIds.map((userId) => ({
      user_id: userId,
      type: "ticket_new",
      title: `Neues Ticket: ${TYPE_LABEL[t.type] ?? t.type}`,
      message: `${t.creator?.full_name ?? "Unbekannt"}: ${t.title}`,
      link: `/tickets/${t.id}`,
      resource_type: "ticket",
      resource_id: t.id,
    }));

    const { error } = await admin.from("notifications").insert(rows);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, sent: rows.length });
  }

  if (body.event === "status_changed") {
    // An den Ersteller — der will wissen ob's erledigt oder abgelehnt wurde.
    const notifType = t.status === "abgelehnt" ? "ticket_rejected" : "ticket_done";
    const { error } = await admin.from("notifications").insert({
      user_id: t.created_by,
      type: notifType,
      title: `Ticket ${STATUS_LABEL[t.status] ?? t.status}: ${t.title}`,
      message: typeof body.note === "string" && body.note.trim() ? body.note : null,
      link: `/tickets/${t.id}`,
      resource_type: "ticket",
      resource_id: t.id,
    });
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, sent: 1 });
  }

  return NextResponse.json({ success: false, error: `Unbekanntes event: ${body.event}` }, { status: 400 });
}
