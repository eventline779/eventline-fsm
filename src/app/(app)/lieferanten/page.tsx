"use client";

/**
 * Deep-Link-Alias fuer Lieferanten. Die eigentliche View lebt in
 * src/components/lieferanten/lieferanten-view.tsx — sowohl diese Seite als
 * auch /kontakte?tab=lieferanten rendern sie. So bleiben bestehende Links
 * (Bookmarks, interne Rechnungs-Referenzen) funktionsfaehig.
 */

import { LieferantenView } from "@/components/lieferanten/lieferanten-view";

export default function LieferantenPage() {
  return <LieferantenView />;
}
