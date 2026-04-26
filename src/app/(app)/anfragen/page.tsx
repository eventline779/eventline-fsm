import { redirect } from "next/navigation";

// Mietanfragen sind in /auftraege integriert. Diese Route bleibt nur als Redirect
// fuer alte Bookmarks bestehen.
export default function AnfragenRedirect() {
  redirect("/auftraege");
}
