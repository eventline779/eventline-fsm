"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { JOB_STATUS, REQUEST_STEPS } from "@/lib/constants";
import { RequestStepTracker } from "@/components/request-step-tracker";
import type { Job, JobStatus, Profile } from "@/types";
import Link from "next/link";
import {
  Plus,
  Search,
  ClipboardList,
  Calendar,
  CalendarPlus,
  MapPin,
  User,
  AlertCircle,
  Archive,
  X,
  Pencil,
  Check,
  Send,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/searchable-select";
import { JobNumber } from "@/components/job-number";
import { DonutChart } from "@/components/donut-chart";
import { SendStepModal } from "@/components/send-step-modal";
import { toast } from "sonner";

const MAIL_STEPS = new Set<number>([1, 3, 5]);

export default function AuftraegePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
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

  // Filter in localStorage speichern
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("auftraege-search-number", searchNumber); }, [searchNumber]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("auftraege-search-title", searchTitle); }, [searchTitle]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("auftraege-status", filterStatus); }, [filterStatus]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("auftraege-location", filterLocation); }, [filterLocation]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem("auftraege-archive", String(showArchive)); }, [showArchive]);

  useEffect(() => {
    loadJobs();
    const handler = () => loadJobs();
    window.addEventListener("jobs:invalidate", handler);
    return () => window.removeEventListener("jobs:invalidate", handler);
  }, []);

  // Step-Advance fuer eine Anfrage. Bei Mail-Schritten oeffnet das Modal das selber
  // - hier landet erst die confirm-Phase nach erfolgreichem Mail-Versand.
  // Bei Warte-Schritten (2, 4) direkter UPDATE.
  async function advanceAnfrageStep(jobId: string) {
    const job = jobs.find((j) => j.id === jobId);
    if (!job?.request_step) return;
    const nextStep = job.request_step + 1;
    if (nextStep > 5) {
      // Letzter Schritt durchlaufen -> Convert-Modal oeffnen
      setConvertJobId(jobId);
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
    const job = jobs.find((j) => j.id === jobId);
    if (!job?.request_step) return;
    if (MAIL_STEPS.has(job.request_step)) {
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

  async function loadJobs() {
    const [jobsRes, profRes] = await Promise.all([
      supabase
        .from("jobs")
        .select("*, customer:customers(name, email), location:locations(name), project_lead_id, assignments:job_assignments(profile_id), appointments:job_appointments(id, start_time)")
        .neq("is_deleted", true)
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
    ]);
    if (jobsRes.data) setJobs(jobsRes.data as unknown as Job[]);
    if (profRes.data) setProfiles(profRes.data as Profile[]);
    setLoading(false);
  }

  // Anfang von heute (00:00) - Aufträge die heute stattfinden zählen noch als "kommend"
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const isArchived = (j: Job) => j.status === "abgeschlossen" || j.status === "storniert";
  const filtered = jobs.filter((j) => {
    // Stornierungen, die in der Anfrage-Phase passierten, gehoeren nicht ins
    // Auftrags-Archiv — zu dem Zeitpunkt war es noch kein Auftrag.
    if (j.cancelled_as_anfrage) return false;
    const matchesArchive = showArchive ? isArchived(j) : !isArchived(j);
    const numQ = searchNumber.trim();
    const titleQ = searchTitle.trim().toLowerCase();
    const matchesNumber = !numQ ? true : String(j.job_number ?? "").includes(numQ);
    const matchesTitle = !titleQ ? true : j.title.toLowerCase().includes(titleQ);
    const matchesSearch = matchesNumber && matchesTitle;
    const matchesStatus = filterStatus === "all" || j.status === filterStatus;
    const locName = ((j.location as unknown as { name: string })?.name || "").toLowerCase();
    const isScala = locName.includes("scala");
    const isBarakuba = locName.includes("barakuba");
    const isBau3 = locName.includes("bau3");
    let matchesLocation = true;
    if (filterLocation === "scala") matchesLocation = isScala;
    else if (filterLocation === "barakuba") matchesLocation = isBarakuba;
    else if (filterLocation === "bau3") matchesLocation = isBau3;
    else if (filterLocation === "sonstige") matchesLocation = !isScala && !isBarakuba && !isBau3;
    return matchesArchive && matchesSearch && matchesStatus && matchesLocation;
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
          <h1 className="text-2xl font-bold tracking-tight">{showArchive ? "Archiv" : "Operations"}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowArchive(!showArchive)} className={showArchive ? "kasten-active" : "kasten kasten-muted"}>
            <Archive className="h-3.5 w-3.5" />{showArchive ? "Aktive anzeigen" : `Archiv (${jobs.filter((j) => !j.cancelled_as_anfrage && (j.status === "abgeschlossen" || j.status === "storniert")).length})`}
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

      {/* Kreis-Diagramm — Entwuerfe stehen separat, sonstiges direkt im Donut */}
      {jobs.length > 0 && (() => {
        const entwurfCount = jobs.filter((j) => j.status === "entwurf").length;
        const segments = [
          { label: "Vermietentwürfe", count: jobs.filter((j) => j.status === "anfrage").length, color: "var(--status-blue)" },
          { label: "Bevorstehend", count: jobs.filter((j) => j.status === "offen").length, color: "var(--status-gray)" },
          { label: "Abgeschlossen", count: jobs.filter((j) => j.status === "abgeschlossen").length, color: "var(--status-green)" },
          { label: "Storniert", count: jobs.filter((j) => j.status === "storniert" && !j.cancelled_as_anfrage).length, color: "var(--status-red)" },
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
            onChange={(e) => setSearchNumber(e.target.value)}
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
                    ? `${jobs.length} Auftrag${jobs.length === 1 ? "" : "e"} insgesamt — passt nichts auf deine Filter.`
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
        <div className="space-y-3">
          {filtered.map((job) => {
            const appointments = (job as any).appointments as { id: string; start_time: string }[] | null;
            const hasAppointment = appointments && appointments.length > 0;
            const isActive = !["abgeschlossen", "storniert"].includes(job.status);
            const isAnfrage = job.status === "anfrage";
            const currentStep = job.request_step ?? 1;
            const stepInfo = REQUEST_STEPS[currentStep - 1];
            const isMailStep = MAIL_STEPS.has(currentStep);
            // Bei Entwurf/Vermietentwurf macht Terminplanung noch keinen Sinn.
            const noTermin = isActive && !hasAppointment && job.status !== "entwurf" && !isAnfrage;
            const allGood = isActive && hasAppointment && job.status !== "entwurf" && !isAnfrage;
            const detailHref = isAnfrage ? `/auftraege/vermietentwurf/${job.id}` : `/auftraege/${job.id}`;
            return (
            <Link key={job.id} href={detailHref} className="block">
              <Card className={`relative bg-card hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 cursor-pointer group ${
                job.status === "entwurf" ? "border-dashed opacity-80" : ""
              }`}>
                <CardContent className="p-4">
                  {/* Layout: Linke Card-Haelfte = Inhalt, vertikaler Trennstrich
                      auf der Card-Mitte, rechte Card-Haelfte = Tag+Tracker
                      direkt nach dem Strich + Action ganz rechts.
                      Beide Aussen-Spalten flex-1 mit min-w-0, damit der Strich
                      gleichmaessig zur Mitte rutscht. */}
                  <div className="flex items-stretch gap-3">
                    {/* LINKS (50%): Titel + Kunde + Beschreibung */}
                    <div className="min-w-0 flex-1 self-center">
                      <div className="flex items-center gap-3 min-w-0">
                        <JobNumber number={job.job_number} />
                        <h3 className="font-semibold truncate">{job.title}</h3>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        {(job.customer as unknown as { name: string })?.name && (
                          <span className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5" />
                            {(job.customer as unknown as { name: string }).name}
                          </span>
                        )}
                        {(job.location as unknown as { name: string })?.name && (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" />
                            {(job.location as unknown as { name: string }).name}
                          </span>
                        )}
                        {job.start_date && (
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(job.start_date).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })}
                            {job.end_date && job.end_date !== job.start_date && (
                              <>
                                {" – "}
                                {new Date(job.end_date).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })}
                              </>
                            )}
                          </span>
                        )}
                      </div>
                      {job.description && (
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-1">{job.description}</p>
                      )}
                    </div>

                    {/* VERTIKALER TRENNSTRICH — auf der Card-Mitte. Gleiche Optik
                        wie der Card-Rand (foreground/10). my-2 sodass er die
                        Ober- und Unterkante nicht beruehrt. */}
                    <div className="self-stretch my-2 w-0.5 bg-foreground/10 shrink-0" aria-hidden="true" />

                    {/* RECHTS (50%): Tag+Tracker direkt nach dem Strich +
                        Action ganz rechts. Tag und Tracker linksbuendig
                        zueinander (items-start). */}
                    <div className="min-w-0 flex-1 self-center flex items-center gap-3">
                      <div className="flex flex-col items-start gap-2 min-w-0">
                        <div className="flex items-center gap-2">
                          {job.priority === "dringend" && isActive && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">
                              <AlertCircle className="h-3 w-3" />
                              Dringend
                            </span>
                          )}
                          {job.status !== "offen" && (
                            <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${JOB_STATUS[job.status].color}`}>
                              {JOB_STATUS[job.status].label}
                            </span>
                          )}
                        </div>
                        {isAnfrage && (
                          <RequestStepTracker currentStep={currentStep} size="sm" />
                        )}
                      </div>
                      <div className="ml-auto flex items-center shrink-0">
                      {isAnfrage ? (
                        isMailStep ? (
                          <div className="flex items-center gap-0.5">
                            <span className="text-xs font-medium text-blue-700 dark:text-blue-300 whitespace-nowrap pr-1">
                              {stepInfo.label}
                            </span>
                            <div className="w-10 h-10 flex items-center justify-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleAnfrageNext(job.id);
                                }}
                                className="p-2.5 rounded-lg text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                                aria-label={stepInfo.label}
                                title={stepInfo.label}
                              >
                                <Send className="h-5 w-5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="pr-2">
                            <span className="text-xs font-medium text-blue-700 dark:text-blue-300 whitespace-nowrap">
                              Manuell in Details bestätigen
                            </span>
                          </div>
                        )
                      ) : (noTermin || job.status === "entwurf" || allGood) ? (
                        <div className="flex items-center gap-0.5">
                          {noTermin && (
                            <span className="text-xs font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap pr-1">
                              Kein Termin geplant{job.start_date ? ` — fällig bis ${new Date(job.start_date).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })}` : ""}
                            </span>
                          )}
                          <div className="w-10 h-10 flex items-center justify-center">
                            {job.status === "entwurf" ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  router.push(`/auftraege/${job.id}/bearbeiten`);
                                }}
                                className="p-2.5 rounded-lg text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-colors"
                                aria-label="Bearbeiten"
                                title="Entwurf bearbeiten"
                              >
                                <Pencil className="h-5 w-5" />
                              </button>
                            ) : noTermin ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  router.push(`/auftraege/${job.id}?termin=neu`);
                                }}
                                className="p-2.5 rounded-lg text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
                                aria-label="Termin planen"
                                title="Termin planen"
                              >
                                <CalendarPlus className="h-5 w-5" />
                              </button>
                            ) : allGood ? (
                              <span
                                className="p-2.5 rounded-lg text-emerald-600 dark:text-emerald-400 inline-flex"
                                aria-label="Alles bereit"
                                title="Alles bereit"
                              >
                                <Check className="h-5 w-5" strokeWidth={3} />
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
            );
          })}
        </div>
      )}

      {/* Inline-Mail-Modal fuer Vermietentwuerfe — wird vom "Nächster Schritt"-Button auf jeder
          Anfrage-Karte gefuettert. Beim Bestaetigen ruft onAdvance den entsprechenden
          Step-+1 (oder oeffnet den Convert-Modal) auf. */}
      {(() => {
        const activeJob = activeStepJobId ? jobs.find((j) => j.id === activeStepJobId) ?? null : null;
        if (!activeJob) return null;
        const customer = activeJob.customer as unknown as { name?: string | null; email?: string | null } | undefined;
        const location = activeJob.location as unknown as { name?: string | null } | undefined;
        return (
          <SendStepModal
            open={true}
            jobId={activeJob.id}
            step={(activeJob.request_step ?? 1) as 1 | 2 | 3 | 4 | 5}
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

      {/* Convert-Modal: Mietentwurf -> Auftrag (nach Schritt 5). Wird auch vom Inline-Flow geoeffnet. */}
      {convertJobId && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => { if (!convertSaving) setConvertJobId(null); }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border">
              <div className="px-6 py-4 border-b">
                <h2 className="font-semibold">Vermietentwurf in Auftrag umwandeln?</h2>
              </div>
              <div className="p-6 space-y-4">
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
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
