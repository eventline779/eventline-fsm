import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// Customer-facing Confirm-Link aus der Mail. Kein Login.
// type=konditionen -> request_step >= 3 (Schritt 1 -> Schritt 3, "Konditionen ausgewaehlt" uebersprungen)
// type=angebot     -> request_step >= 5 (Schritt 3 -> Schritt 5, "Angebot bestaetigt" uebersprungen)
//
// Idempotent: Klickt der Kunde mehrmals, bleibt der Step beim hoechsten erreichten Wert.
// Sicherheit: Token-Check ueber base64(jobId + "-confirm"). Reicht fuer den Use-Case
// (eindeutiger Link pro Anfrage), kein Schutz gegen interne Kompromittierung — diese
// Route hat keine Loeschwirkung.

function expectedToken(jobId: string) {
  return Buffer.from(jobId + "-confirm").toString("base64");
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const token = request.nextUrl.searchParams.get("token");
  const type = request.nextUrl.searchParams.get("type");

  if (!id || !token || (type !== "konditionen" && type !== "angebot")) {
    return new NextResponse(errorPage("Ungueltiger Link"), { headers: { "Content-Type": "text/html" } });
  }

  if (token !== expectedToken(id)) {
    return new NextResponse(errorPage("Ungueltiger Best&auml;tigungslink"), { headers: { "Content-Type": "text/html" } });
  }

  const supabase = createAdminClient();
  const targetStep = type === "angebot" ? 5 : 3;

  const { data: existing, error: loadErr } = await supabase
    .from("jobs")
    .select("status, request_step, customer:customers(name), location:locations(name)")
    .eq("id", id)
    .single();

  if (loadErr || !existing) {
    return new NextResponse(errorPage("Vermietentwurf nicht gefunden"), { headers: { "Content-Type": "text/html" } });
  }

  if (existing.status !== "anfrage") {
    return new NextResponse(
      successPage(
        (existing.customer as unknown as { name: string } | null)?.name ?? "",
        (existing.location as unknown as { name: string } | null)?.name ?? "",
        type === "angebot" ? "Angebot angenommen" : "Konditionen best&auml;tigt",
        "Wir haben Ihre Best&auml;tigung bereits erhalten."
      ),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  // Nur weiterstellen wenn nicht schon weiter
  if ((existing.request_step ?? 0) < targetStep) {
    await supabase.from("jobs").update({ request_step: targetStep }).eq("id", id);
  }

  // Admins benachrichtigen
  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .in("email", ["leo@eventline-basel.com", "mischa@eventline-basel.com"]);

  if (admins) {
    const customerName = (existing.customer as unknown as { name: string } | null)?.name ?? "Kunde";
    const locationName = (existing.location as unknown as { name: string } | null)?.name ?? "";
    const title = type === "angebot" ? `Angebot angenommen: ${customerName}` : `Konditionen best&auml;tigt: ${customerName}`;
    for (const admin of admins) {
      await supabase.from("notifications").insert({
        user_id: admin.id,
        title,
        message: locationName,
        link: `/auftraege/vermietentwurf/${id}`,
      });
    }
  }

  const successMsg = type === "angebot"
    ? "Das Angebot wurde angenommen. Wir senden Ihnen den Mietvertrag zu."
    : "Die Konditionen wurden best&auml;tigt. Wir senden Ihnen das Angebot zu.";
  const titleText = type === "angebot" ? "Angebot angenommen" : "Konditionen best&auml;tigt";

  return new NextResponse(
    successPage(
      (existing.customer as unknown as { name: string } | null)?.name ?? "",
      (existing.location as unknown as { name: string } | null)?.name ?? "",
      titleText,
      successMsg,
    ),
    { headers: { "Content-Type": "text/html" } },
  );
}

function successPage(customer: string, location: string, title: string, message: string) {
  const sub = [customer, location].filter(Boolean).join(" &middot; ");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
  <body style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;margin:0;padding:40px 20px;background:#f5f5f7;min-height:100vh;display:flex;align-items:center;justify-content:center">
    <div style="max-width:440px;width:100%;text-align:center">
      <div style="background:white;padding:40px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a1a">${title}</h1>
        ${sub ? `<p style="margin:0 0 12px;color:#888;font-size:13px">${sub}</p>` : ""}
        <p style="margin:0;color:#666;font-size:15px">${message}</p>
      </div>
      <p style="margin:20px 0 0;color:#bbb;font-size:12px">EVENTLINE GmbH &middot; St. Jakobs-Strasse 200 &middot; CH-4052 Basel</p>
    </div>
  </body></html>`;
}

function errorPage(msg: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fehler</title></head>
  <body style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;margin:0;padding:40px 20px;background:#f5f5f7;min-height:100vh;display:flex;align-items:center;justify-content:center">
    <div style="max-width:440px;width:100%;text-align:center">
      <div style="background:white;padding:40px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a1a">${msg}</h1>
        <p style="margin:0;color:#666;font-size:15px">Bitte kontaktieren Sie uns unter leo@eventline-basel.com</p>
      </div>
    </div>
  </body></html>`;
}
