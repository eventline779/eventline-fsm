import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// Customer-facing Confirm-Link aus der Mail. Kein Login.
// Der Kunden-Klick ruckelt das job genau auf den naechstliegenden
// "bestaetigt"-Step weiter — der Mitarbeiter muss dann selbst weiterklicken
// auf "senden":
//   type=konditionen -> request_step >= 2 (Konditionen bestaetigt)
//   type=angebot     -> request_step >= 4 (Angebot bestaetigt)
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
  const targetStep = type === "angebot" ? 4 : 2;

  const { data: existing, error: loadErr } = await supabase
    .from("jobs")
    .select("status, request_step, customer:customers(name), location:locations(name)")
    .eq("id", id)
    .single();

  if (loadErr || !existing) {
    return new NextResponse(errorPage("Vermietentwurf nicht gefunden"), { headers: { "Content-Type": "text/html" } });
  }

  const customerName = (existing.customer as unknown as { name: string } | null)?.name ?? "";
  const locationName = (existing.location as unknown as { name: string } | null)?.name ?? "";
  const titleText = type === "angebot" ? "Angebot angenommen" : "Konditionen best&auml;tigt";

  if (existing.status !== "anfrage") {
    // Wurde bereits in einen Auftrag konvertiert (Status nicht mehr 'anfrage')
    return new NextResponse(
      successPage(customerName, locationName, titleText,
        type === "angebot"
          ? "Sie haben das Angebot bereits best&auml;tigt. Wir erarbeiten Ihren Mietvertrag."
          : "Sie haben die Konditionen bereits best&auml;tigt. Wir erarbeiten Ihr Angebot."
      ),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  // Schon mal geklickt: request_step ist bereits auf oder ueber dem Ziel.
  // Statt nochmal zu schreiben + zu benachrichtigen, dem Kunden klar machen,
  // dass wir die Bestaetigung schon haben und am Naechsten arbeiten.
  if ((existing.request_step ?? 0) >= targetStep) {
    return new NextResponse(
      successPage(customerName, locationName, titleText,
        type === "angebot"
          ? "Sie haben das Angebot bereits best&auml;tigt. Wir erarbeiten Ihren Mietvertrag und senden ihn Ihnen in K&uuml;rze zu."
          : "Sie haben die Konditionen bereits best&auml;tigt. Wir erarbeiten Ihr Angebot und senden es Ihnen in K&uuml;rze zu."
      ),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  // Erstmaliger Klick — Step weiterstellen + Mitarbeiter benachrichtigen
  await supabase.from("jobs").update({ request_step: targetStep }).eq("id", id);

  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .in("email", ["leo@eventline-basel.com", "mischa@eventline-basel.com"]);

  if (admins) {
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
    ? "Das Angebot wurde angenommen. Wir erarbeiten Ihren Mietvertrag und senden ihn Ihnen in K&uuml;rze zu."
    : "Die Konditionen wurden best&auml;tigt. Wir erarbeiten Ihr Angebot und senden es Ihnen in K&uuml;rze zu.";

  return new NextResponse(
    successPage(customerName, locationName, titleText, successMsg),
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
