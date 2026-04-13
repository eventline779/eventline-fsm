import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== "migrate5225") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUrl = process.env.SUPABASE_DB_URL || `postgresql://postgres.lyzvkoxlebecwikgsrqb:${process.env.SUPABASE_DB_PASSWORD}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;

  try {
    // Use fetch to Supabase SQL endpoint
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const sql = `
      ALTER TABLE public.rental_requests DROP CONSTRAINT IF EXISTS rental_requests_status_check;
      ALTER TABLE public.rental_requests ADD CONSTRAINT rental_requests_status_check
        CHECK (status IN ('neu', 'konditionen_gesendet', 'konditionen_bestaetigt', 'angebot_gesendet', 'in_bearbeitung', 'bestaetigt', 'abgelehnt'));
      UPDATE public.rental_requests SET status = 'konditionen_gesendet' WHERE status = 'in_bearbeitung';
    `;

    const res = await fetch(`${supabaseUrl}/pg/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: sql }),
    });

    const text = await res.text();
    return NextResponse.json({ status: res.status, result: text });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
