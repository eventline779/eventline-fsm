import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const token = request.nextUrl.searchParams.get("token");
  const type = request.nextUrl.searchParams.get("type") || "konditionen"; // "konditionen" oder "angebot"

  if (!id || !token) {
    return new NextResponse(errorPage("Ungültiger Link"), { headers: { "Content-Type": "text/html" } });
  }

  const expectedToken = Buffer.from(id + "-confirm").toString("base64");
  if (token !== expectedToken) {
    return new NextResponse(errorPage("Ungültiger Bestätigungslink"), { headers: { "Content-Type": "text/html" } });
  }

  const supabase = createAdminClient();

  // Status je nach Typ setzen
  const newStatus = type === "angebot" ? "bestaetigt" : "konditionen_bestaetigt";
  const titleText = type === "angebot" ? "Angebot angenommen" : "Konditionen bestätigt";

  const { data, error } = await supabase
    .from("rental_requests")
    .update({ status: newStatus })
    .eq("id", id)
    .select("*, customer:customers(name), location:locations(name)")
    .single();

  if (error) {
    return new NextResponse(errorPage("Vermietung nicht gefunden"), { headers: { "Content-Type": "text/html" } });
  }

  // Notify Leo + Mischa
  const { data: admins } = await supabase.from("profiles").select("id").in("email", ["leo@eventline-basel.com", "mischa@eventline-basel.com"]);
  if (admins) {
    for (const admin of admins) {
      await supabase.from("notifications").insert({
        user_id: admin.id,
        title: `✅ ${titleText}: ${data.customer?.name}`,
        message: `${data.location?.name} – ${data.event_date ? new Date(data.event_date).toLocaleDateString("de-CH") : ""}`,
        link: `/anfragen/${id}`,
      });
    }
  }

  const successMsg = type === "angebot"
    ? "Das Angebot wurde angenommen. Wir senden Ihnen den Mietvertrag zu."
    : "Die Konditionen wurden bestätigt. Wir senden Ihnen ein Angebot zu.";

  return new NextResponse(successPage(data.customer?.name, data.location?.name, titleText, successMsg), { headers: { "Content-Type": "text/html" } });
}

function successPage(customer: string, location: string, title: string, message: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
  <body style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;margin:0;padding:40px 20px;background:#f5f5f7;min-height:100vh;display:flex;align-items:center;justify-content:center">
    <div style="max-width:440px;width:100%;text-align:center">
      <div style="background:white;padding:40px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <div style="width:64px;height:64px;background:#dcfce7;border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:32px">✅</div>
        <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a1a">${title}!</h1>
        <p style="margin:0 0 20px;color:#666;font-size:15px">Vielen Dank${customer ? ", " + customer : ""}. ${message}</p>
      </div>
      <p style="margin:20px 0 0;color:#bbb;font-size:12px">EVENTLINE GmbH · St. Jakobs-Strasse 200 · CH-4052 Basel</p>
    </div>
  </body></html>`;
}

function errorPage(msg: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fehler</title></head>
  <body style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;margin:0;padding:40px 20px;background:#f5f5f7;min-height:100vh;display:flex;align-items:center;justify-content:center">
    <div style="max-width:440px;width:100%;text-align:center">
      <div style="background:white;padding:40px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <div style="width:64px;height:64px;background:#fef2f2;border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:32px">❌</div>
        <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a1a">${msg}</h1>
        <p style="margin:0;color:#666;font-size:15px">Bitte kontaktieren Sie uns unter info@eventline-basel.com</p>
      </div>
    </div>
  </body></html>`;
}
