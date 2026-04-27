import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// Customer-facing Confirm-Link aus der Mail. Kein Login.
// Der Frontend-Flow rueckelt den Step schon beim "Mail senden" hoch (auf 2
// bzw. 4 — den Warte-Stand). Der Kunden-Klick:
//   type=konditionen -> request_step >= 3 (Naechste Aktion: Angebot senden)
//   type=angebot     -> Vermietentwurf direkt -> Auftrag (status='offen',
//                       request_step=null). Schritt 5 gibt's nicht mehr.
// So sieht der Kunde beim ERSTEN Klick die "Wurde bestaetigt"-Page, nicht
// die "schon bestaetigt"-Page (die zeigt sich erst beim 2. Klick).
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

  const customerName = (existing.customer as unknown as { name: string } | null)?.name ?? "";
  const locationName = (existing.location as unknown as { name: string } | null)?.name ?? "";
  const titleText = type === "angebot" ? "Angebot best&auml;tigt" : "Konditionen best&auml;tigt";

  if (existing.status !== "anfrage") {
    // Wurde bereits in einen Auftrag konvertiert (Status nicht mehr 'anfrage')
    return new NextResponse(
      successPage(customerName, locationName, titleText,
        type === "angebot"
          ? "Sie haben das Angebot bereits best&auml;tigt. Wir erarbeiten Ihr Angebot."
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
          ? "Sie haben das Angebot bereits best&auml;tigt. Wir erarbeiten Ihr Angebot."
          : "Sie haben die Konditionen bereits best&auml;tigt. Wir erarbeiten Ihr Angebot."
      ),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  // Erstmaliger Klick — Step weiterstellen.
  // Bei Angebot-Bestaetigung wandeln wir den Vermietentwurf direkt in einen
  // freigegebenen Auftrag um: status='offen' (nicht 'entwurf' — die Akquise-
  // Phase war ja schon der Vermietentwurf, kein zweiter Entwurfs-Schritt
  // noetig) + request_step=null. was_anfrage=true bleibt, damit der
  // hellblaue Vermietung-Tag auf dem neuen Auftrag haengt. Resultat: in der
  // Auftraege-Liste taucht er ohne weiteres Status-Tag mit nur Vermietung-
  // Marker auf, und das Donut-Diagramm zaehlt ihn ins Bevorstehend-Segment
  // (mit hellblauem Vermietung-Sub).
  if (type === "angebot") {
    await supabase.from("jobs").update({
      status: "offen",
      request_step: null,
    }).eq("id", id);
  } else {
    await supabase.from("jobs").update({ request_step: targetStep }).eq("id", id);
  }

  // Mitarbeiter benachrichtigen
  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .in("email", ["leo@eventline-basel.com", "mischa@eventline-basel.com"]);

  if (admins) {
    const title = type === "angebot"
      ? `Angebot best&auml;tigt — Auftrag erstellt: ${customerName}`
      : `Konditionen best&auml;tigt: ${customerName}`;
    const link = type === "angebot" ? `/auftraege/${id}` : `/auftraege/vermietentwurf/${id}`;
    for (const admin of admins) {
      await supabase.from("notifications").insert({
        user_id: admin.id,
        title,
        message: locationName,
        link,
      });
    }
  }

  const successMsg = type === "angebot"
    ? "Das Angebot wurde best&auml;tigt. Wir erarbeiten Ihr Angebot."
    : "Die Konditionen wurden best&auml;tigt. Wir erarbeiten Ihr Angebot.";

  return new NextResponse(
    successPage(customerName, locationName, titleText, successMsg),
    { headers: { "Content-Type": "text/html" } },
  );
}

// Gemeinsame Page-Shell — Logo oben, zentrale Karte, Footer.
// Variante "success" (gruener Haken-Kreis) und "error" (roter X-Kreis)
// teilen sich die Struktur, unterscheiden sich nur im Icon + Akzent.
// Light + Dark Mode automatisch via prefers-color-scheme. Logo wechselt
// zwischen logo-gmbh-black.png (light) und logo-gmbh.png (dark).
function pageShell(opts: {
  variant: "success" | "error";
  title: string;
  sub?: string;
  message: string;
}) {
  const { variant, title, sub, message } = opts;
  const accentLight = variant === "success" ? "#16a34a" : "#dc2626";
  const accentDark  = variant === "success" ? "#22c55e" : "#ef4444";
  const icon = variant === "success"
    ? `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
    : `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  return `<!DOCTYPE html><html lang="de"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#f8f9fb" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)">
  <title>${title} — EVENTLINE</title>
  <style>
    :root{
      --bg-from:#f8f9fb;
      --bg-to:#eef0f4;
      --card:#ffffff;
      --card-shadow:0 1px 2px rgba(0,0,0,0.04),0 8px 32px rgba(0,0,0,0.06);
      --title:#0a0a0a;
      --sub:#737373;
      --msg:#404040;
      --footer:#a3a3a3;
      --accent:${accentLight};
      --accent-bg:${variant === "success" ? "#dcfce7" : "#fee2e2"};
    }
    @media (prefers-color-scheme: dark){
      :root{
        --bg-from:#0a0a0a;
        --bg-to:#161616;
        --card:#1a1a1a;
        --card-shadow:0 1px 2px rgba(0,0,0,0.4),0 8px 32px rgba(0,0,0,0.5);
        --title:#fafafa;
        --sub:#888888;
        --msg:#cccccc;
        --footer:#666666;
        --accent:${accentDark};
        --accent-bg:${variant === "success" ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)"};
      }
    }
    *{box-sizing:border-box}
    html,body{margin:0;padding:0}
    body{
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",Helvetica,Arial,sans-serif;
      background:linear-gradient(180deg,var(--bg-from) 0%,var(--bg-to) 100%);
      min-height:100vh;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:32px 20px;
      color:var(--title);
      -webkit-font-smoothing:antialiased;
    }
    .wrap{max-width:480px;width:100%;text-align:center}
    .brand{margin-bottom:32px;display:flex;justify-content:center}
    .brand img{height:40px;width:auto;display:block}
    .brand .logo-light{display:block}
    .brand .logo-dark{display:none}
    @media (prefers-color-scheme: dark){
      .brand .logo-light{display:none}
      .brand .logo-dark{display:block}
    }
    .card{
      background:var(--card);border-radius:20px;
      padding:48px 32px;
      box-shadow:var(--card-shadow);
    }
    .icon-wrap{
      width:72px;height:72px;border-radius:50%;
      background:var(--accent-bg);
      color:var(--accent);
      display:inline-flex;align-items:center;justify-content:center;
      margin-bottom:24px;
    }
    h1{
      margin:0 0 8px;
      font-size:24px;font-weight:600;letter-spacing:-0.01em;line-height:1.2;
      color:var(--title);
    }
    .sub{
      margin:0 0 20px;color:var(--sub);font-size:13px;font-weight:500;
    }
    .msg{
      margin:0;color:var(--msg);font-size:15px;line-height:1.55;
    }
    .accent-line{
      width:32px;height:3px;border-radius:2px;
      background:var(--accent);
      margin:20px auto 0;
    }
    footer{
      margin-top:24px;color:var(--footer);font-size:11px;letter-spacing:0.02em;
    }
    footer a{color:inherit;text-decoration:none}
    @media (max-width:480px){
      .card{padding:36px 24px}
      h1{font-size:21px}
    }
  </style>
  </head>
  <body>
    <div class="wrap">
      <div class="brand">
        <img class="logo-light" src="/logo-gmbh-black.png" alt="EVENTLINE GmbH">
        <img class="logo-dark" src="/logo-gmbh.png" alt="EVENTLINE GmbH">
      </div>
      <div class="card">
        <div class="icon-wrap">${icon}</div>
        <h1>${title}</h1>
        ${sub ? `<p class="sub">${sub}</p>` : ""}
        <p class="msg">${message}</p>
        <div class="accent-line"></div>
      </div>
      <footer>
        EVENTLINE GmbH &middot; St. Jakobs-Strasse 200 &middot; 4052 Basel<br>
        <a href="mailto:leo@eventline-basel.com">leo@eventline-basel.com</a>
      </footer>
    </div>
  </body></html>`;
}

function successPage(customer: string, location: string, title: string, message: string) {
  const sub = [customer, location].filter(Boolean).join(" &middot; ");
  return pageShell({ variant: "success", title, sub, message });
}

function errorPage(msg: string) {
  return pageShell({
    variant: "error",
    title: msg,
    message: "Bitte kontaktieren Sie uns unter leo@eventline-basel.com.",
  });
}
