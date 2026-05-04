import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { findInvoiceByNr, bexioInvoiceUrl, BEXIO_INVOICE_LIST_URL } from "@/lib/bexio";

// GET /api/bexio/open-invoice?nr=12345
//
// Browser oeffnet diesen Link in neuem Tab (vom "Rechnungsnummer XXXXX"-
// Button im Auftrags-Archiv). Wir schlagen die Bexio-Rechnungs-ID anhand
// der document_nr nach und redirected den User direkt zur Bexio-Detailseite.
//
// Faellt zurueck auf die ungefilterte Bexio-Rechnungsliste wenn:
//   - Bexio nicht verbunden / Scope fehlt -> bexioFetch wirft, findInvoiceByNr
//     swallowed und gibt null zurueck.
//   - Rechnung mit dieser Nummer nicht gefunden in Bexio.
//   - Die nr-Query fehlt.
// Damit hat der User immer eine sinnvolle Landung statt Error-Seite.
//
// Permission: bexio:use (gleich wie andere Bexio-Aktionen).

export async function GET(request: NextRequest) {
  const auth = await requirePermission("bexio:use");
  if (auth.error) return auth.error;

  const nr = request.nextUrl.searchParams.get("nr")?.trim();
  if (!nr) {
    return NextResponse.redirect(BEXIO_INVOICE_LIST_URL);
  }

  const invoice = await findInvoiceByNr(nr);
  if (invoice) {
    return NextResponse.redirect(bexioInvoiceUrl(invoice.id));
  }
  return NextResponse.redirect(BEXIO_INVOICE_LIST_URL);
}
