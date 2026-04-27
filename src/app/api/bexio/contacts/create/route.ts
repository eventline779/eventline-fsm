import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createContact, createContactAddress, bexioContactUrl, findMatchingContacts } from "@/lib/bexio";

// Body: { customerId, force?: boolean }
//
// Ablauf:
// 1. Kunde aus DB laden. Wenn schon bexio_contact_id gesetzt -> existierenden
//    oeffnen statt neu anlegen.
// 2. Match-Suche in Bexio (Email + Name). Wenn Treffer und !force -> Liste der
//    Kandidaten zurueck (success: false, matches: [...]). Frontend zeigt dann
//    "Verknuepfen-statt-Anlegen"-Dialog.
// 3. Wenn keine Treffer ODER force=true -> neu anlegen, bexio_contact_id auf
//    Customer speichern, URL zurueck.
export async function POST(request: NextRequest) {
  try {
    const { customerId, force } = await request.json();
    if (!customerId) {
      return NextResponse.json({ success: false, error: "customerId fehlt" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: customer, error } = await supabase
      .from("customers")
      .select("id, name, type, email, phone, address_street, address_zip, address_city, address_country, bexio_contact_id")
      .eq("id", customerId)
      .single();

    if (error || !customer) {
      return NextResponse.json({ success: false, error: "Kunde nicht gefunden" }, { status: 404 });
    }

    // Schon verknuepft -> direkt URL zurueck (Frontend oeffnet im Tab).
    if (customer.bexio_contact_id) {
      const id = parseInt(customer.bexio_contact_id, 10);
      return NextResponse.json({
        success: true,
        alreadyLinked: true,
        bexioContactId: customer.bexio_contact_id,
        bexioContactUrl: bexioContactUrl(id),
      });
    }

    // Schritt 1: Match-Suche (nur wenn nicht force-creating)
    if (!force) {
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
    }

    // Schritt 2: Anlegen (kein Match oder force)
    const isCompany = customer.type === "company" || customer.type === "organization";
    let name1 = customer.name;
    let name2: string | null = null;
    if (!isCompany) {
      const lastSpace = customer.name.lastIndexOf(" ");
      if (lastSpace > 0) {
        name2 = customer.name.slice(0, lastSpace).trim();
        name1 = customer.name.slice(lastSpace + 1).trim();
      }
    }

    const result = await createContact({
      isCompany,
      name1,
      name2,
      email: customer.email,
      phone: customer.phone,
      countryCode: customer.address_country,
    });

    // Adresse separat anhaengen (Bexio's /2.0/contact akzeptiert keine Inline-
    // Adresse mehr). Schlaegt das fehl, wird nur geloggt — der Kontakt
    // existiert dann ohne Adresse, das ist besser als gar kein Kontakt.
    await createContactAddress(result.id, {
      street: customer.address_street,
      postcode: customer.address_zip,
      city: customer.address_city,
      countryCode: customer.address_country,
      name: customer.name,
    });

    // Bexio-ID am Kunden speichern (Service-Role, damit RLS nicht blockt)
    const admin = createAdminClient();
    await admin
      .from("customers")
      .update({ bexio_contact_id: String(result.id) })
      .eq("id", customerId);

    return NextResponse.json({
      success: true,
      bexioContactId: String(result.id),
      bexioContactUrl: bexioContactUrl(result.id),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unbekannter Fehler";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
