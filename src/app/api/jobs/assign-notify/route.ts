import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requirePermission } from "@/lib/api-auth";

export async function POST(request: Request) {
  // Permission-Gate: das Anlegen von calendar_events fuer ANDERE User
  // hebelt sonst die has_permission()-RLS aus 073 aus (Service-Role-
  // Insert). Wer Termine fuer Mitarbeiter anlegen darf, hat kalender:create.
  const auth = await requirePermission("kalender:create");
  if (auth.error) return auth.error;
  const body = await request.json();
  const { job_id, profile_ids, job_title, start_date, end_date } = body;

  if (!job_id || !profile_ids || profile_ids.length === 0) {
    return NextResponse.json({ success: false });
  }

  const supabase = createAdminClient();
  const resendKey = process.env.RESEND_API_KEY;
  const resend = resendKey ? new Resend(resendKey) : null;

  const sent: string[] = [];

  for (const profileId of profile_ids) {
    // Profil laden
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", profileId)
      .single();

    if (!profile) continue;

    // Schicht erstellen wenn Start-Datum vorhanden
    if (start_date) {
      const startTime = start_date.includes("T") ? start_date : `${start_date}T08:00:00`;
      const endTime = end_date
        ? (end_date.includes("T") ? end_date : `${end_date}T17:00:00`)
        : startTime.replace("T08:00", "T17:00");

      // Prüfen ob Schicht schon existiert
      const { data: existing } = await supabase
        .from("calendar_events")
        .select("id")
        .eq("profile_id", profileId)
        .eq("title", `Auftrag: ${job_title}`)
        .gte("start_time", startTime.split("T")[0] + "T00:00:00")
        .lte("start_time", startTime.split("T")[0] + "T23:59:59")
        .single();

      if (!existing) {
        // created_by = der eingeloggte User der die Zuteilung ausloest
        // (audit-trail). Vorher: random first-user-from-listUsers, das war
        // nicht-deterministisch und semantisch falsch.
        await supabase.from("calendar_events").insert({
          title: `Auftrag: ${job_title}`,
          start_time: startTime,
          end_time: endTime,
          profile_id: profileId,
          color: "#3b82f6",
          created_by: auth.user.id,
          all_day: false,
        });
      }
    }

    // E-Mail senden
    if (resend && profile.email) {
      const dateStr = start_date
        ? new Date(start_date.split("T")[0] + "T12:00:00").toLocaleDateString("de-CH", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          })
        : null;

      try {
        await resend.emails.send({
          from: "EVENTLINE FSM <noreply@eventline-basel.com>",
          to: profile.email,
          subject: `Auftrag zugeteilt: ${job_title}${dateStr ? ` – ${dateStr}` : ""}`,
          html: `
            <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto">
              <div style="background:#1a1a1a;padding:20px 24px;border-radius:12px 12px 0 0">
                <h2 style="color:white;margin:0;font-size:16px">EVENTLINE GmbH</h2>
              </div>
              <div style="background:white;padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
                <p style="margin:0 0 12px">Hallo ${profile.full_name},</p>
                <p style="margin:0 0 16px">Dir wurde ein neuer Auftrag zugeteilt:</p>
                <div style="background:#f5f5f5;padding:16px;border-radius:8px;border-left:4px solid #3b82f6;margin:0 0 16px">
                  <p style="margin:0 0 4px;font-weight:600;font-size:16px">${job_title}</p>
                  ${dateStr ? `<p style="margin:0;color:#666">${dateStr}</p>` : ""}
                </div>
                <p style="margin:0 0 8px;color:#999;font-size:13px">Öffne die App für weitere Details.</p>
                <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
                <p style="margin:0;color:#bbb;font-size:11px">EVENTLINE GmbH · St. Jakobs-Strasse 200 · CH-4052 Basel</p>
              </div>
            </div>
          `,
        });
        sent.push(profile.full_name);
      } catch {}
    }
  }

  return NextResponse.json({ success: true, sent });
}
