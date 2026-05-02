// Generische Delete-Route fuer whitelisted Tabellen. Benutzt den
// authenticated Supabase-Client damit RLS-Policies weiterhin greifen — die
// Server-Boundary ist trotzdem nutzbar fuer:
//   - zentrale Audit-Logs (kommt spaeter)
//   - Side-Effects (z.B. Storage-Cleanup oder Notification-Cancel)
//   - klare Pruefung welche Tabellen ueberhaupt loeschbar sind
//
// Body: { table: string, id: string }
//
// Wichtig: Nicht alle Tabellen sind hier — z.B. customers/locations/rooms
// haben eigene Routes mit zusaetzlicher Pruefung (z.B. FK-Check, "hat noch
// Auftraege?"). Hier nur Tabellen wo plain delete + RLS reicht.

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TABLES = new Set([
  "documents",
  "tickets",
  "todos",
  "job_appointments",
  "room_contacts",
  "room_prices",
  "location_contacts",
  "maintenance_tasks",
  "calendar_events",
  "email_templates",
  "vertrieb_contacts",
]);

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const { table, id } = body as { table?: string; id?: string };
  if (!table || !id || !ALLOWED_TABLES.has(table)) {
    return NextResponse.json(
      { ok: false, error: "Tabelle oder ID ungueltig" },
      { status: 400 },
    );
  }

  // authenticated client → RLS-Policies entscheiden ob der User wirklich
  // loeschen darf. Service-Role wird bewusst NICHT genutzt damit kein
  // unbeabsichtigter Bypass passiert.
  const supa = await createClient();
  const { error } = await supa.from(table).delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
