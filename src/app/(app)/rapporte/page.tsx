"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ServiceReport } from "@/types";
import Link from "next/link";
import { Plus, FileText, Calendar, User, Download } from "lucide-react";

export default function RapportePage() {
  const [reports, setReports] = useState<ServiceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("service_reports")
        .select("*, job:jobs(title, job_number, customer:customers(name)), creator:profiles!created_by(full_name)")
        .order("created_at", { ascending: false });
      if (data) setReports(data as unknown as ServiceReport[]);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Einsatzrapporte</h1>
          <p className="text-sm text-muted-foreground mt-1">{reports.length} Rapporte</p>
        </div>
        <Link href="/rapporte/neu">
          <Button className="bg-red-600 hover:bg-red-700 text-white shadow-sm">
            <Plus className="h-4 w-4 mr-2" />Neuer Rapport
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2].map((i) => <Card key={i} className="animate-pulse bg-white"><CardContent className="p-5"><div className="h-5 bg-gray-200 rounded w-1/2 mb-3" /></CardContent></Card>)}</div>
      ) : reports.length === 0 ? (
        <Card className="border-dashed bg-white">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><FileText className="h-7 w-7 text-gray-400" /></div>
            <h3 className="font-semibold text-lg">Noch keine Rapporte</h3>
            <p className="text-sm text-muted-foreground mt-1">Erstelle deinen ersten Einsatzrapport.</p>
            <Link href="/rapporte/neu"><Button className="mt-5 bg-red-600 hover:bg-red-700 text-white"><Plus className="h-4 w-4 mr-2" />Ersten Rapport erstellen</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const job = r.job as unknown as { title: string; job_number: number | null; customer: { name: string } } | undefined;
            const creator = (r as unknown as { creator: { full_name: string } }).creator;
            return (
              <Card key={r.id} className="bg-white hover:shadow-md transition-all">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        {job?.job_number && <span className="text-xs font-mono text-muted-foreground bg-gray-100 px-1.5 py-0.5 rounded">INT-{job.job_number}</span>}
                      <h3 className="font-semibold">{job?.title || "Ohne Auftrag"}</h3>
                        <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${r.status === "abgeschlossen" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {r.status === "abgeschlossen" ? "Abgeschlossen" : "Entwurf"}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{new Date(r.report_date).toLocaleDateString("de-CH")}</span>
                        {creator && <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{creator.full_name}</span>}
                        {job?.customer?.name && <span>{job.customer.name}</span>}
                      </div>
                      {r.work_description && <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{r.work_description}</p>}
                    </div>
                    <a href={`/api/reports/${r.id}/pdf`} download={`Rapport_${r.report_date}.pdf`}>
                      <Button size="sm" variant="outline" className="shrink-0">
                        <Download className="h-4 w-4 mr-1" />PDF
                      </Button>
                    </a>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
