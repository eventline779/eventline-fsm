// POST /api/tickets/analyze-material — analysiert einen Warenkorb-Screenshot
// (digitec.ch, galaxus.ch, conrad.ch, etc.) via OpenAI Vision und
// extrahiert Artikel + Menge + Total-Betrag.
//
// Wird vom Frontend aufgerufen sobald der User im Material-Ticket-Form
// einen Screenshot hochlaedt. Same Pattern wie analyze-receipt aber
// anderer Prompt.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { logError } from "@/lib/log";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-5.4-mini";

const SYSTEM_PROMPT = `Du bist ein Material-Anfrage-Assistent fuer Eventline FSM.
Analysiere das Bild eines Warenkorbs oder einer Produkt-Auflistung
(typisch von digitec.ch, galaxus.ch, conrad.ch oder aehnlichen Shops).

Extrahiere die folgenden Infos und antworte AUSSCHLIESSLICH mit einem
validen JSON-Objekt in genau diesem Format, kein Markdown-Codeblock:

{
  "ok": boolean,
  "issues": ["..."],
  "extracted": {
    "artikel": string | null,
    "menge": number | null,
    "betrag_chf": number | null
  }
}

Regeln:
- "ok": true nur wenn alle drei Infos klar erkennbar sind.
- "issues" Array (auf Deutsch): kurze, konkrete Punkte was unklar/unscharf
  ist. Leeres Array wenn alles ok. Beispiele: "Bild ist unscharf",
  "Mehrere Artikel — nicht klar welcher Total-Betrag", "Kein Warenkorb-
  Bildschirm".
- "artikel": Bei einem Artikel: dessen voller Name (z.B. "Sennheiser
  EW-DX EM 4 Dante MK2 Empfaenger"). Bei mehreren Artikeln: alle
  Artikel-Namen kommasepariert (z.B. "XLR-Kabel 5m, HDMI-Kabel 2m,
  Lautsprecher-Kabel 10m").
- "menge": Gesamt-Stueckzahl. Wenn Warenkorb 3 verschiedene Items
  zu je 1 Stueck zeigt → 3. Wenn 1 Item zu 5 Stueck → 5. null wenn
  unklar.
- "betrag_chf": Total-Betrag in CHF (mit Steuern wenn ersichtlich).
  null wenn andere Waehrung oder Total nicht erkennbar.`;

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

  if (typeof body.image_base64 === "string" && body.image_base64.length > 8_000_000) {
    return NextResponse.json(
      { success: false, error: "Bild zu gross (max. 6MB)" },
      { status: 413 },
    );
  }

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
    logError("tickets.analyze-material.network", err);
    return NextResponse.json(
      { success: false, error: "OpenAI nicht erreichbar" },
      { status: 502 },
    );
  }

  if (!openaiResp.ok) {
    const text = await openaiResp.text().catch(() => "");
    logError("tickets.analyze-material.openai-error", { status: openaiResp.status, body: text.slice(0, 500) });
    return NextResponse.json(
      { success: false, error: `OpenAI-Fehler: ${openaiResp.status}` },
      { status: 502 },
    );
  }

  const json = await openaiResp.json();

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

  const cleaned = modelText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { parsed = null; }
    }
  }

  if (!parsed || typeof parsed !== "object") {
    logError("tickets.analyze-material.parse", { raw: modelText.slice(0, 500) });
    return NextResponse.json(
      { success: false, error: "Modell-Antwort konnte nicht geparst werden", raw: modelText },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, result: parsed });
}
