"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TimeEntry, Job } from "@/types";
import { Clock, Play, Square, Coffee } from "lucide-react";

export default function ZeiterfassungPage() {
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState("");
  const [elapsed, setElapsed] = useState("00:00:00");
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [activeRes, entriesRes, jobsRes] = await Promise.all([
      supabase.from("time_entries").select("*").eq("profile_id", user.id).is("clock_out", null).single(),
      supabase.from("time_entries").select("*, job:jobs(title)").eq("profile_id", user.id).not("clock_out", "is", null).order("clock_in", { ascending: false }).limit(20),
      supabase.from("jobs").select("id, title").in("status", ["offen", "geplant", "in_arbeit"]).order("title"),
    ]);

    if (activeRes.data) setActiveEntry(activeRes.data as TimeEntry);
    if (entriesRes.data) setEntries(entriesRes.data as unknown as TimeEntry[]);
    if (jobsRes.data) setJobs(jobsRes.data as unknown as Job[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!activeEntry) { setElapsed("00:00:00"); return; }
    const interval = setInterval(() => {
      const start = new Date(activeEntry.clock_in).getTime();
      const diff = Date.now() - start;
      const h = Math.floor(diff / 3600000).toString().padStart(2, "0");
      const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, "0");
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, "0");
      setElapsed(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeEntry]);

  async function clockIn() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("time_entries").insert({
      profile_id: user.id,
      job_id: selectedJob || null,
      clock_in: new Date().toISOString(),
    });
    loadData();
  }

  async function clockOut() {
    if (!activeEntry) return;
    await supabase.from("time_entries").update({ clock_out: new Date().toISOString() }).eq("id", activeEntry.id);
    setActiveEntry(null);
    loadData();
  }

  function formatDuration(clockIn: string, clockOut: string, breakMin: number) {
    const diff = new Date(clockOut).getTime() - new Date(clockIn).getTime() - breakMin * 60000;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m`;
  }

  function formatTime(date: string) {
    return new Date(date).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString("de-CH", { weekday: "short", day: "2-digit", month: "2-digit" });
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /></div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Zeiterfassung</h1>
        <p className="text-sm text-muted-foreground mt-1">Ein- und Ausstempeln</p>
      </div>

      {/* Clock In/Out */}
      <Card className={`bg-white border-2 ${activeEntry ? "border-green-200" : "border-gray-100"}`}>
        <CardContent className="p-8 text-center">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 ${activeEntry ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}>
            <Clock className="h-10 w-10" />
          </div>
          <div className="text-5xl font-mono font-bold tracking-wider mb-2">{elapsed}</div>
          <p className="text-sm text-muted-foreground mb-6">
            {activeEntry ? `Eingestempelt seit ${formatTime(activeEntry.clock_in)}` : "Nicht eingestempelt"}
          </p>

          {!activeEntry ? (
            <div className="space-y-4">
              <select value={selectedJob} onChange={(e) => setSelectedJob(e.target.value)} className="w-full max-w-sm mx-auto block h-9 px-3 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500/20">
                <option value="">Ohne Auftrag stempeln</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
              <Button onClick={clockIn} className="bg-green-600 hover:bg-green-700 text-white px-8 py-6 text-lg rounded-xl">
                <Play className="h-5 w-5 mr-2" />
                Einstempeln
              </Button>
            </div>
          ) : (
            <Button onClick={clockOut} className="bg-red-600 hover:bg-red-700 text-white px-8 py-6 text-lg rounded-xl">
              <Square className="h-5 w-5 mr-2" />
              Ausstempeln
            </Button>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Letzte Einträge</h2>
        {entries.length === 0 ? (
          <Card className="bg-white border-dashed">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Noch keine Zeiteinträge vorhanden.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <Card key={entry.id} className="bg-white">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-sm font-medium text-muted-foreground w-20">{formatDate(entry.clock_in)}</div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{formatTime(entry.clock_in)} – {entry.clock_out ? formatTime(entry.clock_out) : "..."}</span>
                        {entry.break_minutes > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Coffee className="h-3 w-3" />{entry.break_minutes}m</span>
                        )}
                      </div>
                      {(entry.job as unknown as { title: string })?.title && (
                        <p className="text-xs text-muted-foreground mt-0.5">{(entry.job as unknown as { title: string }).title}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-sm font-semibold">
                    {entry.clock_out ? formatDuration(entry.clock_in, entry.clock_out, entry.break_minutes) : "–"}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
