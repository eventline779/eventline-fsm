import { NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(request: Request) {
  const { email, message, customerName, locationName, eventDate, eventEndDate, pdfUrls } = await request.json();

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ success: false, error: "Kein RESEND_API_KEY" });

  const resend = new Resend(resendKey);

  const formatDate = (d: string) => {
    if (!d) return "";
    const datePart = d.split("T")[0];
    const [y, m, day] = datePart.split("-").map(Number);
    const date = new Date(y, m - 1, day, 12, 0, 0);
    return date.toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };
  const dateStr = formatDate(eventDate);
  const endDateStr = formatDate(eventEndDate);

  const docsHtml = pdfUrls && pdfUrls.length > 0
    ? `<div style="margin:16px 0">
        <p style="margin:0 0 8px;font-weight:600;font-size:14px;color:#1a1a1a">Mietvertrag:</p>
        ${pdfUrls.map((d: any) => `<p style="margin:6px 0"><a href="${d.url}" style="display:inline-block;background:#3b82f6;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">📄 ${d.name} herunterladen</a></p>`).join("")}
       </div>`
    : "";

  try {
    await resend.emails.send({
      from: "EVENTLINE GmbH <leo@eventline-basel.com>",
      replyTo: "leo@eventline-basel.com",
      to: email,
      subject: `Mietvertrag: ${locationName || "Location"} – ${dateStr}`,
      html: `
        <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto">
          <div style="background:#1a1a1a;padding:20px 24px;border-radius:12px 12px 0 0">
            <h2 style="color:white;margin:0;font-size:16px">EVENTLINE GmbH</h2>
          </div>
          <div style="background:white;padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
            <p style="margin:0 0 12px">Guten Tag${customerName ? " " + customerName : ""},</p>
            <p style="margin:0 0 16px">Anbei erhalten Sie den Mietvertrag für Ihre Vermietung:</p>

            <div style="background:#f8f9fa;padding:16px;border-radius:8px;border-left:4px solid #1a1a1a;margin:0 0 16px">
              <p style="margin:0 0 4px;font-weight:600;font-size:16px;color:#1a1a1a">${locationName || "Location"}</p>
              <p style="margin:0;color:#666">${dateStr}${endDateStr ? ` – ${endDateStr}` : ""}</p>
            </div>

            ${message ? `<p style="margin:0 0 16px;color:#555;font-size:14px;white-space:pre-wrap">${message}</p>` : ""}

            ${docsHtml}

            <p style="margin:16px 0 0;color:#555;font-size:13px">Bitte den Vertrag unterschrieben an uns zurücksenden.</p>

            <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
            <p style="margin:0;color:#999;font-size:13px">Bei Fragen erreichen Sie uns unter <a href="mailto:info@eventline-basel.com" style="color:#3b82f6">info@eventline-basel.com</a></p>
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
