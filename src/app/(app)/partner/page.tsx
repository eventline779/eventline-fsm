"use client";

/**
 * Partner-Kontakte — Locationspartner (role='partner'-User im Firmen-DB
 * mit zugewiesener Location). Vorher als Sub-Tab in /einstellungen
 * versteckt; seit dem Sidebar-Rebuild (Audit-Umsetzung P1) eigener
 * Kontakte-Sidebar-Eintrag, direkt neben Kunden + Lieferanten.
 *
 * Rendert PartnerTab (Kontaktliste + Anlegen/Rollen-Assign) — Rollen-
 * Definitionen, Anfrage-Form und Aktivitaets-Log leben weiterhin unter
 * /einstellungen → Partnerportal (Meta-Konfiguration, nicht Kontaktliste).
 */

import { HeartHandshake } from "lucide-react";
import { PartnerTab } from "@/components/einstellungen/partner-tab";
import { usePermissions } from "@/lib/use-permissions";

export default function PartnerKontaktePage() {
  const { role, ready } = usePermissions();
  if (!ready) return null;
  const isAdmin = role === "admin";

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">Nur für Administratoren.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <HeartHandshake className="h-5 w-5" />
            Partner
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Locationspartner mit Portal-Zugang &mdash; verwalten ihre eigenen Anfragen und Belegungspläne.
          </p>
        </div>
      </div>

      <PartnerTab />
    </div>
  );
}
