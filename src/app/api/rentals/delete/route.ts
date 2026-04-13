import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const DELETE_CODE = "5225";

export async function POST(request: Request) {
  const { id, code } = await request.json();

  if (code !== DELETE_CODE) {
    return NextResponse.json({ success: false, error: "Falscher Code" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // Dokumente aus Storage löschen
  const { data: rental } = await supabase.from("rental_requests").select("details").eq("id", id).single();
  if (rental?.details) {
    try {
      const parsed = JSON.parse(rental.details);
      const paths: string[] = [];
      if (parsed._docs) paths.push(...parsed._docs.map((d: any) => d.path));
      if (parsed._contractDocs) paths.push(...parsed._contractDocs.map((d: any) => d.path));
      if (paths.length > 0) {
        await supabase.storage.from("documents").remove(paths);
      }
    } catch {}
  }

  // E-Mail Log Einträge löschen
  await supabase.from("email_log").delete().eq("rental_request_id", id);

  // Vermietung löschen
  const { error } = await supabase.from("rental_requests").delete().eq("id", id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
