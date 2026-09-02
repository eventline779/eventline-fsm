"use client";

/**
 * Deep-Link-Alias fuer Partner. Die eigentliche View lebt in
 * src/components/partner/partner-view.tsx — sowohl diese Seite als auch
 * /kontakte?tab=partner rendern sie. So bleiben bestehende Links
 * (Sidebar-Alt, Bookmarks, Mails) auf /partner funktionsfaehig.
 */

import { PartnerView } from "@/components/partner/partner-view";

export default function PartnerKontaktePage() {
  return <PartnerView />;
}
