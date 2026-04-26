"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { REQUEST_STEPS } from "@/lib/constants";
import type { Job } from "@/types";
import Link from "next/link";
import { Plus, Search, Inbox, Calendar, MapPin, Users } from "lucide-react";
import { JobNumber } from "@/components/job-number";
import { RequestStepTracker } from "@/components/request-step-tracker";

export default function AnfragenPage() {
  const [requests, setRequests] = useState<Job[]>([]);
  const [search, setSearch] = useState("");
  const [filterStep, setFilterStep] = useState<number | "all">("all");
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadRequests();
    const handler = () => loadRequests();
    window.addEventListener("jobs:invalidate", handler);
    const interval = setInterval(loadRequests, 10000);
    return () => {
      window.removeEventListener("jobs:invalidate", handler);
      clearInterval(interval);
    };
  }, []);

  async function loadRequests() {
    const { data } = await supabase
      .from("jobs")
      .select("*, customer:customers(name), location:locations(name)")
      .eq("status", "anfrage")
      .neq("is_deleted", true)
      .order("created_at", { ascending: false });
    if (data) setRequests(data as unknown as Job[]);
    setLoading(false);
  }

  const filtered = requests.filter((r) => {
    const name = (r.customer as unknown as { name: string })?.name || "";
    const matchesSearch = search.trim() === "" ||
      name.toLowerCase().includes(search.toLowerCase()) ||
      (r.title?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (r.event_type?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesStep = filterStep === "all" || r.request_step === filterStep;
    return matchesSearch && matchesStep;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Vermietungsanfragen</h1>
        <Link href="/anfragen/neu">
          <Button className="bg-red-600 hover:bg-red-700 text-white shadow-sm">
            <Plus className="h-4 w-4 mr-2" />
            Neue Anfrage
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Kunde, Titel, Veranstaltung suchen…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterStep("all")}
            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${filterStep === "all" ? "bg-foreground/[0.08] border-foreground/40 font-semibold" : "border-border text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"}`}
          >
            Alle
          </button>
          {REQUEST_STEPS.map((s) => (
            <button
              key={s.step}
              onClick={() => setFilterStep(s.step)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${filterStep === s.step ? "bg-foreground/[0.08] border-foreground/40 font-semibold" : "border-border text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"}`}
            >
              {s.step}. {s.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <Card key={i} className="animate-pulse bg-card"><CardContent className="p-5"><div className="h-5 bg-gray-200 rounded w-1/2 mb-3" /><div className="h-4 bg-gray-100 rounded w-1/3" /></CardContent></Card>)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed bg-card">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-foreground/[0.06] flex items-center justify-center mb-4"><Inbox className="h-7 w-7 text-muted-foreground" /></div>
            <h3 className="font-semibold text-lg">{search || filterStep !== "all" ? "Keine Ergebnisse mit diesen Filtern" : "Noch keine Vermietungsanfragen"}</h3>
            <p className="text-sm text-muted-foreground mt-1">{search || filterStep !== "all" ? "Versuche andere Filter." : "Erstelle die erste Anfrage."}</p>
            {!search && filterStep === "all" && <Link href="/anfragen/neu"><Button className="mt-5 bg-red-600 hover:bg-red-700 text-white"><Plus className="h-4 w-4 mr-2" />Erste Anfrage erstellen</Button></Link>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => {
            const customerName = (req.customer as unknown as { name: string })?.name;
            const locationName = (req.location as unknown as { name: string })?.name;
            const step = req.request_step ?? 1;
            return (
              <Link key={req.id} href={`/anfragen/${req.id}`} className="block">
                <Card className="bg-card hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 cursor-pointer">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <JobNumber number={req.job_number} />
                          <h3 className="font-semibold truncate">{req.title || "Vermietungsanfrage"}</h3>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                          {customerName && <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{customerName}</span>}
                          {locationName && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{locationName}</span>}
                          {req.start_date && <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{new Date(req.start_date).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })}</span>}
                          {req.guest_count && <span className="flex items-center gap-1.5">{req.guest_count} Pers.</span>}
                        </div>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-foreground/[0.06]">
                      <RequestStepTracker currentStep={step} size="sm" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
