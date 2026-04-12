import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { customerId, code } = await request.json();

  if (code !== "5225") {
    return NextResponse.json({ success: false, error: "Falscher Code" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("customers").delete().eq("id", customerId);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
