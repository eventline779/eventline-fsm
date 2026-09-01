"use client";

/**
 * Auftrag-Detail: Tab "Rapport & Abschluss".
 *
 * Zeigt bestehende Einsatzrapporte (PDF-Download) und — fuer Admins —
 * die Stundenkontrolle (Stempel- vs Rapport-Stunden pro Mitarbeiter).
 * Das Erstellen eines neuen Rapports (Signatur-Flow) laeuft ueber den
 * "Abschliessen"-Button im Sticky-Header + `RapportFormModal`.
 */

import { FileText, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { HoursAuditCard } from "@/components/auftrag/hours-audit-card";
import type { ServiceReport } from "@/types";

type ReportWithCreator = ServiceReport & {
  creator: { full_name: string } | null;
};

type AuditRow = {
  user_id: string;
  user_name: string;
  stempel_minutes: number;
  rapport_minutes: number;
  diff_minutes: number;
};

type Props = {
  reports: ReportWithCreator[];
  isAdmin: boolean;
  audit: AuditRow[];
};

export function RapportTab({ reports, isAdmin, audit }: Props) {
  return (
    <div className="space-y-6">
      {/* Einsatzrapporte */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Einsatzrapporte ({reports.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Noch keine Rapporte"
              description={"Rapport wird beim „Abschliessen“-Button im Sticky-Header erstellt."}
            />
          ) : (
            <div className="space-y-2">
              {reports.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      Rapport vom{" "}
                      {new Date(r.report_date).toLocaleDateString("de-CH", {
                        timeZone: "Europe/Zurich",
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.creator?.full_name} · {r.status === "abgeschlossen" ? "Abgeschlossen" : "Entwurf"}
                    </p>
                  </div>
                  <a href={`/api/reports/${r.id}/pdf`} download={`Rapport_${r.report_date}.pdf`}>
                    <Button size="sm" variant="outline">
                      <Download className="h-4 w-4 mr-1" />
                      PDF
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stundenkontrolle — Admin-only, via SECURITY-DEFINER-RPC geladen */}
      {isAdmin && audit.length > 0 && <HoursAuditCard rows={audit} />}
    </div>
  );
}
