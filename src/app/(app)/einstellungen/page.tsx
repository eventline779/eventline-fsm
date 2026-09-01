"use client";

/**
 * Einstellungen-Page — flache 5-Tab-Struktur (Audit-Umsetzung).
 *
 * Vorher: 2-Ebenen-Portal-Wueste (Firmenportal | Partnerportal x je 3-5
 * Sub-Tabs). Non-Admin sah nur „Integrationen" tief eingegraben.
 *
 * Jetzt: EINE horizontale Tab-Reihe, 5 Kategorien:
 *   1. Firma           — Stammdaten (Adresse, IBAN, UID)
 *   2. Team & Rollen   — Mitarbeiter oben, Rollen-Matrix (Firma + Partner) darunter
 *   3. Anfrage-Form    — Partner-Anfrage-Template (Block-Builder)
 *   4. Integrationen   — Resend, Bexio, Cron, Kalender-Feed etc.
 *   5. Aktivitaet      — Session-Log, filterbar via Segment [Alle | Firma | Partner]
 *
 * Non-Admin sieht nur „Integrationen" (dort haengt sein persoenliches
 * Bexio-/Kalender-Setup) und wird beim Landen dorthin umgeleitet.
 *
 * URL-Persistenz via ?tab=... (history.replaceState). Legacy-Tabkeys aus
 * der Portal-Aera (partner-rollen / firma-stammdaten etc.) werden auf die
 * neuen 5 Tabs gemappt, damit alte Deep-Links weiter funktionieren
 * (z.B. Bexio-OAuth-Callback → ?tab=integrationen, Lohn-Nachtrag-Link → ?tab=team).
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plug, Users, Activity, Building2, FileText } from "lucide-react";
import { IntegrationenTab } from "@/components/einstellungen/integrationen-tab";
import { TeamTab } from "@/components/einstellungen/team-tab";
import { RollenTab } from "@/components/einstellungen/rollen-tab";
import { PermissionAuditLogCard } from "@/components/einstellungen/permission-audit-log";
import { AktivitaetTab } from "@/components/einstellungen/aktivitaet-tab";
import { PartnerFormTab } from "@/components/einstellungen/partner-form-tab";
import { FirmaTab } from "@/components/einstellungen/firma-tab";
import { BuildInfoBadge } from "@/components/einstellungen/build-info-badge";
import { TabsNav } from "@/components/ui/tabs-nav";

// Die 5 flachen Tabs. Reihenfolge = links→rechts in der Nav.
type Tab = "firma" | "team" | "anfrage-form" | "integrationen" | "aktivitaet";
const ALL_TABS: Tab[] = ["firma", "team", "anfrage-form", "integrationen", "aktivitaet"];

// Legacy-Mapping: alte Portal-Tabkeys → neue flache Tabkeys. Deckt
// bestehende Deep-Links ab (Bexio-Callback, interne Hinweise wie
// „nachpflegen unter Einstellungen → Team").
const LEGACY_TAB_MAP: Record<string, Tab> = {
  "firma-stammdaten": "firma",
  team: "team",
  rollen: "team",
  "partner-rollen": "team",
  "partner-form": "anfrage-form",
  aktivitaet: "aktivitaet",
  "partner-aktivitaet": "aktivitaet",
  integrationen: "integrationen",
};

function resolveTab(raw: string | null): Tab | null {
  if (!raw) return null;
  if ((ALL_TABS as string[]).includes(raw)) return raw as Tab;
  return LEGACY_TAB_MAP[raw] ?? null;
}

// Aktivitaets-Filter (Segment-Toggle in der Aktivitaet-Sektion).
type AktivScope = "all" | "firma" | "partner";

export default function EinstellungenPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const urlTab = resolveTab(searchParams.get("tab"));
  // Default = "firma" (erster Admin-Tab). Non-Admin wird via useEffect
  // auf „integrationen" umgeleitet sobald der Admin-Status geladen ist.
  const [tab, setTab] = useState<Tab>(urlTab ?? "firma");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [aktivScope, setAktivScope] = useState<AktivScope>("all");

  // Tab-Wechsel: state = sofortige UI-Quelle, URL parallel updaten via
  // History-API (Next.js router.replace triggerte in Next 16 unzuverlaessig
  // fuer reine Query-Aenderungen).
  function selectTab(t: Tab) {
    setTab(t);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", t);
      window.history.replaceState({}, "", url.toString());
    }
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsAdmin(false);
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      const admin = profile?.role === "admin";
      setIsAdmin(admin);
      // Non-Admin auf einem Admin-only-Tab → Integrationen.
      if (!admin && tab !== "integrationen") {
        selectTab("integrationen");
      }
    })();
  }, [supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nav-Definition — nur Integrationen sieht auch der Non-Admin.
  const navTabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    ...(isAdmin ? [
      { key: "firma" as Tab, label: "Firma", icon: <Building2 className="h-4 w-4" /> },
      { key: "team" as Tab, label: "Team & Rollen", icon: <Users className="h-4 w-4" /> },
      { key: "anfrage-form" as Tab, label: "Anfrage-Formular", icon: <FileText className="h-4 w-4" /> },
    ] : []),
    { key: "integrationen", label: "Integrationen", icon: <Plug className="h-4 w-4" /> },
    ...(isAdmin ? [
      { key: "aktivitaet" as Tab, label: "Aktivität", icon: <Activity className="h-4 w-4" /> },
    ] : []),
  ];

  return (
    <div className="space-y-6">
      {/* Header — konsistent mit /auftraege etc. (h1 + Subtitle-Spacer),
          rechts oben das Build-Info-Fun-Fact-Widget. */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
          <p className="text-sm text-muted-foreground mt-1" aria-hidden="true">&nbsp;</p>
        </div>
        <BuildInfoBadge />
      </div>

      {/* Flache Tab-Nav — Underline-Style (kanonisches Nav-Tab-Muster, siehe
          TabsNav-Kommentar). Horizontal scrollbar auf Mobile bleibt erhalten
          weil TabsNav intern overflow-x-auto + whitespace-nowrap setzt. */}
      <TabsNav
        tabs={navTabs}
        active={tab}
        onChange={(k) => selectTab(k as Tab)}
        ariaLabel="Einstellungs-Bereiche"
      />

      {tab === "firma" && isAdmin && <FirmaTab isAdmin={isAdmin} />}

      {tab === "team" && isAdmin && (
        <div className="space-y-8">
          {/* Sub-Sektion 1: Mitarbeiter-Verwaltung */}
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Mitarbeiter</h2>
              <p className="text-sm text-muted-foreground">Team-Mitglieder anlegen, deaktivieren und Rolle zuweisen.</p>
            </div>
            <TeamTab />
          </section>

          {/* Sub-Sektion 2: Firmen-Rollen (Rollen-Matrix fuer alles ausser Partner) */}
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Firmen-Rollen</h2>
              <p className="text-sm text-muted-foreground">Rechte pro Rolle im Firmenkontext (Team-Mitglieder, Techniker etc.).</p>
            </div>
            <RollenTab scope="firma" />
          </section>

          {/* Sub-Sektion 3: Partner-Rollen (Locationspartner mit eigener Modul-Welt) */}
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Partner-Rollen</h2>
              <p className="text-sm text-muted-foreground">Rechte fuer Locationspartner (eigener Modul-Katalog, getrennt von Firmenrechten).</p>
            </div>
            <RollenTab scope="partner" />
          </section>

          {/* Audit-Log fuer Permission-Aenderungen — historisch immer neben
              den Rollen im gleichen Tab. */}
          <PermissionAuditLogCard />
        </div>
      )}

      {tab === "anfrage-form" && isAdmin && <PartnerFormTab />}

      {tab === "integrationen" && (
        <div className="space-y-6">
          <IntegrationenTab />
        </div>
      )}

      {tab === "aktivitaet" && isAdmin && (
        <div className="space-y-4">
          {/* Segment-Toggle: filtert die Session-Liste nach Firma/Partner/Alle. */}
          <div className="flex gap-2 flex-wrap">
            {([
              { key: "all" as AktivScope, label: "Alle" },
              { key: "firma" as AktivScope, label: "Firma" },
              { key: "partner" as AktivScope, label: "Partner" },
            ]).map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setAktivScope(s.key)}
                className={aktivScope === s.key ? "kasten-active" : "kasten-toggle-off"}
              >
                {s.label}
              </button>
            ))}
          </div>
          <AktivitaetTab key={aktivScope} scope={aktivScope} />
        </div>
      )}
    </div>
  );
}
