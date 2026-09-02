"use client";

/**
 * HR-Hub — EIN Sidebar-Eintrag, mehrere Tabs.
 *
 * Rolle-Trennung (2026-09):
 *   Beide Rollen sehen DIESELBEN Top-Tabs (Übersicht/Stempelzeiten/Tickets/
 *   Ferien/Lohn). Innerhalb jedes personen-basierten Tabs schaltet Admin
 *   via "Meine | Team"-Toggle zwischen Eigen-Sicht und Team-Sicht um.
 *   MA sieht keinen Toggle (immer "meine" via RLS).
 *
 *   Konkret pro Tab:
 *     - Stempelzeiten: Toggle in StempelzeitenView (ersetzt frueheren
 *       "Alle Mitarbeiter"-Kasten).
 *     - Tickets: Toggle in TicketsView (ersetzt "Nur meine"-Kasten,
 *       Semantik invertiert: Team = alle, Meine = nur eigene).
 *     - Ferien: FerienView hatte den Toggle schon — unveraendert.
 *     - Lohn: Toggle HIER auf HR-Ebene, weil die Team-Sicht komplett
 *       anders aussieht (Verwaltung mit Sub-Tabs) als die Meine-Sicht
 *       (PDF-Liste).
 *
 * Lohn-Tab (frueher "Löhne", jetzt Singular fuer die MA-Sicht):
 *   - MA-Sicht (default): MeineLohndokumenteView — eigene Lohn-PDFs +
 *     Lohnausweise + Digital-Consent-Karte. Extrahiert aus dem alten
 *     mein-konto/Dokumente-Tab.
 *   - Admin-Sicht (Toggle "Team"): LohnsummenPrognose + Sub-Tabs
 *     Monatsstunden/PDFs/Mitarbeiter/Standardwerte. TrustedDeviceGate
 *     wrapt nur die Team-Sicht, nicht die eigene PDF-Liste.
 *
 * Sub-Tab-Rename (2026-09) — Semantik-Klarheit:
 *   - "abrechnung"       → "monatsstunden" (matcht MonatsstundenTable)
 *   - "lohnabrechnungen" → "pdfs"          (matcht LohndokumenteAdmin)
 *   - "mitarbeiter"      → "mitarbeiter"   (Label kuerzer)
 *   - "standardwerte"    → unveraendert
 *   Alte URL-Query-Werte werden per Legacy-Mapping auf neu uebersetzt
 *   damit alte Deep-Links (Sidebar-Bookmarks, Slack-Links) weiter
 *   funktionieren.
 *
 * Tab-Zustand ueberlebt Reload via URL-Query (?tab=…&subtab=…&lohn=…).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Briefcase, LayoutDashboard, Clock, TicketCheck, Palmtree, Wallet,
  Table, FileText, Users, Settings as SettingsIcon,
  CheckCircle2, ChevronRight,
} from "lucide-react";
import { usePermissions } from "@/lib/use-permissions";
import { TabsNav } from "@/components/ui/tabs-nav";
import { TrustedDeviceGate } from "@/components/trust/trusted-device-gate";
import { StempelzeitenView } from "@/components/stempelzeiten/stempelzeiten-view";
import { TicketsView } from "@/components/tickets/tickets-view";
import { FerienView } from "@/components/ferien/ferien-view";
import { LohndokumenteAdmin } from "@/components/hr/lohndokumente-admin";
import { MonatsstundenTable } from "@/components/hr/monatsstunden-table";
import { LohnStandardwerteCard } from "@/components/hr/loehne/lohn-standardwerte-card";
import { MitarbeiterLohnTab } from "@/components/hr/loehne/mitarbeiter-lohn-tab";
import { LohnsummenPrognose } from "@/components/analytics/lohnsummen-prognose";
import { MeineLohndokumenteView } from "@/components/hr/meine-lohndokumente-view";
import { ZRH_TZ, todayLocalIso } from "@/lib/swiss-time";

type Tab = "uebersicht" | "stempelzeiten" | "tickets" | "ferien" | "loehne";
type LoehneSubTab = "monatsstunden" | "pdfs" | "mitarbeiter" | "standardwerte";
type LohnMode = "meine" | "team";

const ALL_TABS: Tab[] = ["uebersicht", "stempelzeiten", "tickets", "ferien", "loehne"];
const ALL_SUBTABS: LoehneSubTab[] = ["monatsstunden", "pdfs", "mitarbeiter", "standardwerte"];

/**
 * Legacy-Mapping fuer die alten Sub-Tab-Keys — alte Deep-Links
 * (?subtab=abrechnung etc.) werden transparent auf die neuen Keys
 * umgeschrieben. Zurueckgeben: mapped key ODER unveraenderten Wert.
 */
