"use client";

/**
 * Dashboard — rollen-abhaengige Startseite.
 *
 *   admin      -> Firma-Cockpit (KPIs + zu-erledigen + Team-Status + Anwesenheit)
 *   techniker  -> MA-Cockpit (Ist-Stunden diesen Monat + Ist-Lohn + Prognose
 *                 Monatsende + naechster Einsatz)
 *   partner    -> Schlanke Portal-Willkommens-Kachel + Link zu /partner/anfragen
 *
 * Datenquelle: /api/dashboard bundelt alle Queries pro Rolle in Promise.all,
 * Cache-Control: private, max-age=60. Beim Reload kein Waterfall, beim
 * Nav-Klick innerhalb 60s kein Neu-Load.
 *
 * Sensible Zahlen: Ist-/Prognose-Lohn wird server-seitig aus employee_compensation
 * (Admin-Client, aber strikt eigene Zeile) berechnet. Der Client bekommt nur die
 * fertigen Betraege und den Stundenlohn — keine AN/AG-Pcts.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle, ArrowRight, Briefcase, CalendarDays, ClipboardList,
  Clock, Handshake, PlaneTakeoff, PlayCircle, Receipt, Users, Wallet,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { JobNumber } from "@/components/job-number";
import { AnwesenheitskalenderCard } from "@/components/dashboard/anwesenheit-card";

// ---------------------------------------------------------------------------
// Payload-Typen (Spiegel zu /api/dashboard)
// ---------------------------------------------------------------------------

interface NaechsterEinsatz {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  job_number: number | null;
  job_title: string | null;
  customer_name: string | null;
}

interface MaData {
  monat_stunden: number;
  ist_lohn_chf: number;
  wage_exempt: boolean;
  hourly_wage_chf: number | null;
  prognose_stunden: number;
  prognose_lohn_chf: number;
  naechster_einsatz: NaechsterEinsatz | null;
}

interface AdminData {
  kpi: {
    offene_auftraege: number;
    geplante_termine_woche: number;
    nicht_abgerechnet: number;
  };
  zu_erledigen: {
    ferien_pending: number;
    ueberfaellige_auftraege: number;
    neue_belege: number;
  };
  team_status: {
    eingestempelt: number;
    in_ferien_heute: number;
  };
}

interface DashboardResponse {
  success: true;
  role: "admin" | "techniker" | "partner" | string;
  first_name: string;
  admin?: AdminData;
  ma?: MaData;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function greetingForHour(h: number): string {
  if (h < 12) return "Guten Morgen";
  if (h < 17) return "Guten Tag";
  return "Guten Abend";
}

function fmtChf(v: number): string {
  return new Intl.NumberFormat("de-CH", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(v));
}

function fmtHours(h: number): string {
  const rounded = Math.round(h * 10) / 10;
  return `${rounded.toLocaleString("de-CH", { minimumFractionDigits: rounded % 1 === 0 ? 0 : 1, maximumFractionDigits: 1 })} h`;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-CH", {
    timeZone: "Europe/Zurich",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard", { credentials: "include" });
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) {
          setError(json.error ?? "Laden fehlgeschlagen");
        } else {
          setData(json as DashboardResponse);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Netzwerk-Fehler");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const greeting = greetingForHour(new Date().getHours());
  const name = data?.first_name?.trim() ?? "";

  if (loading) {
    return (
      <div className="page-enter space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-enter space-y-4">
        <h1 className="font-heading text-2xl font-semibold">Dashboard</h1>
        <div className="rounded-xl border bg-card p-4 flex items-start gap-3 text-sm">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Dashboard konnte nicht geladen werden</p>
            <p className="text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">
          {greeting}{name ? `, ${name}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {data?.role === "admin"
            ? "Was jetzt wichtig ist"
            : data?.role === "techniker"
            ? "Dein Monat auf einen Blick"
            : "Willkommen im Portal"}
        </p>
      </header>

      {data?.role === "admin" && data.admin && <AdminDashboard admin={data.admin} />}
      {data?.role === "techniker" && data.ma && <MaDashboard ma={data.ma} />}
      {data?.role === "partner" && <PartnerDashboard />}
      {data && data.role !== "admin" && data.role !== "techniker" && data.role !== "partner" && (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Fuer deine Rolle ist noch kein Dashboard konfiguriert. Nutze die Sidebar zur Navigation.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MA-Dashboard
// ---------------------------------------------------------------------------

function MaDashboard({ ma }: { ma: MaData }) {
  const monatLohnLabel = ma.wage_exempt
    ? "Kein Lohn hinterlegt"
    : ma.hourly_wage_chf == null
    ? "Kein Stundensatz hinterlegt"
    : `= CHF ${fmtChf(ma.ist_lohn_chf)} ausbezahlt`;

  const prognoseLohnLabel = ma.wage_exempt
    ? "Kein Lohn hinterlegt"
    : ma.hourly_wage_chf == null
    ? "Kein Stundensatz hinterlegt"
    : `= CHF ${fmtChf(ma.prognose_lohn_chf)}`;

  const plannedHours = Math.max(0, ma.prognose_stunden - ma.monat_stunden);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hero: Ist-Stunden */}
        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <Clock className="h-3.5 w-3.5 text-accent" />
            Deine Stunden diesen Monat
          </div>
          <div className="mt-3 flex items-baseline gap-2 tabular-nums">
            <span className="font-heading text-5xl font-semibold leading-none">
              {ma.monat_stunden.toLocaleString("de-CH", { maximumFractionDigits: 1 })}
            </span>
            <span className="text-xl text-muted-foreground">h</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{monatLohnLabel}</p>
          <Link
            href="/stempelzeiten"
            className="mt-3 inline-flex items-center gap-1 text-xs text-accent font-medium hover:underline"
          >
            Zu meinen Stempelzeiten <ArrowRight className="h-3 w-3" />
          </Link>
        </section>

        {/* Prognose Monatsende */}
        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <Wallet className="h-3.5 w-3.5 text-accent" />
            Prognose Monatsende
          </div>
          <div className="mt-3 flex items-baseline gap-2 tabular-nums">
            <span className="font-heading text-5xl font-semibold leading-none">
              {ma.prognose_stunden.toLocaleString("de-CH", { maximumFractionDigits: 1 })}
            </span>
            <span className="text-xl text-muted-foreground">h</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{prognoseLohnLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            aktuell {fmtHours(ma.monat_stunden)} + geplant {fmtHours(plannedHours)}
          </p>
        </section>
      </div>

      {/* Naechster Einsatz */}
      <NaechsterEinsatzCard einsatz={ma.naechster_einsatz} />
    </div>
  );
}

