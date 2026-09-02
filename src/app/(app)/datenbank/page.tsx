"use client";

/**
 * Datenbank — EIN Sidebar-Eintrag, mehrere Tabs.
 *
 * Konsolidiert die vier vormals eigenständigen Sidebar-Positionen
 * Kunden/Lieferanten/Locations/Partner in einen Hub. Grund: die vier
 * Kontakte-Listen sind semantisch verwandt (Stammdaten-Datenbank) und
 * ein Sidebar-Eintrag mit Tabs ist übersichtlicher als vier Eintraege.
 *
 * Tab-Muster: TabsNav (Underline, roter aktiver Underline) — kanonisches
 * NAVIGATION-Muster (siehe TabsNav-Kommentar); nicht Kasten-Toggle, weil
 * die vier Tabs vollstaendig unterschiedliche Sektionen sind, keine
 * Filter derselben Datenmenge. Muster übernommen 1:1 von /hr.
 *
 * Rollen-Sichtbarkeit: Partner-Tab nur fuer Admin (die PartnerView selbst
 * lehnt Non-Admins ab; wir zeigen den Tab entsprechend erst gar nicht).
 *
 * URL-Persistenz: ?tab=… ueberlebt Reload, Back/Forward, Teilen von Links.
 * history.replaceState statt router.push — kein neuer History-Eintrag pro
 * Tab-Klick, Back geht sinnvoll zurueck zur vorigen Seite.
 *
 * Deep-Link-Kompatibilitaet: /kunden, /lieferanten, /locations, /partner
 * bleiben eigenstaendige Routes (rendern dort dieselben View-Components
 * ohne embedded-Prop). So funktionieren Bookmarks, interne Links,
 * Command-Palette-Eintraege, Bexio-OAuth-Callback etc. unveraendert.
 * Detail-Routen (/kunden/[id] etc.) sowieso.
 *
 * Legacy-Mapping: alte Deep-Links aus dem frueheren /kontakte-Konzept
 * (?tab=kunden|lieferanten|partner|locations) werden 1:1 uebernommen
 * — die Keys sind zufaellig gleich. Zusaetzlich ein Alias fuer Plural/
 * Singular-Varianten, falls existent.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Database, Users, Handshake, MapPin, HeartHandshake,
} from "lucide-react";
import { TabsNav } from "@/components/ui/tabs-nav";
import { usePermissions } from "@/lib/use-permissions";
import { KundenView } from "@/components/kunden/kunden-view";
import { LieferantenView } from "@/components/lieferanten/lieferanten-view";
import { LocationsView } from "@/components/locations/locations-view";
import { PartnerView } from "@/components/partner/partner-view";

type Tab = "kunden" | "lieferanten" | "locations" | "partner";
const ALL_TABS: Tab[] = ["kunden", "lieferanten", "locations", "partner"];

/**
 * Legacy-Mapping: alte ?tab=…-Werte transparent auf die neuen Keys mappen.
 * Aktuell direkt identisch, plus ein paar Singular-/Alt-Aliase falls in
 * alten Bookmarks/Links im Umlauf.
 */
function mapLegacyTab(raw: string | null): Tab | null {
  if (!raw) return null;
  const legacy: Record<string, Tab> = {
    kunde: "kunden",
    lieferant: "lieferanten",
    location: "locations",
    standorte: "locations",
    raeume: "locations",
    partners: "partner",
  };
  const mapped = legacy[raw];
  if (mapped) return mapped;
  return ALL_TABS.includes(raw as Tab) ? (raw as Tab) : null;
}

export default function DatenbankPage() {
  const searchParams = useSearchParams();
  const urlTab = mapLegacyTab(searchParams.get("tab"));

  const { role, ready } = usePermissions();
  const isAdmin = role === "admin";

  const [tab, setTab] = useState<Tab>(urlTab ?? "kunden");

  // Externe URL-Aenderungen (Back/Forward, nachtraegliche Deep-Links) mit
  // Local-State synchron halten — sonst zeigt Back den alten Tab.
  useEffect(() => {
    if (urlTab) setTab(urlTab);
  }, [urlTab]);

  function selectTab(t: Tab) {
    setTab(t);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", t);
      window.history.replaceState({}, "", url.toString());
    }
  }

  if (!ready) return null;

  // Tab-Sichtbarkeit — Partner nur fuer Admin (PartnerView selbst zeigt
  // sonst nur den „Nur für Administratoren"-Hinweis; besser: Tab weglassen).
  const tabs: { key: Tab; label: string; icon: React.ReactNode; visible: boolean }[] = [
    { key: "kunden",      label: "Kunden",      icon: <Users className="h-4 w-4" />,         visible: true },
    { key: "lieferanten", label: "Lieferanten", icon: <Handshake className="h-4 w-4" />,     visible: true },
    { key: "locations",   label: "Locations",   icon: <MapPin className="h-4 w-4" />,        visible: true },
    { key: "partner",     label: "Partner",     icon: <HeartHandshake className="h-4 w-4" />, visible: isAdmin },
  ];

  const visibleTabs = tabs.filter((t) => t.visible);
  // Fallback: User landet per Deep-Link auf einem nicht sichtbaren Tab
  // (z.B. Non-Admin ?tab=partner) → auf ersten sichtbaren Tab zurueckfallen.
  const activeTab: Tab = visibleTabs.some((t) => t.key === tab) ? tab : "kunden";

  return (
    <div className="space-y-6">
      {/* Datenbank-Header IMMER sichtbar (Muster wie /hr — Header bleibt auch
          nach Tab-Wechsel oben stehen, damit die Section-Identity nicht
          verloren geht). Die embedded-Views blenden ihren eigenen H1 aus. */}
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
        <Database className="h-5 w-5" />
        Datenbank
      </h1>

      <TabsNav
        tabs={visibleTabs.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))}
        active={activeTab}
        onChange={(k) => selectTab(k as Tab)}
        ariaLabel="Datenbank-Bereiche"
        className="mb-4"
      />

      {activeTab === "kunden" && <KundenView embedded />}
      {activeTab === "lieferanten" && <LieferantenView embedded />}
      {activeTab === "locations" && <LocationsView embedded />}
      {activeTab === "partner" && isAdmin && <PartnerView embedded />}
    </div>
  );
}