function mapLegacySubtab(raw: string | null): LoehneSubTab | null {
  if (!raw) return null;
  const legacy: Record<string, LoehneSubTab> = {
    abrechnung: "monatsstunden",
    lohnabrechnungen: "pdfs",
    "mitarbeiter-lohn": "mitarbeiter",
  };
  const mapped = legacy[raw];
  if (mapped) return mapped;
  return ALL_SUBTABS.includes(raw as LoehneSubTab) ? (raw as LoehneSubTab) : null;
}

export default function HRPage() {
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab") as Tab | null;
  const urlSub = searchParams.get("subtab");
  const urlLohnMode = searchParams.get("lohn") as LohnMode | null;

  const { can, role, ready } = usePermissions();
  const isAdmin = role === "admin";

  const [tab, setTab] = useState<Tab>(urlTab && ALL_TABS.includes(urlTab) ? urlTab : "uebersicht");
  const [subTab, setSubTab] = useState<LoehneSubTab>(mapLegacySubtab(urlSub) ?? "monatsstunden");
  // Lohn-Modus: Admin default "team" (Verwaltungs-Sicht), MA hat keinen
  // Umschalter — immer "meine". URL-Override moeglich fuer Deep-Link.
  const [lohnMode, setLohnMode] = useState<LohnMode>(urlLohnMode ?? "team");

  // URL-Aenderung von aussen (Back/Forward, Deep-Link nachtraeglich) mit
  // Local-State synchron halten — sonst zeigt Back auf altem Tab.
  useEffect(() => {
    if (urlTab && ALL_TABS.includes(urlTab)) setTab(urlTab);
  }, [urlTab]);
  useEffect(() => {
    const mapped = mapLegacySubtab(urlSub);
    if (mapped) setSubTab(mapped);
  }, [urlSub]);
  useEffect(() => {
    if (urlLohnMode === "meine" || urlLohnMode === "team") setLohnMode(urlLohnMode);
  }, [urlLohnMode]);

  function selectTab(t: Tab) {
    setTab(t);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", t);
      if (t !== "loehne") {
        url.searchParams.delete("subtab");
        url.searchParams.delete("lohn");
      }
      window.history.replaceState({}, "", url.toString());
    }
  }

  function selectSubTab(s: LoehneSubTab) {
    setSubTab(s);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "loehne");
      url.searchParams.set("subtab", s);
      window.history.replaceState({}, "", url.toString());
    }
  }

  function selectLohnMode(m: LohnMode) {
    setLohnMode(m);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "loehne");
      url.searchParams.set("lohn", m);
      // Sub-Tab macht in "meine" keinen Sinn — aus der URL raus.
      if (m === "meine") url.searchParams.delete("subtab");
      window.history.replaceState({}, "", url.toString());
    }
  }

  if (!ready) return null;

  // Effektiver Lohn-Modus — MA hat keinen Toggle, immer "meine".
  const effectiveLohnMode: LohnMode = isAdmin ? lohnMode : "meine";

  // Tab-Sichtbarkeit — Lohn ist jetzt fuer ALLE sichtbar (MA sieht seine
  // eigenen PDFs, Admin sieht Team-Verwaltung). Frueher admin-only.
  const tabs: { key: Tab; label: string; icon: React.ReactNode; visible: boolean }[] = [
    { key: "uebersicht",    label: "Übersicht",    icon: <LayoutDashboard className="h-4 w-4" />, visible: true },
    { key: "stempelzeiten", label: "Stempelzeiten", icon: <Clock className="h-4 w-4" />,          visible: can("stempelzeiten:view") },
    { key: "tickets",       label: "Tickets",       icon: <TicketCheck className="h-4 w-4" />,    visible: can("tickets:view") },
    // Ferien ist immer erlaubt (Mitarbeiter reichen eigene Antraege via RLS ein).
    { key: "ferien",        label: "Ferien",        icon: <Palmtree className="h-4 w-4" />,       visible: true },
    // Lohn: MA sieht eigene Lohn-PDFs; Admin sieht Team-Verwaltung.
    // Kein Permission-Gate — jeder MA soll seine Lohnzettel abrufen koennen.
    { key: "loehne",        label: "Lohn",          icon: <Wallet className="h-4 w-4" />,         visible: true },
  ];

  const visibleTabs = tabs.filter((t) => t.visible);
  // Falls User auf einem nicht sichtbaren Tab landet (Deep-Link ohne
  // Permission) — auf Uebersicht zurueckfallen.
  const activeTab: Tab = visibleTabs.some((t) => t.key === tab) ? tab : "uebersicht";

  const loehneSubTabs: { key: LoehneSubTab; label: string; icon: React.ReactNode }[] = [
    { key: "monatsstunden", label: "Monatsstunden", icon: <Table className="h-4 w-4" /> },
    { key: "pdfs",          label: "PDFs",          icon: <FileText className="h-4 w-4" /> },
    { key: "mitarbeiter",   label: "Mitarbeiter",   icon: <Users className="h-4 w-4" /> },
    { key: "standardwerte", label: "Standardwerte", icon: <SettingsIcon className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header — nur auf Uebersicht sichtbar. Auf den anderen Tabs bringt
          jede View ihren eigenen H1 mit (Stempelzeiten/Tickets/Ferien/Löhne),
          der doppelte HR-Header waere Bloat. */}
      {activeTab === "uebersicht" && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            HR
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stempelzeiten, Tickets, Ferien und Lohn an einem Ort.
          </p>
        </div>
      )}

      {/* Top-Level-Tab-Nav — Underline-Style (kanonisches Nav-Tab-Muster,
          siehe TabsNav-Kommentar). NAVIGATION zwischen unterschiedlichen
          Sektionen, deshalb Underline und NICHT Kasten-Toggle. */}
      <TabsNav
        tabs={visibleTabs.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))}
        active={activeTab}
        onChange={(k) => selectTab(k as Tab)}
        ariaLabel="HR-Bereiche"
        className="mb-4"
      />

      {activeTab === "uebersicht" && (
        <HRUebersicht isAdmin={isAdmin} onGoto={selectTab} />
      )}

      {activeTab === "stempelzeiten" && can("stempelzeiten:view") && (
        <StempelzeitenView />
      )}

      {activeTab === "tickets" && can("tickets:view") && (
        <TicketsView />
      )}

      {activeTab === "ferien" && (
        <FerienView />
      )}

      {activeTab === "loehne" && (
        <div className="space-y-4">
          {/* Meine|Team-Umschalter — nur Admin sieht ihn. MA landet immer
              in der Meine-Sicht (siehe effectiveLohnMode). Kasten-Toggle
              rechts oben, Muster wie FerienView + reference_design_kasten_buttons. */}
          {isAdmin && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Lohn</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {effectiveLohnMode === "meine"
                    ? "Deine Lohnabrechnungen & Lohnausweise."
                    : "Team-Verwaltung: Monatsstunden, PDFs, Mitarbeiter-Loehne."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => selectLohnMode("meine")}
                  className={effectiveLohnMode === "meine" ? "kasten-active" : "kasten-toggle-off"}
                >
                  Meine
                </button>
                <button
                  type="button"
                  onClick={() => selectLohnMode("team")}
                  className={effectiveLohnMode === "team" ? "kasten-active" : "kasten-toggle-off"}
                >
                  Team
                </button>
              </div>
            </div>
          )}

          {effectiveLohnMode === "meine" && <MeineLohndokumenteView />}

          {effectiveLohnMode === "team" && isAdmin && (
            <TrustedDeviceGate>
              {/* Lohnsummen-Prognose oben — Kennzahl fuer Ausgleichskasse /
                  SUVA / BVG-Meldung. */}
              <LohnsummenPrognose />

              {/* Loehne-Sub-Tabs: Kasten-Toggle-Style (nicht Underline).
                  Muster wie main-Einstellungen: Underline nur fuer TOP-Nav
                  (Portale/Sektionen), Kasten fuer Sub-Nav innerhalb einer
                  Sektion. */}
              <div className="mt-6 flex flex-wrap gap-2">
                {loehneSubTabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => selectSubTab(t.key)}
                    className={subTab === t.key ? "kasten-active" : "kasten-toggle-off"}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="pt-2">
                {subTab === "monatsstunden" && <MonatsstundenTable />}
                {subTab === "pdfs" && <LohndokumenteAdmin />}
                {subTab === "mitarbeiter" && <MitarbeiterLohnTab />}
                {subTab === "standardwerte" && <LohnStandardwerteCard />}
              </div>
            </TrustedDeviceGate>
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// HRUebersicht — Landing-Tab. EINE Card, kompakte Info-Zeilen, keine
// Riesen-CTA-Buttons. Klick auf eine Zeile springt in den passenden Tab.
// =====================================================================

interface OverviewData {
  todayMinutes: number;        // Eigene gestempelte Minuten heute
  openTicketsMine: number;     // Eigene offene Tickets
  currentAbsent: {             // Eigene aktuelle Abwesenheit (falls)
    type: string;
    endIso: string;
  } | null;
  weekMinutes: number;         // Eigene Wochen-Stunden (ISO-Woche)
  pendingLeaveRequests: number; // Admin: offene Team-Antraege
  teamStampedToday: number;    // Admin: wieviele MA haben heute gestempelt
  openTeamTickets: number;     // Admin: alle offenen Team-Tickets
  recentDoneTickets: {         // Eigene letzten 3 erledigten Tickets
    id: string;
    number: number;
    title: string;
  }[];
}

// Type-Aliases fuer Supabase-Queries.
interface TERow { clock_in: string; clock_out: string | null }
interface TERowUser { user_id: string }
interface TicketRow { id: string; ticket_number: number; title: string }
interface TimeOffRow { type: string; end_date: string }

function isoWeekStart(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const wd = date.getUTCDay();
  const off = wd === 0 ? -6 : 1 - wd;
  date.setUTCDate(date.getUTCDate() + off);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  date.setUTCDate(date.getUTCDate() + n);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function fmtDur(minutes: number): string {
  if (minutes <= 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("de-CH", {
    timeZone: ZRH_TZ, day: "2-digit", month: "2-digit", year: "numeric",
  });
}

const TIME_OFF_LABEL: Record<string, string> = {
  ferien: "Ferien", krank: "Krank", kompensation: "Kompensation",
  frei: "Frei", militaer: "Militär",
};

function HRUebersicht({ isAdmin, onGoto }: { isAdmin: boolean; onGoto: (t: Tab) => void }) {
  const supabase = createClient();
  const [data, setData] = useState<OverviewData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const today = todayLocalIso();
      const weekStart = isoWeekStart(today);
      const weekEnd = addDays(weekStart, 6);
      const todayFromIso = new Date(today + "T00:00:00").toISOString();
      const todayToIso = new Date(today + "T23:59:59").toISOString();
      const weekFromIso = new Date(weekStart + "T00:00:00").toISOString();
      const weekToIso = new Date(weekEnd + "T23:59:59").toISOString();

      // Parallel-Queries — nichts blockiert.
      const [teToday, teWeek, tOpen, tDone, absent, pending, teamToday, teamTickets] = await Promise.all([
        supabase
          .from("time_entries")
          .select("clock_in, clock_out")
          .eq("user_id", user.id)
          .gte("clock_in", todayFromIso)
          .lte("clock_in", todayToIso),
        supabase
          .from("time_entries")
          .select("clock_in, clock_out")
          .eq("user_id", user.id)
          .gte("clock_in", weekFromIso)
          .lte("clock_in", weekToIso),
        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("created_by", user.id)
          .eq("status", "offen")
          .neq("type", "beleg"),
        supabase
          .from("tickets")
          .select("id, ticket_number, title")
          .eq("created_by", user.id)
          .eq("status", "erledigt")
          .neq("type", "beleg")
          .order("resolved_at", { ascending: false, nullsFirst: false })
          .limit(3),
        supabase
          .from("time_off")
          .select("type, end_date")
          .eq("user_id", user.id)
          .eq("status", "genehmigt")
          .lte("start_date", today)
          .gte("end_date", today)
          .limit(1)
          .maybeSingle(),
        isAdmin
          ? supabase
              .from("time_off")
              .select("id", { count: "exact", head: true })
              .eq("status", "beantragt")
          : Promise.resolve({ count: 0 } as { count: number | null }),
        // Team heute: distinct user_ids die heute gestempelt haben.
        // RLS blockiert Non-Admins — fuer Admin gibt Postgres alle Rows zurueck.
        isAdmin
          ? supabase
              .from("time_entries")
              .select("user_id")
              .gte("clock_in", todayFromIso)
              .lte("clock_in", todayToIso)
          : Promise.resolve({ data: null } as { data: TERowUser[] | null }),
        // Team-Tickets: alle offenen Tickets (RLS filtert Non-Admin auf eigene).
        isAdmin
          ? supabase
              .from("tickets")
              .select("id", { count: "exact", head: true })
              .eq("status", "offen")
              .neq("type", "beleg")
          : Promise.resolve({ count: 0 } as { count: number | null }),
      ]);

      if (cancelled) return;

      const sumMinutes = (rows: TERow[] | null) => {
        if (!rows) return 0;
        let total = 0;
        const now = Date.now();
        for (const r of rows) {
          const start = new Date(r.clock_in).getTime();
          const end = r.clock_out ? new Date(r.clock_out).getTime() : now;
          if (end > start) total += Math.floor((end - start) / 60000);
        }
        return total;
      };

      const absentRow = (absent as { data?: TimeOffRow | null }).data ?? null;

      const teamTodayRows = (teamToday as { data?: TERowUser[] | null }).data ?? null;
      const distinctUsers = teamTodayRows
        ? new Set(teamTodayRows.map((r) => r.user_id)).size
        : 0;

      setData({
        todayMinutes: sumMinutes(teToday.data as TERow[] | null),
        openTicketsMine: (tOpen as { count: number | null }).count ?? 0,
        currentAbsent: absentRow
          ? { type: TIME_OFF_LABEL[absentRow.type] ?? absentRow.type, endIso: absentRow.end_date }
          : null,
        weekMinutes: sumMinutes(teWeek.data as TERow[] | null),
        pendingLeaveRequests: (pending as { count: number | null }).count ?? 0,
        teamStampedToday: distinctUsers,
        openTeamTickets: (teamTickets as { count: number | null }).count ?? 0,
        recentDoneTickets: ((tDone.data as TicketRow[] | null) ?? []).map((t) => ({
          id: t.id, number: t.ticket_number, title: t.title,
        })),
      });
    })();
    return () => { cancelled = true; };
  }, [supabase, isAdmin]);

  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border">
      {/* Heute-Sektion */}
      <div className="px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          Heute
        </p>
        <div className="divide-y divide-border/60">
          <OverviewRow
            icon={<Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
            label="Heute gestempelt"
            value={data ? fmtDur(data.todayMinutes) : "…"}
            onClick={() => onGoto("stempelzeiten")}
            tooltip="Zu Stempelzeiten"
          />
          <OverviewRow
            icon={<TicketCheck className="h-4 w-4 text-red-600 dark:text-red-400" />}
            label="Eigene offene Tickets"
            value={data ? String(data.openTicketsMine) : "…"}
            onClick={() => onGoto("tickets")}
            tooltip="Zu Tickets"
          />
          <OverviewRow
            icon={<Palmtree className="h-4 w-4 text-green-600 dark:text-green-400" />}
            label="Aktuelle Abwesenheit"
            value={
              data
                ? data.currentAbsent
                  ? `${data.currentAbsent.type} bis ${fmtDate(data.currentAbsent.endIso)}`
                  : "Keine"
                : "…"
            }
            onClick={() => onGoto("ferien")}
            tooltip="Zu Ferien"
          />
        </div>
      </div>

      {/* Diese Woche-Sektion */}
      <div className="px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          Diese Woche
        </p>
        <div className="divide-y divide-border/60">
          <OverviewRow
            icon={<Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
            label="Wochen-Total gestempelt"
            value={data ? fmtDur(data.weekMinutes) : "…"}
            onClick={() => onGoto("stempelzeiten")}
            tooltip="Zu Stempelzeiten"
          />
          {data && data.recentDoneTickets.length > 0 ? (
            <div className="py-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Zuletzt erledigte Tickets
              </p>
              <div className="space-y-0.5">
                {data.recentDoneTickets.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tickets/${t.id}`}
                    className="block px-2 py-1 rounded-md text-xs hover:bg-foreground/[0.04] dark:hover:bg-foreground/[0.06] transition-colors"
                  >
                    <span className="font-mono text-muted-foreground mr-2">T-{t.number}</span>
                    <span className="truncate">{t.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            data && (
              <div className="py-2 text-xs text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Noch keine erledigten Tickets diese Woche.
              </div>
            )
          )}
        </div>
      </div>

      {/* Team-Sektion — nur Admin. Kompakte Vorschau ueber Team-Aktivitaet.
          Nicht redundant zu den "Meine"-Zeilen oben: hier geht es um
          Verwaltungs-Blick, nicht persoenlichen Blick. */}
      {isAdmin && data && (
        <div className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Team
          </p>
          <div className="divide-y divide-border/60">
            <OverviewRow
              icon={<Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
              label="Team heute gestempelt"
              value={`${data.teamStampedToday} ${data.teamStampedToday === 1 ? "Person" : "Personen"}`}
              onClick={() => onGoto("stempelzeiten")}
              tooltip="Team-Stempelzeiten oeffnen"
            />
            <OverviewRow
              icon={<Palmtree className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
              label="Offene Ferien-Anträge (Team)"
              value={String(data.pendingLeaveRequests)}
              onClick={() => onGoto("ferien")}
              tooltip="Antraege pruefen"
            />
            <OverviewRow
              icon={<TicketCheck className="h-4 w-4 text-red-600 dark:text-red-400" />}
              label="Offene Team-Tickets"
              value={String(data.openTeamTickets)}
              onClick={() => onGoto("tickets")}
              tooltip="Team-Tickets oeffnen"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Eine kompakte klickbare Info-Zeile — Icon + Label + Value + Chevron.
// Hover state-driven inline (CLAUDE.md — Tailwind-hover ist unzuverlaessig).
function OverviewRow({
  icon, label, value, onClick, tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onClick: () => void;
  tooltip?: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-tooltip={tooltip}
      style={{
        backgroundColor: hover ? "var(--muted)" : "transparent",
      }}
      className="w-full flex items-center gap-2 py-2 text-left transition-colors rounded-md px-2 -mx-2"
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 text-sm">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    </button>
  );
}