function NaechsterEinsatzCard({ einsatz }: { einsatz: NaechsterEinsatz | null }) {
  if (!einsatz) {
    return (
      <section className="rounded-xl border bg-card p-4 text-sm text-muted-foreground flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-muted-foreground/70" />
        Kein anstehender Einsatz.
      </section>
    );
  }
  return (
    <Link
      href="/kalender"
      className="block rounded-xl border bg-card p-4 hover:border-accent transition-colors"
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <CalendarDays className="h-3.5 w-3.5 text-accent" />
        Naechster Einsatz
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold tabular-nums">{fmtDateTime(einsatz.start_time)}</span>
        {einsatz.job_number != null && <JobNumber number={einsatz.job_number} />}
        <span className="text-sm text-muted-foreground truncate">
          {einsatz.customer_name ?? einsatz.job_title ?? einsatz.title}
        </span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Admin-Dashboard
// ---------------------------------------------------------------------------

function AdminDashboard({ admin }: { admin: AdminData }) {
  return (
    <div className="space-y-5">
      {/* KPI-Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          icon={<Briefcase className="h-3.5 w-3.5" />}
          label="Offene Auftraege"
          value={admin.kpi.offene_auftraege}
          href="/auftraege"
        />
        <KpiCard
          icon={<CalendarDays className="h-3.5 w-3.5" />}
          label="Termine diese Woche"
          value={admin.kpi.geplante_termine_woche}
          href="/kalender"
        />
        <KpiCard
          icon={<Receipt className="h-3.5 w-3.5" />}
          label="Nicht abgerechnet"
          value={admin.kpi.nicht_abgerechnet}
          href="/abrechnung"
        />
      </div>

      {/* Zu erledigen + Team-Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="font-heading text-base font-semibold flex items-center gap-2 mb-3">
            <ClipboardList className="h-4 w-4 text-accent" /> Zu erledigen
          </h2>
          <div className="divide-y">
            <TodoRow
              icon={<PlaneTakeoff className="h-4 w-4" />}
              label="Ferien-Antraege pending"
              count={admin.zu_erledigen.ferien_pending}
              href="/hr?tab=anfragen"
            />
            <TodoRow
              icon={<AlertCircle className="h-4 w-4" />}
              label="Ueberfaellige Auftraege"
              count={admin.zu_erledigen.ueberfaellige_auftraege}
              href="/auftraege"
              urgent={admin.zu_erledigen.ueberfaellige_auftraege > 0}
            />
            <TodoRow
              icon={<Receipt className="h-4 w-4" />}
              label="Neue Belege"
              count={admin.zu_erledigen.neue_belege}
              href="/abrechnung"
            />
          </div>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="font-heading text-base font-semibold flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-accent" /> Team-Status
          </h2>
          <div className="divide-y">
            <TodoRow
              icon={<PlayCircle className="h-4 w-4" />}
              label="Gerade eingestempelt"
              count={admin.team_status.eingestempelt}
              href="/stempelzeiten"
            />
            <TodoRow
              icon={<PlaneTakeoff className="h-4 w-4" />}
              label="Heute in Ferien"
              count={admin.team_status.in_ferien_heute}
              href="/ferien"
            />
          </div>
        </section>
      </div>

      {/* Anwesenheitsplan (nur wenn User berechtigt — Card blendet sich sonst selbst aus) */}
      <AnwesenheitskalenderCard />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border bg-card p-4 hover:border-accent transition-colors block"
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <span className="text-accent">{icon}</span>
        {label}
      </div>
      <div className="mt-2 font-heading text-3xl font-semibold tabular-nums">{value}</div>
    </Link>
  );
}

function TodoRow({
  icon,
  label,
  count,
  href,
  urgent = false,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  href: string;
  urgent?: boolean;
}) {
  const badge = count === 0 ? (
    <span className="text-xs text-muted-foreground/70">0</span>
  ) : (
    <span
      className={`inline-flex items-center justify-center min-w-[1.75rem] h-6 px-2 rounded-full text-xs font-semibold tabular-nums ${
        urgent
          ? "bg-red-500/15 text-red-700 dark:text-red-300"
          : "bg-foreground/10 text-foreground/80 dark:bg-foreground/15"
      }`}
    >
      {count}
    </span>
  );
  return (
    <Link
      href={href}
      className="flex items-center gap-3 py-2.5 text-sm hover:text-accent transition-colors"
    >
      <span className="text-muted-foreground/70">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge}
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40" />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Partner-Dashboard
// ---------------------------------------------------------------------------

function PartnerDashboard() {
  return (
    <section className="rounded-xl border bg-card p-6">
      <div className="flex items-start gap-3">
        <Handshake className="h-5 w-5 text-accent shrink-0 mt-0.5" />
        <div>
          <h2 className="font-heading text-lg font-semibold">Willkommen im Partner-Portal</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Hier siehst du deine Anfragen und kannst sie beantworten.
          </p>
          <Link
            href="/partner/anfragen"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            Zu meinen Anfragen <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

