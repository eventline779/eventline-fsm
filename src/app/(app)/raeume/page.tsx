// Liste-Route ist nach /locations gewandert (Standorte + Raeume vereint).
// Detail-Route /raeume/[id] bleibt unveraendert.
import { redirect } from "next/navigation";

export default function RaeumeRedirect() {
  redirect("/locations");
}
