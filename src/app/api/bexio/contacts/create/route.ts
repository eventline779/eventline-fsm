import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bexioContactUrl, findMatchingContacts, BEXIO_NEW_CONTACT_URL } from "@/lib/bexio";

// Body: { customerId }
//
// Sucht in Bexio nach Treffern (Email + Name). Legt NICHT mehr selber an —
// Bexio's API verlangt zu viele Pflichtfelder die wir nicht haben (Anrede,
// Sprache, Branchen-IDs, Kontaktgruppen). Stattdessen leiten wir den User
// auf Bexio's Anlegen-Seite weiter, wo er die Daten manuell befuellt.
//
// Ablauf:
// 1. Schon verknuepft (bexio_contact_id gesetzt) -> URL der existierenden
//    Kontakt-Seite zurueck.
// 2. Match in Bexio -> Liste der Kandidaten zurueck (Frontend zeigt
//    "Verknuepfen-Modal").
// 3. Kein Match -> URL zur Bexio-Anlegen-Seite zurueck (Frontend oeffnet
//    in neuem Tab).
export async function POST(request: NextRequest) {
  try {
    const { customerId } = await request.json();
    if (!customerId) {
      return NextResponse.json({ success: false, error: "customerId fehlt" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: customer, error } = await supabase
      .from("customers")
      .select("id, name, email, bexio_contact_id")
      .eq("id", customerId)
      .single();

    if (error || !customer) {
      return NextResponse.json({ success: false, error: "Kunde nicht gefunden" }, { status: 404 });
    }

    // Schon verknuepft -> URL zurueck.
    if (customer.bexio_contact_id) {
      const id = parseInt(customer.bexio_contact_id, 10);
      return NextResponse.json({
        success: true,
        alreadyLinked: true,
        bexioContactId: customer.bexio_contact_id,
        bexioContactUrl: bexioContactUrl(id),
      });
    }

    // Match-Suche
    const matches = await findMatchingContacts({
      email: customer.email,
      name: customer.name,
    });
    if (matches.length > 0) {
      return NextResponse.json({
        success: false,
        needsLinkConfirmation: true,
        matches: matches.map((m) => ({
          id: m.id,
          name: [m.name_2, m.name_1].filter(Boolean).join(" ").trim() || m.name_1,
          email: m.mail ?? null,
          city: m.city ?? null,
          postcode: m.postcode ?? null,
          url: bexioContactUrl(m.id),
        })),
      });
    }

    // Kein Match -> Bexio's Anlegen-Seite oeffnen
    return NextResponse.json({
      success: true,
      openCreateUrl: BEXIO_NEW_CONTACT_URL,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unbekannter Fehler";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
