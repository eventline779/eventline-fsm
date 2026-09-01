"use client";

/**
 * Löhne-Hub (bis 2026-08 "HR-Hub" mit Operativ/Löhne-Tabs).
 *
 * Nach dem Sidebar-Rebuild (Audit-Umsetzung P1) sind Stempelzeiten,
 * Tickets, Ferien und Todos eigene Top-Level-Sidebar-Bereiche — die
 * Operativ-Zwischenseite entfaellt komplett. /hr ist damit ausschliesslich
 * der admin-only Löhne-Hub:
 *
 *   • Lohnsummen-Prognose (Ausgleichskasse / SUVA / BVG-Meldung)   ← neu (aus /analytics)
 *   • Sub-Tabs (Trust-gated):
 *       - Abrechnung        — Monats-Stundenuebersicht inkl. BVG-Vorausschau
 *       - Lohnabrechnungen  — PDF generieren + manuelle Uploads
 *       - Mitarbeiter-Lohn  — Brutto-Stundenlohn + Overrides pro MA
 *       - Standardwerte     — firmenweite Default-Abzuege
 *
 * Eigene Lohndokumente (fuer alle Rollen) leben unter /mein-konto → Dokumente.
 * Stammdaten der MA (Name, Email, Rolle, Geburtsdatum) leben unter
 * /einstellungen → Team.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Wallet, Table, FileText, Users, Settings as SettingsIcon } from "lucide-react";
import { usePermissions } from "@/lib/use-permissions";
import { cn } from "@/lib/utils";
import { LohndokumenteAdmin } from "@/components/hr/lohndokumente-admin";
import { MonatsstundenTable } from "@/components/hr/monatsstunden-table";
import { LohnStandardwerteCard } from "@/components/hr/loehne/lohn-standardwerte-card";
import { MitarbeiterLohnTab } from "@/components/hr/loehne/mitarbeiter-lohn-tab";
import { LohnsummenPrognose } from "@/components/analytics/lohnsummen-prognose";
import { TrustedDeviceGate } from "@/components/trust/trusted-device-gate";

type LoehneSubTab = "abrechnung" | "lohnabrechnungen" | "mitarbeiter" | "standardwerte";

export default function HRPage() {
  const searchParams = useSearchParams();
  const urlSub = searchParams.get("subtab") as LoehneSubTab | null;
  const [subTab, setSubTab] = useState<LoehneSubTab>(urlSub ?? "abrechnung");
  const { role, ready } = usePermissions();
  const isAdmin = role === "admin";

  useEffect(() => {
    if (urlSub) setSubTab(urlSub);
  }, [urlSub]);

  function selectSubTab(s: LoehneSubTab) {
    setSubTab(s);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "loehne");
      url.searchParams.set("subtab", s);
      window.history.replaceState({}, "", url.toString());
    }
  }

  // Nicht-Admins landen hier nur wenn sie den Direktlink kennen — der
  // Layout-Guard laesst sie ueber ADMIN_ONLY_PREFIXES eh nicht durch,
  // aber falls doch: freundlicher Hinweis statt leerer Seite.
  if (!ready) return null;
  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">Nur für Administratoren.</p>
      </div>
    );
  }

  const loehneSubTabs: { key: LoehneSubTab; label: string; icon: React.ReactNode }[] = [
    { key: "abrechnung",       label: "Abrechnung",       icon: <Table className="h-4 w-4" /> },
    { key: "lohnabrechnungen", label: "Lohnabrechnungen", icon: <FileText className="h-4 w-4" /> },
    { key: "mitarbeiter",      label: "Mitarbeiter-Lohn", icon: <Users className="h-4 w-4" /> },
    { key: "standardwerte",    label: "Standardwerte",    icon: <SettingsIcon className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Löhne
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monatsabrechnung, Lohnabrechnungen und Firmen-Lohnsumme.
        </p>
      </div>

      <TrustedDeviceGate>
        {/* Lohnsummen-Prognose ganz oben — Kennzahl fuer Ausgleichskasse /
            SUVA / BVG-Meldung. War frueher unter /analytics, ist aber
            Fach-Content der Loehne-Seite. */}
        <LohnsummenPrognose />

        {/* Sub-Nav fuer den Lohn-Hub */}
        <nav className="flex gap-1 flex-wrap text-xs">
          {loehneSubTabs.map((s) => {
            const active = subTab === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => selectSubTab(s.key)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors",
                  active
                    ? "border-red-500 bg-red-500/10 text-red-700 dark:text-red-300"
                    : "border-border bg-card hover:bg-foreground/[0.04] dark:hover:bg-foreground/[0.06]",
                )}
              >
                {s.icon}
                {s.label}
              </button>
            );
          })}
        </nav>

        <div className="pt-2">
          {subTab === "abrechnung" && <MonatsstundenTable />}
          {subTab === "lohnabrechnungen" && <LohndokumenteAdmin />}
          {subTab === "mitarbeiter" && <MitarbeiterLohnTab />}
          {subTab === "standardwerte" && <LohnStandardwerteCard />}
        </div>
      </TrustedDeviceGate>
    </div>
  );
}
