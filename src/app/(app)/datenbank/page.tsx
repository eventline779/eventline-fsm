"use client";

/**
 * Datenbank — EIN Sidebar-Eintrag, zwei Tabs (Kunden + Lieferanten).
 *
 * Konsolidiert die vormals eigenständigen Sidebar-Positionen Kunden und
 * Lieferanten in einen Hub. Grund: beides sind Kontakte-Listen (Stamm-
 * daten-Datenbank), ein Sidebar-Eintrag mit Tabs ist übersichtlicher.
 *
 * Locations ist seit 2026-09-05 wieder ein EIGENER Sidebar-Eintrag
 * (/locations) — Schluesselcodes werden bei Aufbau regelmaessig
 * nachgeschlagen, das muss ein Klick tief sein, nicht zwei. Partner
 * lebt unter /einstellungen?tab=partner (Verwaltungs-Thema).
 *
 * Tab-Muster: TabsNav (Underline, roter aktiver Underline) — kanonisches
 * NAVIGATION-Muster (siehe TabsNav-Kommentar); nicht Kasten-Toggle, weil
 * die Tabs vollstaendig unterschiedliche Sektionen sind, keine Filter
 * derselben Datenmenge. Muster übernommen 1:1 von /hr.
 *
 * URL-Persistenz: ?tab=… ueberlebt Reload, Back/Forward, Teilen von Links.
 * history.replaceState statt router.push — kein neuer History-Eintrag pro
 * Tab-Klick, Back geht sinnvoll zurueck zur vorigen Seite.
 *
 * Deep-Link-Kompatibilitaet: /kunden, /lieferanten bleiben eigenstaendige
 * Routes (rendern dort dieselben View-Components ohne embedded-Prop). So
 * funktionieren Bookmarks, interne Links, Command-Palette-Eintraege,
 * Bexio-OAuth-Callback etc. unveraendert. Detail-Routen (/kunden/[id]
 * etc.) sowieso.
 *
 * Legacy-Mapping: alte ?tab=locations|location|standorte|raeume-Links
 * werden auf /locations umgeleitet (Locations lebt nicht mehr als Tab).
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Database, Users, Handshake,
} from "lucide-react";
import { TabsNav } from "@/components/ui/tabs-nav";
import { usePermissions } from "@/lib/use-permissions";
import { KundenView } from "@/components/kunden/kunden-view";
import { LieferantenView } from "@/components/lieferanten/lieferanten-view";

type Tab = "kunden" | "lieferanten";
const ALL_TABS: Tab[] = ["kunden", "lieferanten"];

/**
 * Legacy-Mapping: alte ?tab=…-Werte transparent auf die neuen Keys mappen.
 * Locations-Aliase geben null zurueck — dann redirected der Aufrufer
 * nach /locations (siehe useEffect unten).
 */
function mapLegacyTab(raw: string | null): Tab | null {
  if (!raw) return null;
  const legacy: Record<string, Tab> = {
    kunde: "kunden",
    lieferant: "lieferanten",
  };
  const mapped = legacy[raw];
  if (mapped) return mapped;
  return ALL_TABS.includes(raw as Tab) ? (raw as Tab) : null;
}

// Alte Locations-Deep-Links (?tab=locations|location|standorte|raeume)
// leiten auf die eigenstaendige /locations-Route weiter.
const LOCATIONS_LEGACY_TABS = new Set(["locations", "location", "standorte", "raeume"]);

export default function DatenbankPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const urlTab = mapLegacyTab(rawTab);

  const { ready } = usePermissions();

  const [tab, setTab] = useState<Tab>(urlTab ?? "kunden");

  // Alte Locations-Deep-Links (?tab=locations|location|standorte|raeume)
  // leiten auf die eigenstaendige Locations-Route weiter.
  useEffect(() => {
    if (rawTab && LOCATIONS_LEGACY_TABS.has(rawTab)) {
      router.replace("/locations");
    }
  }, [rawTab, router]);

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

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "kunden",      label: "Kunden",      icon: <Users className="h-4 w-4" /> },
    { key: "lieferanten", label: "Lieferanten", icon: <Handshake className="h-4 w-4" /> },
  ];

  const activeTab: Tab = ALL_TABS.includes(tab) ? tab : "kunden";

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
        tabs={tabs.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))}
        active={activeTab}
        onChange={(k) => selectTab(k as Tab)}
        ariaLabel="Datenbank-Bereiche"
        className="mb-4"
      />

      {activeTab === "kunden" && <KundenView embedded />}
      {activeTab === "lieferanten" && <LieferantenView embedded />}
    </div>
  );
}
