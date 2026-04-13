"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { JOB_STATUS, JOB_PRIORITY } from "@/lib/constants";
import type { Job, JobStatus, Profile } from "@/types";
import Link from "next/link";
import {
  Plus,
  Search,
  ClipboardList,
  Calendar,
  MapPin,
  User,
  Users,
  AlertTriangle,
} from "lucide-react";

export default function AuftraegePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<JobStatus | "all">("all");
  const [filterPerson, setFilterPerson] = useState("all");
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => { loadJobs(); }, []);

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

  const filtered = jobs.filter((j) => {
    const matchesSearch = j.title.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === "all" || j.status === filterStatus;
    const matchesPerson = filterPerson === "all" || j.project_lead_id === filterPerson ||
      (j.assignments as unknown as { profile_id: string }[])?.some((a) => a.profile_id === filterPerson);
    return matchesSearch && matchesStatus && matchesPerson;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Aufträge</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {jobs.length} {jobs.length === 1 ? "Auftrag" : "Aufträge"} gesamt
          </p>
        </div>
        <Link href="/auftraege/neu">
          <Button className="bg-red-600 hover:bg-red-700 text-white shadow-sm">
            <Plus className="h-4 w-4 mr-2" />
            Neuer Auftrag
          </Button>
        </Link>
      </div>

      {/* Suche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Aufträge suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-white border-gray-200"
        />
      </div>

      {/* Filter: Personen */}
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Personen</p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterPerson("all")}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
              filterPerson === "all"
                ? "bg-black text-white border-black"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            <Users className="h-3.5 w-3.5" />Alle
          </button>
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => setFilterPerson(p.id === filterPerson ? "all" : p.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                filterPerson === p.id
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${filterPerson === p.id ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"}`}>
                {p.full_name.charAt(0)}
              </div>
              {p.full_name.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Filter: Status */}
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Status</p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterStatus("all")}
            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
              filterStatus === "all"
                ? "bg-black text-white border-black"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            Alle
          </button>
          {(Object.keys(JOB_STATUS) as JobStatus[]).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                filterStatus === status
                  ? "bg-black text-white border-black"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {JOB_STATUS[status].label}
            </button>
          ))}
        </div>
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
        <Card className="border-dashed bg-white">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <ClipboardList className="h-7 w-7 text-gray-400" />
            </div>
            <h3 className="font-semibold text-gray-900 text-lg">
              {search || filterStatus !== "all" ? "Keine Ergebnisse" : "Noch keine Aufträge"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search || filterStatus !== "all"
                ? "Versuche andere Filter."
                : "Erstelle deinen ersten Auftrag."}
            </p>
            {!search && filterStatus === "all" && (
              <Link href="/auftraege/neu">
                <Button className="mt-5 bg-red-600 hover:bg-red-700 text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Ersten Auftrag erstellen
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((job) => {
            const appointments = (job as any).appointments as { id: string; start_time: string }[] | null;
            const hasAppointment = appointments && appointments.length > 0;
            const isActive = !["abgeschlossen", "storniert"].includes(job.status);
            const noTermin = isActive && !hasAppointment;
            return (
            <Link key={job.id} href={`/auftraege/${job.id}`}>
            <div className="flex items-stretch gap-2">
              {/* Linke Seite: Termin-Status */}
              <div className={`flex flex-col items-center justify-center w-10 shrink-0 rounded-xl border text-center ${noTermin ? "bg-amber-50 border-amber-300 dark:bg-amber-950 dark:border-amber-700" : "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"}`}>
                {noTermin ? (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                ) : (
                  <Calendar className="h-4 w-4 text-green-500" />
                )}
              </div>
              <Card className="bg-white dark:bg-gray-900 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 cursor-pointer group flex-1">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        {job.job_number && <span className="text-xs font-mono text-muted-foreground bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">INT-{job.job_number}</span>}
                        <h3 className="font-semibold truncate">{job.title}</h3>
                        <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${JOB_STATUS[job.status].color}`}>
                          {JOB_STATUS[job.status].label}
                        </span>
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${JOB_PRIORITY[job.priority].color}`}>
                          {JOB_PRIORITY[job.priority].label}
                        </span>
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
                            {new Date(job.start_date).toLocaleDateString("de-CH")}
                          </span>
                        )}
                      </div>
                      {noTermin && (
                        <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                          Kein Termin geplant{job.start_date ? ` — fällig bis ${new Date(job.start_date).toLocaleDateString("de-CH")}` : ""}
                        </p>
                      )}
                      {job.description && (
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-1">{job.description}</p>
                      )}
                    </div>
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
