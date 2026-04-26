"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { JOB_STATUS } from "@/lib/constants";
import type { Job, JobStatus, Profile } from "@/types";
import Link from "next/link";
import {
  Plus,
  Search,
  ClipboardList,
  Calendar,
  MapPin,
  User,
  AlertTriangle,
  AlertCircle,
  Archive,
  X,
  Pencil,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/searchable-select";

export default function AuftraegePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [searchNumber, setSearchNumber] = useState(() => typeof window !== "undefined" ? localStorage.getItem("auftraege-search-number") || "" : "");
  const [searchTitle, setSearchTitle] = useState(() => typeof window !== "undefined" ? localStorage.getItem("auftraege-search-title") || "" : "");
  const [filterStatus, setFilterStatus] = useState<JobStatus | "all">(() => typeof window !== "undefined" ? (localStorage.getItem("auftraege-status") as JobStatus | "all") || "all" : "all");
  const [filterLocation, setFilterLocation] = useState<"all" | "scala" | "barakuba" | "bau3" | "sonstige">(() => typeof window !== "undefined" ? (localStorage.getItem("auftraege-location") as any) || "all" : "all");
  const [showArchive, setShowArchive] = useState(() => typeof window !== "undefined" ? localStorage.getItem("auftraege-archive") === "true" : false);
  const [loading, setLoading] = useState(true);
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

  async function loadJobs() {
    const [jobsRes, profRes] = await Promise.all([
      supabase
        .from("jobs")
        .select("*, customer:customers(name), location:locations(name), project_lead_id, assignments:job_assignments(profile_id), appointments:job_appointments(id, start_time)")
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{showArchive ? "Archiv" : "Aufträge"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {jobs.filter((j) => showArchive ? (j.status === "abgeschlossen" || j.status === "storniert") : !(j.status === "abgeschlossen" || j.status === "storniert")).length} {showArchive ? "archiviert" : "aktiv"} von {jobs.length} gesamt
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowArchive(!showArchive)} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${showArchive ? "bg-gray-700 text-white border-gray-700" : "bg-white text-gray-600 border-gray-200"}`}>
            <Archive className="h-3.5 w-3.5" />{showArchive ? "Aktive anzeigen" : `Archiv (${jobs.filter((j) => j.status === "abgeschlossen" || j.status === "storniert").length})`}
          </button>
          {!showArchive && (
            <Link href="/auftraege/neu">
              <Button className="bg-red-600 hover:bg-red-700 text-white shadow-sm">
                <Plus className="h-4 w-4 mr-2" />
                Neuer Auftrag
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Kreis-Diagramm — Entwuerfe stehen separat, zaehlen nicht zur Uebersicht */}
      {jobs.length > 0 && (() => {
        const activeJobs = jobs;
        const entwurfCount = activeJobs.filter((j) => j.status === "entwurf").length;
        const segments = [
          { label: "Bevorstehend", count: activeJobs.filter((j) => j.status === "offen").length, color: "var(--status-gray)" },
          { label: "Abgeschlossen", count: activeJobs.filter((j) => j.status === "abgeschlossen").length, color: "var(--status-green)" },
          { label: "Storniert", count: activeJobs.filter((j) => j.status === "storniert").length, color: "var(--status-red)" },
        ];
        const total = segments.reduce((sum, s) => sum + s.count, 0);
        const visibleSegments = segments.filter((s) => s.count > 0);
        const radius = 72;
        const ringWidth = 18; // Dicke des Donut-Rings (Aussen- minus Innenradius)
        const outerR = radius + ringWidth / 2;
        const innerR = radius - ringWidth / 2;
        const ringDiff = outerR - innerR;
        // Padding, damit halber Stroke des Outlines an den Raendern nicht clippt
        const outlineWidth = 2.5;
        const svgPad = Math.ceil(outlineWidth / 2) + 1;
        const cx = outerR + svgPad;
        const cy = outerR + svgPad;
        const svgSize = outerR * 2 + svgPad * 2;
        // Lueckenwinkel in Radian zwischen Segmenten
        const gapAngle = visibleSegments.length > 1 ? 0.08 : 0;
        // Start an einer Gap-Mitte (12 Uhr), nicht am Segment-Anfang
        let cumulativeGapMid = -Math.PI / 2;
        return (
          <Card className="bg-white">
            <CardContent className="p-5">
              {total > 0 ? (
                <div className="flex flex-col md:flex-row items-start gap-6">
                  <div className="relative shrink-0">
                    <svg width={svgSize} height={svgSize}>
                      {/* Track: zwei feine konzentrische Outlines als Rahmen des Donuts */}
                      <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="currentColor" strokeWidth={1} className="text-foreground/[0.08]" />
                      <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="currentColor" strokeWidth={1} className="text-foreground/[0.08]" />
                      {visibleSegments.length === 1 ? (
                        // Voller Ring: aussen + innen kompletter Kreis
                        <>
                          <circle cx={cx} cy={cy} r={outerR} fill="none" stroke={visibleSegments[0].color} strokeWidth={outlineWidth} />
                          <circle cx={cx} cy={cy} r={innerR} fill="none" stroke={visibleSegments[0].color} strokeWidth={outlineWidth} />
                        </>
                      ) : (
                        visibleSegments.map((s, i) => {
                          const portion = s.count / total;
                          const segAngle = portion * 2 * Math.PI - gapAngle;
                          const gapMidPrev = cumulativeGapMid;
                          const startA = gapMidPrev + gapAngle / 2;
                          const endA = startA + segAngle;
                          const gapMidNext = endA + gapAngle / 2;
                          cumulativeGapMid = gapMidNext;
                          // Outer-Endpunkte (exakt auf outerR)
                          const ox1 = cx + outerR * Math.cos(startA);
                          const oy1 = cy + outerR * Math.sin(startA);
                          const ox2 = cx + outerR * Math.cos(endA);
                          const oy2 = cy + outerR * Math.sin(endA);
                          // Inner-Endpunkte: parallel zur Gap-Mid-Achse statt radial
                          const ix1u = ox1 - ringDiff * Math.cos(gapMidPrev);
                          const iy1u = oy1 - ringDiff * Math.sin(gapMidPrev);
                          const innerStartAngle = Math.atan2(iy1u - cy, ix1u - cx);
                          const ix1 = cx + innerR * Math.cos(innerStartAngle);
                          const iy1 = cy + innerR * Math.sin(innerStartAngle);
                          const ix2u = ox2 - ringDiff * Math.cos(gapMidNext);
                          const iy2u = oy2 - ringDiff * Math.sin(gapMidNext);
                          const innerEndAngle = Math.atan2(iy2u - cy, ix2u - cx);
                          const ix2 = cx + innerR * Math.cos(innerEndAngle);
                          const iy2 = cy + innerR * Math.sin(innerEndAngle);
                          const largeArc = segAngle > Math.PI ? 1 : 0;
                          const d = `M ${ox1} ${oy1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
                          return (
                            <path
                              key={i}
                              d={d}
                              fill="none"
                              stroke={s.color}
                              strokeWidth={outlineWidth}
                              strokeLinejoin="round"
                            />
                          );
                        })
                      )}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[34px] font-bold leading-none tracking-tight">{total}</span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Aufträge</span>
                    </div>
                  </div>
                  <div className="flex-1 w-full md:self-stretch flex flex-col">
                    <div className="space-y-2.5">
                      {segments.map((s) => {
                        const pct = total > 0 ? (s.count / total) * 100 : 0;
                        return (
                          <div
                            key={s.label}
                            className={`flex items-center gap-3 ${
                              s.count === 0 ? "opacity-40" : ""
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium truncate">{s.label}</span>
                                <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                                  <strong className="text-foreground">{s.count}</strong> · {pct.toFixed(0)}%
                                </span>
                              </div>
                              <div className="h-[3px] rounded-full bg-foreground/[0.05] overflow-hidden mt-1.5">
                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: s.color }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {entwurfCount > 0 && (
                      <div className="mt-auto pt-4 -ml-[7px]">
                        <button
                          type="button"
                          onClick={() => setFilterStatus("entwurf")}
                          className="inline-flex items-center gap-3 px-[7px] py-1 rounded-full text-[11px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-500/30 transition-colors"
                          title="Filter auf Entwürfe setzen"
                        >
                          <span className="w-2 h-2 rounded-full bg-purple-500 dark:bg-purple-400 shrink-0" />
                          {entwurfCount} {entwurfCount === 1 ? "Entwurf" : "Entwürfe"} · separat
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {entwurfCount > 0
                      ? "Aktuell nur Entwürfe — noch keine freigegebenen Aufträge."
                      : "Keine Aufträge vorhanden."}
                  </p>
                  {entwurfCount > 0 && (
                    <div className="flex justify-start">
                      <button
                        type="button"
                        onClick={() => setFilterStatus("entwurf")}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-500/30 transition-colors"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 dark:bg-purple-400" />
                        {entwurfCount} {entwurfCount === 1 ? "Entwurf" : "Entwürfe"} · separat
                      </button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
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
            <Card key={i} className="animate-pulse bg-white">
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
            <Card className="border-dashed bg-white">
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
                  <Button
                    onClick={() => {
                      setSearchNumber("");
                      setSearchTitle("");
                      setFilterStatus("all");
                      setFilterLocation("all");
                    }}
                    className="mt-5 bg-red-600 hover:bg-red-700 text-white"
                  >
                    Filter zurücksetzen
                  </Button>
                ) : (
                  <Link href="/auftraege/neu">
                    <Button className="mt-5 bg-red-600 hover:bg-red-700 text-white">
                      <Plus className="h-4 w-4 mr-2" />
                      Ersten Auftrag erstellen
                    </Button>
                  </Link>
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
            const noTermin = isActive && !hasAppointment;
            return (
            <Link key={job.id} href={`/auftraege/${job.id}`} className="block">
            <div className="flex items-stretch gap-2">
              {/* Linke Seite: Termin-Status */}
              <div className={`flex flex-col items-center justify-center w-10 shrink-0 rounded-xl border text-center ${noTermin ? "bg-amber-50 border-amber-300 dark:bg-amber-950 dark:border-amber-700" : "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"}`}>
                {noTermin ? (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                ) : (
                  <Calendar className="h-4 w-4 text-green-500" />
                )}
              </div>
              <Card className={`bg-white dark:bg-gray-900 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 cursor-pointer group flex-1 ${
                job.status === "entwurf" ? "border-dashed opacity-80" : ""
              }`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        {job.job_number && <span className="text-xs font-mono text-muted-foreground bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">INT-{job.job_number}</span>}
                        <h3 className="font-semibold truncate">{job.title}</h3>
                        {job.status !== "offen" && (
                          <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${JOB_STATUS[job.status].color}`}>
                            {JOB_STATUS[job.status].label}
                          </span>
                        )}
                        {job.priority === "dringend" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300">
                            <AlertCircle className="h-3 w-3" />
                            Dringend
                          </span>
                        )}
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
                      {noTermin && (
                        <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                          Kein Termin geplant{job.start_date ? ` — fällig bis ${new Date(job.start_date).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })}` : ""}
                        </p>
                      )}
                      {job.description && (
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-1">{job.description}</p>
                      )}
                    </div>
                    {/* Bearbeiten-Button — nur bei Entwürfen direkt aus der Liste.
                        Bei echten Aufträgen erfolgt das Bearbeiten über die Detail-Page. */}
                    {job.status === "entwurf" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          router.push(`/auftraege/${job.id}/bearbeiten`);
                        }}
                        className="shrink-0 p-2.5 rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
                        aria-label="Bearbeiten"
                        title="Entwurf bearbeiten"
                      >
                        <Pencil className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
