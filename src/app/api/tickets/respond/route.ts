import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(request: Request) {
  const { ticketId, action, ticketTitle, createdBy } = await request.json();

  const supabase = createAdminClient();
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ success: false });

  const resend = new Resend(resendKey);

  // Get creator's profile
  const { data: creator } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", createdBy)
    .single();

  if (!creator?.email) return NextResponse.json({ success: false, error: "Kein Ersteller gefunden" });

  const isApproved = action === "genehmigt";
  const statusColor = isApproved ? "#16a34a" : "#dc2626";
  const statusLabel = isApproved ? "GENEHMIGT" : "ABGELEHNT";
  const statusEmoji = isApproved ? "✅" : "❌";

  try {
    await resend.emails.send({
      from: "EVENTLINE FSM <noreply@eventline-basel.com>",
      to: creator.email,
      subject: `${statusEmoji} Dein Ticket wurde ${action}: ${ticketTitle}`,
      html: `
        <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto">
          <div style="background:#1a1a1a;padding:20px 24px;border-radius:12px 12px 0 0">
            <h2 style="color:white;margin:0;font-size:16px">EVENTLINE GmbH</h2>
          </div>
          <div style="background:white;padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
            <p style="margin:0 0 12px">Hallo ${creator.full_name},</p>
            <p style="margin:0 0 16px">Dein Ticket wurde bearbeitet:</p>
            <div style="background:#f8f9fa;padding:16px;border-radius:8px;border-left:4px solid ${statusColor};margin:0 0 16px">
              <p style="margin:0 0 8px;font-weight:600;font-size:15px">${ticketTitle}</p>
              <p style="margin:0">
                <span style="background:${statusColor};color:white;padding:3px 12px;border-radius:12px;font-size:13px;font-weight:600">${statusLabel}</span>
              </p>
            </div>
            ${!isApproved ? '<p style="margin:0 0 8px;color:#666;font-size:13px">Bei Fragen wende dich an die Geschäftsleitung.</p>' : '<p style="margin:0 0 8px;color:#666;font-size:13px">Deine Anfrage wird bearbeitet.</p>'}
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
            <p style="margin:0;color:#bbb;font-size:11px">EVENTLINE GmbH · St. Jakobs-Strasse 200 · CH-4052 Basel</p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "E-Mail fehlgeschlagen" });
  }
}
