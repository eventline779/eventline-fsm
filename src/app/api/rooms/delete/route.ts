import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";

export async function POST(request: Request) {
  const auth = await requirePermission("locations:delete");
  if (auth.error) return auth.error;

  const { id } = await request.json();
  const supabase = createAdminClient();

  // Dokumente aus Storage löschen
  const { data: room } = await supabase.from("rooms").select("notes").eq("id", id).single();
  if (room?.notes) {
    try {
      const parsed = JSON.parse(room.notes);
      if (parsed._docs?.length > 0) {
        await supabase.storage.from("documents").remove(parsed._docs.map((d: any) => d.path));
      }
    } catch {}
  }

  // Raum löschen (cascade löscht auch Kontakte und Preise)
  const { error } = await supabase.from("rooms").delete().eq("id", id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
