"use client";

/**
 * Deep-Link-Alias fuer Kunden. Die eigentliche View lebt in
 * src/components/kunden/kunden-view.tsx — sowohl diese Seite als auch
 * /kontakte?tab=kunden rendern sie. So bleiben bestehende Deep-Links
 * (/kunden/[id], Bookmarks, Bexio-OAuth-Callback etc.) funktionsfaehig.
 */

import { KundenView } from "@/components/kunden/kunden-view";

export default function KundenPage() {
  return <KundenView />;
}
