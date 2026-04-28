"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { JOB_STATUS, REQUEST_STEPS, REQUEST_MAIL_STEPS } from "@/lib/constants";
import type { JobStatus, Profile, JobWithRelations } from "@/types";
import Link from "next/link";
import { RequestStepTracker } from "@/components/request-step-tracker";
import {
  Plus,
  Search,
  ClipboardList,
  CalendarPlus,
  AlertCircle,
  Archive,
  X,
  Pencil,
  Check,
  Send,
  ChevronDown,
} from "lucide-react";

const ARCHIVE_PAGE_SIZE = 100;
// Location wird mit dem Verwaltungs-Kunden gejoint, sodass Standort-Auftraege
// (jobs.customer_id = null) trotzdem einen Kundennamen anzeigen koennen.
// Room wird ebenfalls gejoint fuer extern-Auftraege mit bekanntem Raum.
const JOBS_SELECT = "*, customer:customers(name, email), location:locations(name, customer:customers(id, name)), room:rooms(id, name), project_lead_id, assignments:job_assignments(profile_id), appointments:job_appointments(id, start_time)";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/searchable-select";
import { JobNumber } from "@/components/job-number";
import { DonutChart } from "@/components/donut-chart";
import { SendStepModal } from "@/components/send-step-modal";
import { Modal } from "@/components/ui/modal";
import { toast } from "sonner";

type DonutCounts = {
  anfrage: number;
  offen: number;
  offenVermietung: number;
  abgeschlossen: number;
  storniert: number;
  entwurf: number;
};

const EMPTY_COUNTS: DonutCounts = {
  anfrage: 0,
  offen: 0,
  offenVermietung: 0,
  abgeschlossen: 0,
  storniert: 0,
  entwurf: 0,
};

