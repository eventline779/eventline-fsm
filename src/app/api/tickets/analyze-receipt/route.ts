// POST /api/tickets/analyze-receipt — analysiert ein Beleg-Bild via
// OpenAI Vision (gpt-5.4-mini) und liefert strukturiertes Ergebnis:
//   - extracted: Betrag, Kaufdatum, Lieferant
//   - issues: Warnungen wenn Bild unscharf oder Infos fehlen
//   - ok: Gesamt-Plausibilitaet
//
// Wird vom Frontend aufgerufen sobald der User im Beleg-Ticket-Form
// eine Datei waehlt. Server-side weil der API-Key im Frontend nichts
// verloren hat. Body: { image_base64: string, mime_type: string }.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { logError } from "@/lib/log";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-5.4-mini";

const SYSTEM_PROMPT = `Du bist ein Beleg-Analyse-Assistent fuer Eventline FSM.
Analysiere das Bild einer Quittung oder eines Belegs auf Lesbarkeit und Vollstaendigkeit.

Pruefe ob folgende drei Informationen klar erkennbar sind:
1. Betrag (Total) — bevorzugt in CHF
2. Kaufdatum
3. Lieferant / Geschaeftsname

Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt in genau diesem Format,
keine Erklaerung drumherum, kein Markdown-Codeblock:

{
  "ok": boolean,
  "issues": ["..."],
  "extracted": {
    "betrag_chf": number | null,
    "kaufdatum": "YYYY-MM-DD" | null,
    "lieferant": string | null
  }
}

Regeln:
- "ok": true nur wenn alle drei Infos klar lesbar sind UND das Bild wirklich
  eine Quittung/Beleg ist.
- "issues" Array (auf Deutsch): kurze, konkrete Punkte was unklar/unscharf ist.
  Leeres Array wenn alles ok. Beispiele: "Bild ist unscharf", "Datum nicht
  erkennbar", "Kein Beleg im Bild".
- "betrag_chf": Total-Betrag als Zahl. Nur wenn die Quittung CHF ist; bei
  anderer Waehrung null und ein issue dazu.
- "kaufdatum": ISO-Format YYYY-MM-DD. null wenn nicht klar.
- "lieferant": Geschaeftsname (Migros, Conrad, Coop, etc.) oder null.`;

export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "OPENAI_API_KEY fehlt in der Server-Konfiguration" },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body?.image_base64 || !body?.mime_type) {
    return NextResponse.json(
      { success: false, error: "image_base64 + mime_type sind Pflicht" },
      { status: 400 },
    );
  }

  // Sanity-Limit damit kein 50MB-Bild geschickt wird.
  if (typeof body.image_base64 === "string" && body.image_base64.length > 8_000_000) {
    return NextResponse.json(
      { success: false, error: "Bild zu gross (max. 6MB)" },
      { status: 413 },
    );
  }

  // OpenAI Vision via responses-API. Input ist ein structured array
  // mit user-message die Text + Bild kombiniert.
  const dataUrl = `data:${body.mime_type};base64,${body.image_base64}`;
  let openaiResp: Response;
  try {
    openaiResp = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: SYSTEM_PROMPT },
              { type: "input_image", image_url: dataUrl },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    logError("tickets.analyze-receipt.network", err);
    return NextResponse.json(
      { success: false, error: "OpenAI nicht erreichbar" },
      { status: 502 },
    );
  }

  if (!openaiResp.ok) {
    const text = await openaiResp.text().catch(() => "");
    logError("tickets.analyze-receipt.openai-error", { status: openaiResp.status, body: text.slice(0, 500) });
    return NextResponse.json(
      { success: false, error: `OpenAI-Fehler: ${openaiResp.status}` },
      { status: 502 },
    );
  }

  const json = await openaiResp.json();

  // OpenAI responses-API: output ist ein Array mit messages, jede mit
  // content-Array. Wir suchen das erste output_text-Item.
  type OutputContent = { type: string; text?: string };
  type OutputMsg = { type: string; content?: OutputContent[] };
  const output = (json as { output?: OutputMsg[] }).output ?? [];
  let modelText = "";
  for (const msg of output) {
    if (Array.isArray(msg.content)) {
      for (const c of msg.content) {
        if (c.type === "output_text" && typeof c.text === "string") {
          modelText += c.text;
        }
      }
    }
  }

  if (!modelText.trim()) {
    return NextResponse.json(
      { success: false, error: "Keine Antwort vom Modell" },
      { status: 502 },
    );
  }

  // Parsen — manchmal wraps das Modell trotz Anweisung in Markdown.
  // Wir extrahieren das erste {...} JSON-Block.
  const cleaned = modelText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback: erstes balanced JSON-Object aus dem Text extrahieren.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { parsed = null; }
    }
  }

  if (!parsed || typeof parsed !== "object") {
    logError("tickets.analyze-receipt.parse", { raw: modelText.slice(0, 500) });
    return NextResponse.json(
      { success: false, error: "Modell-Antwort konnte nicht geparst werden", raw: modelText },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, result: parsed });
}
