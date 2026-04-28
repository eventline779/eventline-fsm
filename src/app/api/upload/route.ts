import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser();
    if (auth.error) return auth.error;
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const path = formData.get("path") as string;

    if (!file || !path) {
      return NextResponse.json({ success: false, error: "File and path required" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: `Datei zu gross (${Math.round(file.size / 1024 / 1024)}MB). Max 10MB.` }, { status: 400 });
    }

    const supabase = createAdminClient();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error } = await supabase.storage.from("documents").upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, path });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || "Upload fehlgeschlagen" }, { status: 500 });
  }
}
