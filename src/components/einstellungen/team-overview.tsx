"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { JobNumber } from "@/components/job-number";
import type { Profile } from "@/types";
import { EinstellungenLoadingSkeleton } from "./loading-skeleton";

export function TeamOverview({ profiles }: { profiles: Profile[]; supabase: any }) {
  const [data, setData] = useState<Record<string, { jobs: any[]; appointments: any[]; hours: number; plannedHours?: number }>>({});
  const [filter, setFilter] = useState("monat");
  const [loading, setLoading] = useState(true);
  const [serverProfiles, setServerProfiles] = useState<Profile[]>(profiles);
  const [showArchive, setShowArchive] = useState(false);
  const [archivedJobs, setArchivedJobs] = useState<any[]>([]);

  useEffect(() => { loadOverview(); }, [filter]);

  async function loadOverview() {
    setLoading(true);
    try {
      const res = await fetch(`/api/team-overview?filter=${filter}`);
      const json = await res.json();
      if (json.profiles) setServerProfiles(json.profiles);
      if (json.data) setData(json.data);
    } catch (e) {
      console.error("Team overview error:", e);
    }

    // Archiv laden
    try {
      const archiveRes = await fetch("/api/team-overview?filter=archiv");
      const archiveJson = await archiveRes.json();
      if (archiveJson.archivedJobs) setArchivedJobs(archiveJson.archivedJobs);
    } catch {}

    setLoading(false);
  }

  if (loading) return <EinstellungenLoadingSkeleton />;

  return (
    <div className="space-y-6">
      {/* Filter */}
      <div className="flex gap-2">
        {[
          { key: "woche", label: "Diese Woche" },
          { key: "monat", label: "Dieser Monat" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.key ? "bg-red-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Archiv Toggle */}
      {archivedJobs.length > 0 && (
        <button
          onClick={() => setShowArchive(!showArchive)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showArchive ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
          Archiv ({archivedJobs.length})
        </button>
      )}

      {/* Archiv */}
      {showArchive && archivedJobs.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Abgeschlossene Aufträge</p>
          {archivedJobs.map((j: any) => (
            <Link key={j.id} href={`/auftraege/${j.id}`}>
              <Card className="bg-card border-gray-100 hover:shadow-sm transition-all opacity-70">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <JobNumber number={j.job_number} />
                    <span className="font-medium text-sm">{j.title}</span>
                    {j.customer?.name && <span className="text-xs text-muted-foreground">· {j.customer.name}</span>}
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${j.status === "abgeschlossen" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                    {j.status === "abgeschlossen" ? "Erledigt" : "Storniert"}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Pro Person */}
      {!showArchive && serverProfiles.map((p) => {
        const d = data[p.id] || { jobs: [], appointments: [], hours: 0 };
        return (
          <Card key={p.id} className="bg-card border-gray-100">
            <CardContent className="p-5">
              {/* Person Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white text-sm font-bold">
                    {p.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold">{p.full_name}</h3>
                    <p className="text-xs text-muted-foreground">{p.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{d.hours}h</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Gestempelt</p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-2.5 rounded-lg bg-green-50 text-center">
                  <p className="text-lg font-bold text-green-700">{d.appointments.length}</p>
                  <p className="text-[10px] text-green-600 font-medium">Termine</p>
                </div>
                <div className="p-2.5 rounded-lg bg-blue-50 text-center">
                  <p className="text-lg font-bold text-blue-700">{d.plannedHours || 0}h</p>
                  <p className="text-[10px] text-blue-600 font-medium">Geplant</p>
                </div>
                <div className="p-2.5 rounded-lg bg-amber-50 text-center">
                  <p className="text-lg font-bold text-amber-700">{d.hours}h</p>
                  <p className="text-[10px] text-amber-600 font-medium">Gestempelt</p>
                </div>
              </div>

              {/* Termine als Wochenansicht */}
              {d.appointments.length > 0 ? (() => {
                const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
                const fullDays = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
                const byDay: Record<string, any[]> = {};
                for (const a of d.appointments) {
                  const date = new Date(a.start_time);
                  const key = date.toLocaleDateString("de-CH", { weekday: "short", day: "2-digit", month: "2-digit" });
                  if (!byDay[key]) byDay[key] = [];
                  byDay[key].push(a);
                }
                const sortedDays = Object.entries(byDay).sort((a, b) => {
                  const dateA = new Date(a[1][0].start_time).getTime();
                  const dateB = new Date(b[1][0].start_time).getTime();
                  return dateA - dateB;
                });
                return (
                  <div className="space-y-2">
                    {sortedDays.map(([day, appts]) => {
                      const isToday = new Date(appts[0].start_time).toDateString() === new Date().toDateString();
                      return (
                        <div key={day} className={`rounded-xl border ${isToday ? "border-red-200 bg-red-50/30" : "border-gray-100"}`}>
                          <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${isToday ? "text-red-600" : "text-muted-foreground"} border-b ${isToday ? "border-red-100" : "border-gray-100"}`}>
                            {day}{isToday ? " · Heute" : ""}
                          </div>
                          <div className="divide-y divide-gray-50">
                            {appts.map((a: any, i: number) => (
                              <Link key={i} href={a.job_id ? `/auftraege/${a.job_id}` : "#"}>
                                <div className="flex items-center justify-between px-3 py-2 hover:bg-gray-50/50 transition-colors">
                                  <div className="min-w-0">
                                    <span className={`font-medium text-sm ${a.is_done ? "line-through text-muted-foreground" : ""}`}>{a.title}</span>
                                    {a.job?.title && <span className="text-xs text-blue-600 ml-2">→ {a.job.title}</span>}
                                  </div>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-3">
                                    {new Date(a.start_time).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}
                                    {a.end_time ? ` – ${new Date(a.end_time).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}` : ""}
                                  </span>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })() : d.hours === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">Keine Einsätze in diesem Zeitraum</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