export default function AuftraegePage() {
  // Active = alle nicht-archivierten Jobs (status ≠ abgeschlossen|storniert).
  // Bounded set, voll geladen für saubere client-seitige Suche/Filter.
  const [activeJobs, setActiveJobs] = useState<JobWithRelations[]>([]);
  // Archive = paginiert (kann über Jahre wachsen). Erste Seite eager,
  // weitere via "Mehr laden".
  const [archiveJobs, setArchiveJobs] = useState<JobWithRelations[]>([]);
  const [archiveHasMore, setArchiveHasMore] = useState(false);
  const [archiveLoadingMore, setArchiveLoadingMore] = useState(false);
  // Counts kommen ausschliesslich aus der DB — entkoppelt vom geladenen State,
  // damit der Donut auch bei paginierter Archive-Liste korrekt bleibt.
  const [counts, setCounts] = useState<DonutCounts>(EMPTY_COUNTS);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [searchNumber, setSearchNumber] = useState(() => typeof window !== "undefined" ? localStorage.getItem("auftraege-search-number") || "" : "");
  const [searchTitle, setSearchTitle] = useState(() => typeof window !== "undefined" ? localStorage.getItem("auftraege-search-title") || "" : "");
  const [filterStatus, setFilterStatus] = useState<JobStatus | "all">(() => typeof window !== "undefined" ? (localStorage.getItem("auftraege-status") as JobStatus | "all") || "all" : "all");
  const [filterLocation, setFilterLocation] = useState<"all" | "scala" | "barakuba" | "bau3" | "sonstige">(() => typeof window !== "undefined" ? (localStorage.getItem("auftraege-location") as any) || "all" : "all");
  const [showArchive, setShowArchive] = useState(() => typeof window !== "undefined" ? localStorage.getItem("auftraege-archive") === "true" : false);
  const [loading, setLoading] = useState(true);
  // Inline-Step-Aktion: welche Anfrage-Karte hat aktuell das Mail-Modal offen?
  const [activeStepJobId, setActiveStepJobId] = useState<string | null>(null);
  // Convert-Modal: Mietentwurf -> Auftrag
  const [convertJobId, setConvertJobId] = useState<string | null>(null);
  const [convertSaving, setConvertSaving] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  // Race-Guard fuer Archive-Queries (alte Antworten verwerfen, wenn neuere unterwegs sind)
  const archiveQueryIdRef = useRef(0);
  // Debounce-Timer fuer Suche (Tippen feuert nicht jede Query sofort)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter in localStorage speichern
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("auftraege-search-number", searchNumber); }, [searchNumber]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("auftraege-search-title", searchTitle); }, [searchTitle]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("auftraege-status", filterStatus); }, [filterStatus]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("auftraege-location", filterLocation); }, [filterLocation]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("auftraege-archive", String(showArchive)); }, [showArchive]);

  // Active + Counts + Profiles: filter-unabhaengig, wird bei Mount und Invalidate geladen.
  // Archive: filter-abhaengig, eigener Effect mit Debounce (siehe weiter unten).
  useEffect(() => {
    loadActiveAndCounts();
    const handler = () => {
      loadActiveAndCounts();
      // Bei Datenaenderung im Archive-Modus auch die Archive-Liste neu ziehen.
      if (showArchive) reloadArchive();
    };
    window.addEventListener("jobs:invalidate", handler);
    return () => window.removeEventListener("jobs:invalidate", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchive]);

  // Step-Advance fuer eine Anfrage. Bei Mail-Schritten oeffnet das Modal das selber.
  // Bei Warte-Schritten (2, 4) direkter UPDATE.
  // Nach Schritt 4 (Angebot bestaetigt) -> direkt umwandeln in Auftrag
  // (status='offen', kein Entwurf-Zwischenschritt). was_anfrage bleibt true.
  async function advanceAnfrageStep(jobId: string) {
    const job = activeJobs.find((j) => j.id === jobId);
    if (!job?.request_step) return;
    const nextStep = job.request_step + 1;
    if (nextStep > 4) {
      // Schritt 4 erledigt -> Vermietentwurf -> Auftrag (offen)
      const { error } = await supabase
        .from("jobs")
        .update({ status: "offen", request_step: null })
        .eq("id", jobId);
      if (error) {
        toast.error("Fehler: " + error.message);
        return;
      }
      toast.success("Vermietentwurf in Auftrag umgewandelt");
      window.dispatchEvent(new Event("jobs:invalidate"));
      return;
    }
    const { error } = await supabase
      .from("jobs")
      .update({ request_step: nextStep })
      .eq("id", jobId);
    if (error) {
      toast.error("Fehler: " + error.message);
      return;
    }
    toast.success(REQUEST_STEPS[nextStep - 1].label);
    window.dispatchEvent(new Event("jobs:invalidate"));
  }

  async function handleAnfrageNext(jobId: string) {
    const job = activeJobs.find((j) => j.id === jobId);
    if (!job?.request_step) return;
    if (REQUEST_MAIL_STEPS.has(job.request_step)) {
      setActiveStepJobId(jobId);
      return;
    }
    await advanceAnfrageStep(jobId);
  }

  async function confirmConvert() {
    if (!convertJobId) return;
    setConvertSaving(true);
    const { error } = await supabase
      .from("jobs")
      .update({ status: "entwurf", request_step: null })
      .eq("id", convertJobId);
    setConvertSaving(false);
    if (error) {
      toast.error("Fehler: " + error.message);
      return;
    }
    const id = convertJobId;
    setConvertJobId(null);
    toast.success("In Auftrag umgewandelt — bitte vor Freigabe prüfen");
    window.dispatchEvent(new Event("jobs:invalidate"));
    router.push(`/auftraege/${id}/bearbeiten`);
  }

  // Counts kommen aus 6 parallelen Count-Queries (head:true, kein Datenbody).
  // Damit ist der Donut entkoppelt vom geladenen State und auch bei paginierter
  // Archive-Liste korrekt — und skaliert auf beliebig viele Jobs in der DB.
  // cancelled_as_anfrage darf nicht via .neq(true) gefiltert werden, da das auch
  // NULL-Zeilen ausschliessen wuerde — daher .or(is.null OR eq.false).
  async function loadCounts(): Promise<DonutCounts> {
    const cancelledFilter = "cancelled_as_anfrage.is.null,cancelled_as_anfrage.eq.false";
    const [anfrage, offen, offenVerm, abg, sto, ent] = await Promise.all([
      supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "anfrage").neq("is_deleted", true).or(cancelledFilter),
      supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "offen").neq("is_deleted", true),
      supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "offen").eq("was_anfrage", true).neq("is_deleted", true),
      supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "abgeschlossen").neq("is_deleted", true),
      supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "storniert").neq("is_deleted", true).or(cancelledFilter),
      supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "entwurf").neq("is_deleted", true),
    ]);
    return {
      anfrage: anfrage.count ?? 0,
      offen: offen.count ?? 0,
      offenVermietung: offenVerm.count ?? 0,
      abgeschlossen: abg.count ?? 0,
      storniert: sto.count ?? 0,
      entwurf: ent.count ?? 0,
    };
  }

  async function loadActiveAndCounts() {
    const cancelledFilter = "cancelled_as_anfrage.is.null,cancelled_as_anfrage.eq.false";
    const [activeRes, profRes, freshCounts] = await Promise.all([
      // Active: alle nicht-archivierten Jobs voll geladen (bounded set,
      // typischerweise <200 — joins waeren bei Pagination + Sort-Logik teuer).
      supabase
        .from("jobs")
        .select(JOBS_SELECT)
        .neq("is_deleted", true)
        .or(cancelledFilter)
        .not("status", "in", '("abgeschlossen","storniert")')
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
      loadCounts(),
    ]);
    if (activeRes.data) setActiveJobs(activeRes.data as unknown as JobWithRelations[]);
    if (profRes.data) setProfiles(profRes.data as Profile[]);
    setCounts(freshCounts);
    setLoading(false);
  }

  // Archive-Query mit Filtern: status, title, exakte Nummer — alles server-seitig.
  // Location bleibt client-seitig (joined-table-Filter wuerde die Datenform aendern).
  // job_number ist Integer — partial-Match nicht via PostgREST moeglich, daher
  // nur bei vollstaendiger Eingabe (6 Ziffern) als exact-Filter.
  const buildArchiveQuery = useCallback((cursor: string | null) => {
    const cancelledFilter = "cancelled_as_anfrage.is.null,cancelled_as_anfrage.eq.false";
    let q = supabase
      .from("jobs")
      .select(JOBS_SELECT)
      .neq("is_deleted", true)
      .or(cancelledFilter);

    if (filterStatus === "abgeschlossen" || filterStatus === "storniert") {
      q = q.eq("status", filterStatus);
    } else {
      q = q.in("status", ["abgeschlossen", "storniert"]);
    }

    const titleQ = searchTitle.trim();
    if (titleQ) q = q.ilike("title", `%${titleQ}%`);

    const numQ = searchNumber.trim();
    if (numQ.length === 6 && /^\d+$/.test(numQ)) {
      q = q.eq("job_number", parseInt(numQ, 10));
    }

    if (cursor !== null) q = q.lt("created_at", cursor);
    return q.order("created_at", { ascending: false }).limit(ARCHIVE_PAGE_SIZE + 1);
  }, [supabase, filterStatus, searchTitle, searchNumber]);

  const reloadArchive = useCallback(async () => {
    const myId = ++archiveQueryIdRef.current;
    const { data } = await buildArchiveQuery(null);
    if (myId !== archiveQueryIdRef.current) return; // ueberholt — verwerfen
    if (data) {
      const rows = data as unknown as JobWithRelations[];
      setArchiveHasMore(rows.length > ARCHIVE_PAGE_SIZE);
      setArchiveJobs(rows.slice(0, ARCHIVE_PAGE_SIZE));
    }
  }, [buildArchiveQuery]);

  // Archive: erst-laden bei Mount/Modus-Wechsel; bei Filter/Suche-Aenderung
  // mit 250ms Debounce neu ziehen (nicht jeden Tastenanschlag).
  useEffect(() => {
    if (!showArchive) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => { reloadArchive(); }, 250);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [showArchive, reloadArchive]);

  async function loadArchiveMore() {
    if (archiveLoadingMore || archiveJobs.length === 0) return;
    setArchiveLoadingMore(true);
    const cursor = archiveJobs[archiveJobs.length - 1].created_at;
    const { data } = await buildArchiveQuery(cursor);
    if (data) {
      const rows = data as unknown as JobWithRelations[];
      setArchiveHasMore(rows.length > ARCHIVE_PAGE_SIZE);
      setArchiveJobs((prev) => [...prev, ...rows.slice(0, ARCHIVE_PAGE_SIZE)]);
    }
    setArchiveLoadingMore(false);
  }

  // Anfang von heute (00:00) - Aufträge die heute stattfinden zählen noch als "kommend"
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  // Quelle haengt vom Modus ab — Active ist voll geladen, Archive ist paginiert.
  const sourceJobs = showArchive ? archiveJobs : activeJobs;
  const totalForSource = showArchive ? counts.abgeschlossen + counts.storniert : counts.anfrage + counts.offen + counts.entwurf;
  const filtered = sourceJobs.filter((j) => {
    const numQ = searchNumber.trim();
    const titleQ = searchTitle.trim().toLowerCase();
    const matchesNumber = !numQ ? true : String(j.job_number ?? "").includes(numQ);
    const matchesTitle = !titleQ ? true : j.title.toLowerCase().includes(titleQ);
    const matchesSearch = matchesNumber && matchesTitle;
    const matchesStatus = filterStatus === "all" || j.status === filterStatus;
    const locName = (j.location?.name || "").toLowerCase();
    const isScala = locName.includes("scala");
    const isBarakuba = locName.includes("barakuba");
    const isBau3 = locName.includes("bau3");
    let matchesLocation = true;
    if (filterLocation === "scala") matchesLocation = isScala;
    else if (filterLocation === "barakuba") matchesLocation = isBarakuba;
    else if (filterLocation === "bau3") matchesLocation = isBau3;
    else if (filterLocation === "sonstige") matchesLocation = !isScala && !isBarakuba && !isBau3;
    return matchesSearch && matchesStatus && matchesLocation;
  }).sort((a, b) => {
    // Referenz-Datum: wenn Enddatum vorhanden, nutze das (damit mehrtägige Events heute noch als kommend gelten)
    const aRef = a.end_date ? new Date(a.end_date).getTime() : a.start_date ? new Date(a.start_date).getTime() : Infinity;
    const bRef = b.end_date ? new Date(b.end_date).getTime() : b.start_date ? new Date(b.start_date).getTime() : Infinity;
    const aPast = aRef < todayMs;
    const bPast = bRef < todayMs;
    if (aPast && !bPast) return 1;
    if (!aPast && bPast) return -1;
    const aSort = a.start_date ? new Date(a.start_date).getTime() : Infinity;
    const bSort = b.start_date ? new Date(b.start_date).getTime() : Infinity;
    if (!aPast && !bPast) return aSort - bSort;
    return bSort - aSort;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 min-h-9">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{showArchive ? "Operations Archiv" : "Operations"}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowArchive(!showArchive)} className={showArchive ? "kasten-active" : "kasten-toggle-off"}>
            <Archive className="h-3.5 w-3.5" />{showArchive ? "Aktive anzeigen" : `Archiv (${counts.abgeschlossen + counts.storniert})`}
          </button>
          {!showArchive && (
            <>
              <Link href="/auftraege/vermietentwurf/neu" className="kasten kasten-blue">
                <Plus className="h-3.5 w-3.5" />
                Neuer Vermietentwurf
              </Link>
              <Link href="/auftraege/neu" className="kasten kasten-red">
                <Plus className="h-3.5 w-3.5" />
                Neuer Auftrag
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Kreis-Diagramm — Counts kommen aus DB-Count-Queries (entkoppelt vom geladenen State) */}
      {(counts.anfrage + counts.offen + counts.abgeschlossen + counts.storniert + counts.entwurf) > 0 && (() => {
        const entwurfCount = counts.entwurf;
        const segments = [
          { label: "Vermietentwürfe", count: counts.anfrage, color: "var(--status-blue)" },
          {
            label: "Bevorstehend",
            count: counts.offen,
            color: "var(--status-gray)",
            // Untersegment: Aufträge die aus einer Vermietung kommen — hellblau,
            // sitzt als schmalerer Innenring innerhalb des Bevorstehend-Segments.
            sub: {
              label: "Vermietung",
              count: counts.offenVermietung,
              color: "#38bdf8",
            },
          },
          { label: "Abgeschlossen", count: counts.abgeschlossen, color: "var(--status-green)" },
          { label: "Storniert", count: counts.storniert, color: "var(--status-red)" },
        ];
        const entwurfPill = entwurfCount > 0 && (
          <button
            type="button"
            onClick={() => setFilterStatus("entwurf")}
            className="inline-flex items-center gap-3 text-[11px] font-medium text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 transition-colors"
            title="Filter auf Entwürfe setzen"
          >
            <span className="w-2 h-2 rounded-full bg-purple-500 dark:bg-purple-400 shrink-0" />
            {entwurfCount} {entwurfCount === 1 ? "Entwurf" : "Entwürfe"} · separat
          </button>
        );
        return (
          <DonutChart
            segments={segments}
            centerLabel="Aufträge"
            below={entwurfPill}
            emptyMessage={entwurfCount > 0 ? "Aktuell nur Entwürfe — noch keine freigegebenen Aufträge." : "Keine Aufträge vorhanden."}
          />
        );
      })()}

      {/* Such- und Filter-Bar — kompakt, getrennte Felder fuer Nummer und Titel */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Suche Nummer */}
        <div className="relative w-full sm:w-44">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono text-muted-foreground/60 pointer-events-none">
            INT-
          </span>
          <Input
            placeholder="000000"
            value={searchNumber}
            onChange={(e) => setSearchNumber(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            pattern="[0-9]*"
            className="pl-[3rem] h-9 font-mono"
            aria-label="Auftragsnummer"
          />
        </div>

        {/* Suche Titel */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Titel suchen…"
            value={searchTitle}
            onChange={(e) => setSearchTitle(e.target.value)}
            className="pl-9 h-9"
            aria-label="Titel"
          />
        </div>

        {/* Status-Filter */}
        <div className="w-full sm:w-44">
          <SearchableSelect
            value={filterStatus}
            onChange={(v) => setFilterStatus(v as JobStatus | "all")}
            items={[
              { id: "all", label: "Alle Status" },
              ...(Object.keys(JOB_STATUS) as JobStatus[]).map((s) => ({
                id: s,
                label: JOB_STATUS[s].label,
              })),
            ]}
            searchable={false}
            clearable={false}
            active={filterStatus !== "all"}
          />
        </div>

        {/* Location-Filter */}
        <div className="w-full sm:w-44">
          <SearchableSelect
            value={filterLocation}
            onChange={(v) =>
              setFilterLocation(
                v as "all" | "scala" | "barakuba" | "bau3" | "sonstige"
              )
            }
            items={[
              { id: "all", label: "Alle Locations" },
              { id: "scala", label: "SCALA Basel" },
              { id: "barakuba", label: "Barakuba" },
              { id: "bau3", label: "Theater BAU3" },
              { id: "sonstige", label: "Sonstige" },
            ]}
            searchable={false}
            clearable={false}
            active={filterLocation !== "all"}
          />
        </div>

        {/* Reset (nur wenn ein Filter aktiv) */}
        {(searchNumber || searchTitle || filterStatus !== "all" || filterLocation !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSearchNumber("");
              setSearchTitle("");
              setFilterStatus("all");
              setFilterLocation("all");
            }}
            className="h-9 px-3 text-xs text-muted-foreground hover:text-foreground rounded-lg flex items-center gap-1.5 transition-colors"
            title="Alle Filter zurücksetzen"
          >
            <X className="h-3.5 w-3.5" />
            Reset
          </button>
        )}
      </div>

      {/* Job List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse bg-card">
              <CardContent className="p-5">
                <div className="h-5 bg-gray-200 rounded w-1/2 mb-3" />
                <div className="h-4 bg-gray-100 rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        (() => {
          const hasFilter = !!searchNumber || !!searchTitle || filterStatus !== "all" || filterLocation !== "all";
          return (
            <Card className="border-dashed bg-card">
              <CardContent className="py-16 text-center">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                  <ClipboardList className="h-7 w-7 text-gray-400" />
                </div>
                <h3 className="font-semibold text-gray-900 text-lg">
                  {hasFilter ? "Keine Ergebnisse mit diesen Filtern" : "Noch keine Aufträge"}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {hasFilter
                    ? `${totalForSource} Auftrag${totalForSource === 1 ? "" : "e"} insgesamt — passt nichts auf deine Filter.`
                    : "Erstelle deinen ersten Auftrag."}
                </p>
                {hasFilter ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchNumber("");
                      setSearchTitle("");
                      setFilterStatus("all");
                      setFilterLocation("all");
                    }}
                    className="kasten kasten-muted mt-5"
                  >
                    Filter zurücksetzen
                  </button>
                ) : (
                  <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
                    <Link href="/auftraege/vermietentwurf/neu" className="kasten kasten-blue">
                      <Plus className="h-3.5 w-3.5" />
                      Neuer Vermietentwurf
                    </Link>
                    <Link href="/auftraege/neu" className="kasten kasten-red">
                      <Plus className="h-3.5 w-3.5" />
                      Neuer Auftrag
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()
      ) : (
        <div className="space-y-1.5">
          {filtered.map((job) => {
            const appointments = job.appointments ?? null;
            const hasAppointment = appointments && appointments.length > 0;
            const isActive = !["abgeschlossen", "storniert"].includes(job.status);
            const isAnfrage = job.status === "anfrage";
            // Kunde-Fallback: Standort-Auftraege haben jobs.customer_id = NULL,
            // weil der Kunde implizit der Verwaltungs-Kunde des Standorts ist.
            const displayCustomerName = job.customer?.name ?? job.location?.customer?.name ?? null;
            const placeLabel = job.location?.name ?? job.room?.name ?? job.external_address ?? null;
            const currentStep = Math.min(Math.max(job.request_step ?? 1, 1), REQUEST_STEPS.length);
            const stepInfo = REQUEST_STEPS[currentStep - 1];
            const isMailStep = REQUEST_MAIL_STEPS.has(currentStep);
            const noTermin = isActive && !hasAppointment && job.status !== "entwurf" && !isAnfrage;
            const allGood = isActive && hasAppointment && job.status !== "entwurf" && !isAnfrage;
            const detailHref = isAnfrage ? `/auftraege/vermietentwurf/${job.id}` : `/auftraege/${job.id}`;
            const dateText = job.start_date
              ? new Date(job.start_date).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })
                + (job.end_date && job.end_date !== job.start_date ? " – " + new Date(job.end_date).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" }) : "")
              : "";

            // Action-Icon-Logik: kleines Icon in der Compact-Zeile.
            // Volle Action-Behandlung (Send-Modal, Bearbeiten-Page, Termin-Plan)
            // bleibt identisch zum vorherigen Verhalten.
            function renderActionIcon(size: "sm") {
              const iconCls = size === "sm" ? "h-4 w-4" : "h-5 w-5";
              const padCls = size === "sm" ? "p-1.5" : "p-2.5";
              if (isAnfrage) {
                if (isMailStep) return (
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAnfrageNext(job.id); }}
                    className={`${padCls} rounded-lg text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors`} aria-label={stepInfo.label}>
                    <Send className={iconCls} />
                  </button>
                );
                return null;
              }
              if (job.status === "entwurf") return (
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/auftraege/${job.id}/bearbeiten`); }}
                  className={`${padCls} rounded-lg text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-colors`} aria-label="Bearbeiten">
                  <Pencil className={iconCls} />
                </button>
              );
              if (noTermin) return (
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/auftraege/${job.id}?termin=neu`); }}
                  className={`${padCls} rounded-lg text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors`} aria-label="Termin planen">
                  <CalendarPlus className={iconCls} />
                </button>
              );
              if (allGood) return (
                <span className={`${padCls} rounded-lg text-emerald-600 dark:text-emerald-400 inline-flex`} aria-label="Alles bereit">
                  <Check className={iconCls} strokeWidth={3} />
                </span>
              );
              return null;
            }


            return (
            <Link key={job.id} href={detailHref} className="block group">
              <Card className={`relative bg-card hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 cursor-pointer ${
                job.status === "entwurf" ? "border-dashed opacity-80" : ""
              }`}>
                {/* Zwei-zeilige Card. Oben: Titel + Badges (Status/Vermietung/Dringend).
                    Unten: bei Anfragen der Step-Tracker, sonst Meta (Kunde · Ort · Datum).
                    Rechts: Hint-Text + Action-Icon, beide vertikal zentriert.
                    Gesamthoehe gleich wie vorher dank py-1.5 statt py-2. */}
                <div className="flex items-center gap-3 px-4 py-1.5">
                  <JobNumber number={job.job_number} />
                  <div className="min-w-0 flex-1">
                    {/* Zeile 1: Titel + Status-/Vermietungs-/Dringend-Badges */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-sm truncate">{job.title}</span>
                      {job.priority === "dringend" && isActive && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0 text-[10px] font-semibold rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 shrink-0">
                          <AlertCircle className="h-2.5 w-2.5" />
                        </span>
                      )}
                      {job.was_anfrage && job.status !== "anfrage" && (
                        <span className="inline-flex px-1.5 py-0 text-[10px] font-medium rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 shrink-0">
                          Vermietung
                        </span>
                      )}
                      {job.status !== "offen" && (
                        <span className={`inline-flex px-1.5 py-0 text-[10px] font-medium rounded-full shrink-0 ${JOB_STATUS[job.status].color}`}>
                          {JOB_STATUS[job.status].label}
                        </span>
                      )}
                    </div>
                    {/* Zeile 2: bei Vermietentwuerfen der Step-Tracker
                        (Workflow-Status wichtiger als Meta), sonst Meta. */}
                    {isAnfrage ? (
                      <div className="mt-0.5">
                        <RequestStepTracker currentStep={currentStep} size="sm" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 min-w-0">
                        {displayCustomerName && <span className="truncate">{displayCustomerName}</span>}
                        {displayCustomerName && (placeLabel || dateText) && <span className="opacity-50 shrink-0">·</span>}
                        {placeLabel && <span className="truncate">{placeLabel}</span>}
                        {placeLabel && dateText && <span className="opacity-50 shrink-0">·</span>}
                        {dateText && <span className="whitespace-nowrap shrink-0">{dateText}</span>}
                        {!displayCustomerName && !placeLabel && !dateText && (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Rechts: Hint-Text neben Action-Icon. Hint kontextabhaengig:
                      Mail-Schritt zeigt Step-Label (blau), Warte-Schritt zeigt
                      "Manuell in Details bestaetigen" (blau), kein-Termin zeigt
                      "Kein Termin geplant" (amber). */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isAnfrage && isMailStep && (
                      <span className="text-xs font-medium whitespace-nowrap text-blue-700 dark:text-blue-300">
                        {stepInfo.label}
                      </span>
                    )}
                    {isAnfrage && !isMailStep && (
                      <span className="text-xs font-medium whitespace-nowrap text-blue-700 dark:text-blue-300">
                        Manuell in Details bestätigen
                      </span>
                    )}
                    {!isAnfrage && noTermin && (
                      <span className="text-xs font-medium whitespace-nowrap text-amber-700 dark:text-amber-300">
                        Kein Termin geplant
                      </span>
                    )}
                    <div className="flex items-center justify-center w-9">
                      {renderActionIcon("sm")}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
            );
          })}
          {showArchive && archiveHasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={loadArchiveMore}
                disabled={archiveLoadingMore}
                className="kasten kasten-muted"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                {archiveLoadingMore ? "Lade…" : "Mehr laden"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Inline-Mail-Modal fuer Vermietentwuerfe — wird vom "Nächster Schritt"-Button auf jeder
          Anfrage-Karte gefuettert. Beim Bestaetigen ruft onAdvance den entsprechenden
          Step-+1 (oder oeffnet den Convert-Modal) auf. */}
      {(() => {
        // Nur Active-Anfragen bekommen das Mail-Modal — Anfragen sind nie im Archiv.
        const activeJob = activeStepJobId ? activeJobs.find((j) => j.id === activeStepJobId) ?? null : null;
        if (!activeJob) return null;
        const customer = activeJob.customer;
        const location = activeJob.location;
        return (
          <SendStepModal
            open={true}
            jobId={activeJob.id}
            step={(activeJob.request_step ?? 1) as 1 | 2 | 3 | 4}
            customerEmail={customer?.email ?? ""}
            customerName={customer?.name ?? null}
            locationName={location?.name ?? null}
            eventDate={activeJob.start_date}
            eventEndDate={activeJob.end_date}
            onClose={() => setActiveStepJobId(null)}
            onAdvance={() => advanceAnfrageStep(activeJob.id)}
          />
        );
      })()}

      {/* Convert-Modal: Mietentwurf -> Auftrag */}
      <Modal
        open={!!convertJobId}
        onClose={() => setConvertJobId(null)}
        title="Vermietentwurf in Auftrag umwandeln?"
        size="md"
        closable={!convertSaving}
      >
        <p className="text-sm text-muted-foreground">
          Die Anfrage wird zum Entwurf-Auftrag — du landest auf der Bearbeiten-Seite, kannst Details ergänzen und dann freigeben.
        </p>
        <div className="flex items-start gap-2 p-3 rounded-xl border tinted-blue text-xs">
          <Check className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Akquise abgeschlossen</p>
            <p className="opacity-80 mt-0.5">Alle 5 Schritte sind durchlaufen. Aus dem Vermietentwurf wird jetzt ein echter Auftrag.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setConvertJobId(null)} disabled={convertSaving} className="kasten kasten-muted flex-1">
            Abbrechen
          </button>
          <button type="button" onClick={confirmConvert} disabled={convertSaving} className="kasten kasten-red flex-1">
            {convertSaving ? "Wandle um…" : "Umwandeln"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
