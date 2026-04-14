import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { Resend } from "resend";

export const maxDuration = 30;

export async function POST(request: Request) {
  const { filePath, fileName, date, reason, creatorName } = await request.json();

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ success: false, error: "Kein RESEND_API_KEY" });

  const supabase = createAdminClient();

  // Datei als Buffer aus Storage holen
  const { data: fileData, error: fileError } = await supabase.storage.from("documents").download(filePath);
  if (fileError || !fileData) {
    return NextResponse.json({ success: false, error: "Datei nicht gefunden: " + (fileError?.message || "") });
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const resend = new Resend(resendKey);

  const dateStr = date ? new Date(date).toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";

  try {
    await resend.emails.send({
      from: "EVENTLINE GmbH <noreply@eventline-basel.com>",
      to: "buchhaltung@eventline-basel.com",
      replyTo: "leo@eventline-basel.com",
      subject: `Beleg: ${reason}${dateStr ? ` – ${dateStr}` : ""}`,
      html: `
        <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto">
          <div style="background:#1a1a1a;padding:20px 24px;border-radius:12px 12px 0 0">
            <h2 style="color:white;margin:0;font-size:16px">EVENTLINE GmbH – Neuer Beleg</h2>
          </div>
          <div style="background:white;padding:24px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
            <table style="width:100%;border-collapse:collapse;margin:0 0 16px">
              <tr>
                <td style="padding:8px 12px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;width:120px"><strong>Datum</strong></td>
                <td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #f0f0f0">${dateStr || "—"}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0"><strong>Grund</strong></td>
                <td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #f0f0f0">${reason}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0"><strong>Hochgeladen von</strong></td>
                <td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #f0f0f0">${creatorName || "Unbekannt"}</td>
              </tr>
            </table>
            <p style="margin:16px 0 0;color:#555;font-size:13px">Der Beleg ist als Anhang beigefügt.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
            <p style="margin:0;color:#bbb;font-size:11px">EVENTLINE GmbH · St. Jakobs-Strasse 200 · CH-4052 Basel</p>
          </div>
        </div>
      `,
      attachments: [{ filename: fileName, content: buffer }],
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || "E-Mail fehlgeschlagen" });
  }
}
