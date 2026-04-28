// Liste-Route ist nach /locations gewandert (Standorte + Raeume vereint).
// Detail-Route /standorte/[id] bleibt unveraendert.
import { redirect } from "next/navigation";

export default function StandorteRedirect() {
  redirect("/locations");
}
