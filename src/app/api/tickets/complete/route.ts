import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireUser } from "@/lib/api-auth";

export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { ticketId, ticketTitle, createdBy, completedBy } = await request.json();

  const supabase = createAdminClient();
  const resendKey = process.env.RESEND_API_KEY;

  // Ticket löschen (= ins Archiv = weg aus aktiver Liste)
  await supabase.from("tickets").delete().eq("id", ticketId);

  // Ersteller finden
  const { data: creator } = await supabase.from("profiles").select("full_name, email, id").eq("id", createdBy).single();

  // In-App Benachrichtigung
  if (creator?.id) {
    await supabase.from("notifications").insert({
      user_id: creator.id,
      title: `✅ Ticket erledigt: ${ticketTitle}`,
      message: `Dein Ticket wurde erledigt${completedBy ? ` von ${completedBy}` : ""}.`,
      link: "/tickets",
    });
  }

  // E-Mail senden
  if (resendKey && creator?.email) {
    const resend = new Resend(resendKey);
    try {
      await resend.emails.send({
        from: "EVENTLINE FSM <noreply@eventline-basel.com>",
        to: creator.email,
        subject: `✅ Dein Ticket wurde erledigt: ${ticketTitle}`,
        html: `
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto">
            <div style="background:#1a1a1a;padding:20px 24px;border-radius:12px 12px 0 0">
              <h2 style="color:white;margin:0;font-size:16px">EVENTLINE GmbH</h2>
            </div>
            <div style="background:white;padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
              <p style="margin:0 0 12px">Hallo ${creator.full_name},</p>
              <p style="margin:0 0 16px">Dein Ticket wurde erledigt:</p>
              <div style="background:#f0fdf4;padding:16px;border-radius:8px;border-left:4px solid #16a34a;margin:0 0 16px">
                <p style="margin:0 0 8px;font-weight:600;font-size:15px">${ticketTitle}</p>
                <p style="margin:0">
                  <span style="background:#16a34a;color:white;padding:3px 12px;border-radius:12px;font-size:13px;font-weight:600">ERLEDIGT</span>
                </p>
              </div>
              ${completedBy ? `<p style="margin:0 0 8px;color:#666;font-size:13px">Erledigt von <strong>${completedBy}</strong>.</p>` : ""}
              <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
              <p style="margin:0;color:#bbb;font-size:11px">EVENTLINE GmbH · St. Jakobs-Strasse 200 · CH-4052 Basel</p>
            </div>
          </div>
        `,
      });
    } catch {}
  }

  return NextResponse.json({ success: true });
}
