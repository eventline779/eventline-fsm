import { NextResponse } from "next/server";
import { Resend } from "resend";

const CATEGORY_LABELS: Record<string, { label: string; emoji: string }> = {
  bestellung: { label: "Bestellung", emoji: "🛒" },
  it: { label: "IT-Problem", emoji: "💻" },
  reparatur: { label: "Reparatur", emoji: "🔧" },
  sonstiges: { label: "Sonstiges", emoji: "📋" },
};

export async function POST(request: Request) {
  const { title, description, category, priority, reporter, reporterEmail, emails: customEmails } = await request.json();

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ success: false, error: "Kein RESEND_API_KEY" });

  const resend = new Resend(resendKey);
  const cat = CATEGORY_LABELS[category] || CATEGORY_LABELS.sonstiges;
  const ticketNr = `TK-${Date.now().toString(36).toUpperCase()}`;
  const isDringend = priority === "dringend";
  const timestamp = new Date().toLocaleString("de-CH", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const html = `
    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1a1a1a;padding:20px 24px;border-radius:12px 12px 0 0">
        <h2 style="color:white;margin:0;font-size:16px">EVENTLINE GmbH – Ticket ${ticketNr}</h2>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
        <table style="width:100%;border-collapse:collapse;margin:0 0 20px">
          <tr>
            <td style="padding:8px 12px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;width:120px"><strong>Ticket-Nr.</strong></td>
            <td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #f0f0f0;font-family:monospace">${ticketNr}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0"><strong>Kategorie</strong></td>
            <td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #f0f0f0">${cat.emoji} ${cat.label}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0"><strong>Erstellt von</strong></td>
            <td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #f0f0f0">${reporter}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0"><strong>Datum</strong></td>
            <td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #f0f0f0">${timestamp}</td>
          </tr>
          ${isDringend ? `<tr><td style="padding:8px 12px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0"><strong>Priorität</strong></td><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0"><span style="background:#dc2626;color:white;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600">DRINGEND</span></td></tr>` : ""}
        </table>
        <div style="background:#f8f9fa;padding:16px;border-radius:8px;border-left:4px solid ${isDringend ? "#dc2626" : "#3b82f6"};margin:0 0 16px">
          <p style="margin:0 0 6px;font-weight:600;font-size:15px;color:#1a1a1a">${title}</p>
          <p style="margin:0;color:#555;font-size:14px;white-space:pre-wrap;line-height:1.6">${description}</p>
        </div>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
        <p style="margin:0;color:#bbb;font-size:11px">EVENTLINE GmbH · St. Jakobs-Strasse 200 · CH-4052 Basel</p>
      </div>
    </div>
  `;

  try {
    await resend.emails.send({
      from: "EVENTLINE FSM <noreply@eventline-basel.com>",
      to: customEmails || (category === "bestellung"
        ? ["mischa@eventline-basel.com", "leo@eventline-basel.com"]
        : ["mischa@eventline-basel.com"]),
      replyTo: reporterEmail || undefined,
      subject: `${isDringend ? "🚨 DRINGEND: " : ""}${cat.emoji} Ticket ${ticketNr}: ${title}`,
      html,
    });
    return NextResponse.json({ success: true, ticketNr });
  } catch {
    return NextResponse.json({ success: false, error: "E-Mail fehlgeschlagen" });
  }
}
