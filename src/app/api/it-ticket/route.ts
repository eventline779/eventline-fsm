import { NextResponse } from "next/server";
import { Resend } from "resend";

const PRIORITY_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  niedrig: { label: "Niedrig", color: "#6b7280", emoji: "🟢" },
  normal: { label: "Normal", color: "#3b82f6", emoji: "🔵" },
  hoch: { label: "Hoch", color: "#f59e0b", emoji: "🟠" },
  kritisch: { label: "Kritisch", color: "#dc2626", emoji: "🔴" },
};

export async function POST(request: Request) {
  const { subject, description, priority, reporter, reporterEmail } = await request.json();

  if (!subject || !description) {
    return NextResponse.json({ success: false, error: "Betreff und Beschreibung sind erforderlich" }, { status: 400 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ success: false, error: "Kein RESEND_API_KEY" }, { status: 500 });
  }

  const resend = new Resend(resendKey);
  const p = PRIORITY_LABELS[priority] || PRIORITY_LABELS.normal;
  const ticketNr = `IT-${Date.now().toString(36).toUpperCase()}`;
  const timestamp = new Date().toLocaleString("de-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  try {
    await resend.emails.send({
      from: "EVENTLINE FSM <noreply@eventline-basel.com>",
      to: ["mischa@eventline-basel.com", "leo@eventline-basel.com"],
      replyTo: reporterEmail || undefined,
      subject: `${p.emoji} IT-Ticket ${ticketNr}: ${subject}`,
      html: `
        <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1a1a1a;padding:20px 24px;border-radius:12px 12px 0 0">
            <h2 style="color:white;margin:0;font-size:16px">EVENTLINE GmbH – IT Support</h2>
          </div>
          <div style="background:white;padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
            <table style="width:100%;border-collapse:collapse;margin:0 0 20px">
              <tr>
                <td style="padding:8px 12px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;width:120px"><strong>Ticket-Nr.</strong></td>
                <td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #f0f0f0;font-family:monospace">${ticketNr}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0"><strong>Erstellt von</strong></td>
                <td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #f0f0f0">${reporter}${reporterEmail ? ` (${reporterEmail})` : ""}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0"><strong>Datum</strong></td>
                <td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #f0f0f0">${timestamp}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0"><strong>Priorität</strong></td>
                <td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #f0f0f0"><span style="background:${p.color};color:white;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600">${p.label}</span></td>
              </tr>
            </table>

            <div style="background:#f8f9fa;padding:16px;border-radius:8px;border-left:4px solid ${p.color};margin:0 0 16px">
              <p style="margin:0 0 6px;font-weight:600;font-size:15px;color:#1a1a1a">${subject}</p>
              <p style="margin:0;color:#555;font-size:14px;white-space:pre-wrap;line-height:1.6">${description}</p>
            </div>

            <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
            <p style="margin:0;color:#bbb;font-size:11px">EVENTLINE GmbH · St. Jakobs-Strasse 200 · CH-4052 Basel</p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ success: true, ticketNr });
  } catch {
    return NextResponse.json({ success: false, error: "E-Mail konnte nicht gesendet werden" }, { status: 500 });
  }
}
