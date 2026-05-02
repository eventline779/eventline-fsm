"use client";

/**
 * Einstellungen-Page — Tabs: Team, Rollen (admin-only), Integrationen, Backup.
 * Team-Tab ist neu: User anlegen + Passwort-Reset ohne externes Tool.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Plug, Users, Shield } from "lucide-react";
import { toast } from "sonner";
import { IntegrationenTab } from "@/components/einstellungen/integrationen-tab";
import { TeamTab } from "@/components/einstellungen/team-tab";
import { RollenTab } from "@/components/einstellungen/rollen-tab";

type Tab = "integrationen" | "backup" | "team" | "rollen";

export default function EinstellungenPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(urlTab && ["integrationen", "backup", "team", "rollen"].includes(urlTab) ? urlTab : "integrationen");
  const [isAdmin, setIsAdmin] = useState(false);

  // Tab-Wechsel: state = sofortige UI-Quelle, URL parallel updaten via
  // History-API damit Hard-Reload den gleichen Tab zeigt. Wir umgehen
  // den Next-Router (router.replace mit Query-Only-Update triggerte in
  // Next 16 weder re-render noch URL-Update zuverlaessig). History.API
  // ist garantiert synchron + ohne Navigation.
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
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      setIsAdmin(profile?.role === "admin");
    })();
  }, [supabase]);

  async function exportTable(table: string, label: string) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      toast.error(`Fehler beim Export: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) {
      toast.info(`${label}: keine Daten vorhanden`);
      return;
    }
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((h) => {
            const v = row[h];
            if (v === null || v === undefined) return "";
            const s = typeof v === "object" ? JSON.stringify(v) : String(v);
            return `"${s.replace(/"/g, '""')}"`;
          })
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${label} exportiert`);
  }

  async function exportAll() {
    const tables = [
      { table: "customers", label: "Kunden" },
      { table: "jobs", label: "Aufträge" },
      { table: "service_reports", label: "Rapporte" },
      { table: "locations", label: "Standorte" },
      { table: "profiles", label: "Team" },
      { table: "job_appointments", label: "Termine" },
    ];
    for (const t of tables) {
      await exportTable(t.table, t.label);
    }
    toast.success("Alle Daten exportiert!");
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    ...(isAdmin ? [
      { key: "team" as Tab, label: "Team", icon: <Users className="h-4 w-4" /> },
      { key: "rollen" as Tab, label: "Rollen", icon: <Shield className="h-4 w-4" /> },
    ] : []),
    { key: "integrationen", label: "Integrationen", icon: <Plug className="h-4 w-4" /> },
    { key: "backup", label: "Backup", icon: <Download className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header — gleiche Struktur wie /auftraege etc. (h1 + Subtitle-Spacer
          fuer konsistente Hoehe app-weit). */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
        <p className="text-sm text-muted-foreground mt-1" aria-hidden="true">&nbsp;</p>
      </div>

      {/* Tab-Bar im selben kasten-Toggle-Stil wie Filter-Buttons in /auftraege,
          /todos, /kunden — kein eigenes Pill-Container-Pattern. */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => selectTab(t.key)}
            className={tab === t.key ? "kasten-active" : "kasten-toggle-off"}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "integrationen" && <IntegrationenTab />}

      {tab === "team" && isAdmin && <TeamTab />}

      {tab === "rollen" && isAdmin && <RollenTab />}

      {tab === "backup" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Exportiere alle Daten als CSV-Dateien für dein Backup oder die Buchhaltung.
          </p>

          <Card className="bg-card">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">Komplett-Backup</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Alle Tabellen als separate CSV-Dateien herunterladen</p>
              </div>
              <button type="button" onClick={exportAll} className="kasten kasten-red">
                <Download className="h-3.5 w-3.5" />Alles exportieren
              </button>
            </CardContent>
          </Card>

          <div>
            <h2 className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
              Einzelne Bereiche
            </h2>
            <div className="space-y-2">
              {[
                { table: "customers", label: "Kunden", desc: "Alle Kundendaten mit Kontaktinfos" },
                { table: "jobs", label: "Aufträge", desc: "Alle Aufträge mit Status und Details" },
                { table: "service_reports", label: "Rapporte", desc: "Alle Einsatzrapporte" },
                { table: "locations", label: "Standorte", desc: "Alle Standorte und Adressen" },
                { table: "profiles", label: "Team", desc: "Alle Teammitglieder" },
                { table: "job_appointments", label: "Termine", desc: "Alle Auftrags-Termine" },
              ].map((item) => (
                <Card key={item.table} className="bg-card">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-sm">{item.label}</h3>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <button onClick={() => exportTable(item.table, item.label)} className="kasten kasten-muted">
                      <Download className="h-3.5 w-3.5" />CSV
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
