import { NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(request: Request) {
  const { rentalId, email, message, customerName, locationName, eventDate, eventEndDate, pdfUrls } = await request.json();

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ success: false, error: "Kein RESEND_API_KEY" });

  const resend = new Resend(resendKey);
  const baseUrl = "https://eventline-fsm-usyk.vercel.app";

  const confirmUrl = `${baseUrl}/api/rentals/confirm?id=${rentalId}&token=${Buffer.from(rentalId + "-confirm").toString("base64")}`;

  const formatDate = (d: string) => {
    if (!d) return "";
    // Extract date part: "2026-04-13" from "2026-04-13T00:00:00+00:00" or "2026-04-13"
    const datePart = d.split("T")[0];
    const [y, m, day] = datePart.split("-").map(Number);
    const date = new Date(y, m - 1, day, 12, 0, 0);
    return date.toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };
  const dateStr = formatDate(eventDate);
  const endDateStr = formatDate(eventEndDate);

  const docsHtml = pdfUrls && pdfUrls.length > 0
    ? `<div style="margin:16px 0">
        <p style="margin:0 0 8px;font-weight:600;font-size:13px;color:#666">Angehängte Dokumente:</p>
        ${pdfUrls.map((d: any) => `<p style="margin:4px 0"><a href="${d.url}" style="color:#3b82f6;text-decoration:none;font-size:13px">📄 ${d.name}</a></p>`).join("")}
       </div>`
    : "";

  try {
    await resend.emails.send({
      from: "EVENTLINE GmbH <leo@eventline-basel.com>",
      replyTo: "leo@eventline-basel.com",
      to: email,
      subject: `Mietangebot: ${locationName || "Location"} – ${dateStr}`,
      html: `
        <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto">
          <div style="background:#1a1a1a;padding:20px 24px;border-radius:12px 12px 0 0">
            <h2 style="color:white;margin:0;font-size:16px">EVENTLINE GmbH</h2>
          </div>
          <div style="background:white;padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
            <p style="margin:0 0 12px">Guten Tag${customerName ? " " + customerName : ""},</p>
            <p style="margin:0 0 16px">Vielen Dank für Ihre Anfrage. Wir freuen uns, Ihnen folgendes Mietangebot zu unterbreiten:</p>

            <div style="background:#f8f9fa;padding:16px;border-radius:8px;border-left:4px solid #3b82f6;margin:0 0 16px">
              <p style="margin:0 0 4px;font-weight:600;font-size:16px;color:#1a1a1a">${locationName || "Location"}</p>
              <p style="margin:0 0 4px;color:#666">${dateStr}${endDateStr ? ` – ${endDateStr}` : ""}</p>
            </div>

            ${message ? `<p style="margin:0 0 16px;color:#555;font-size:14px;white-space:pre-wrap">${message}</p>` : ""}

            ${docsHtml}

            <div style="text-align:center;margin:24px 0">
              <a href="${confirmUrl}" style="display:inline-block;background:#16a34a;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
                ✅ Vermietung verbindlich bestätigen
              </a>
            </div>

            <p style="margin:0 0 8px;color:#999;font-size:12px;text-align:center">Mit Klick auf den Button bestätigen Sie die Vermietung verbindlich.</p>

            <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
            <p style="margin:0;color:#999;font-size:13px">Bei Fragen erreichen Sie uns unter <a href="mailto:info@eventline-basel.com" style="color:#3b82f6">info@eventline-basel.com</a></p>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
            <p style="margin:0;color:#bbb;font-size:11px">EVENTLINE GmbH · St. Jakobs-Strasse 200 · CH-4052 Basel</p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: "E-Mail fehlgeschlagen" });
  }
}
