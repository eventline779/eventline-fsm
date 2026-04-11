import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// POST: Create notification for one or more users
export async function POST(request: NextRequest) {
  const { userIds, title, message, link } = await request.json();

  if (!userIds || !title) {
    return NextResponse.json({ success: false, error: "userIds und title sind erforderlich" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const ids = Array.isArray(userIds) ? userIds : [userIds];

  const rows = ids.map((userId: string) => ({
    user_id: userId,
    title,
    message: message || null,
    link: link || null,
  }));

  const { error } = await supabase.from("notifications").insert(rows);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
