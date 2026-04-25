"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Inbox,
  Send,
  CheckCircle2,
  Zap,
  Archive,
  MapPin,
  ArrowRight,
} from "lucide-react";

type PipelineItem = {
  id: string;
  source: "rental_request" | "job";
  title: string;
  customer_name: string | null;
  location_name: string | null;
  date: string | null;
  href: string;
};

type Stage = {
  key: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  items: PipelineItem[];
  total: number;
};

export default function VeranstaltungenPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState<Stage[]>([]);

  useEffect(() => {
    loadPipeline();
  }, []);

  async function loadPipeline() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAhead = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Pull rental_requests (customer info via join)
    const { data: rentals } = await supabase
      .from("rental_requests")
      .select(
        "id, event_date, status, customer:customers(name), location:locations(name)"
      )
      .order("event_date", { ascending: true, nullsFirst: false });

    // Pull jobs (with customer + location joined)
    const { data: jobs } = await supabase
      .from("jobs")
      .select(
        "id, title, status, start_date, customer:customers(name), location:locations(name)"
      )
      .neq("is_deleted", true)
      .order("start_date", { ascending: true, nullsFirst: false });

    const newAnfrage: PipelineItem[] = [];
    const angebot: PipelineItem[] = [];
    const bestaetigt: PipelineItem[] = [];
    const aktiv: PipelineItem[] = [];
    const abgeschlossen: PipelineItem[] = [];

    for (const r of rentals ?? []) {
      const loc = Array.isArray(r.location) ? r.location[0] : r.location;
      const cust = Array.isArray(r.customer) ? r.customer[0] : r.customer;
      const item: PipelineItem = {
        id: r.id,
        source: "rental_request",
        title: loc?.name || "Vermietungs-Anfrage",
        customer_name: cust?.name ?? null,
        location_name: loc?.name || null,
        date: r.event_date,
        href: `/anfragen/${r.id}`,
      };
      if (r.status === "neu" || r.status === "konditionen_gesendet") {
        newAnfrage.push(item);
      } else if (
        r.status === "konditionen_bestaetigt" ||
        r.status === "angebot_gesendet" ||
        r.status === "in_bearbeitung"
      ) {
        angebot.push(item);
      } else if (r.status === "bestaetigt") {
        bestaetigt.push(item);
      }
    }

    for (const j of jobs ?? []) {
      const cust = Array.isArray(j.customer) ? j.customer[0] : j.customer;
      const loc = Array.isArray(j.location) ? j.location[0] : j.location;
      const item: PipelineItem = {
        id: j.id,
        source: "job",
        title: j.title,
        customer_name: cust?.name ?? null,
        location_name: loc?.name ?? null,
        date: j.start_date,
        href: `/auftraege/${j.id}`,
      };
      if (j.status === "offen" || j.status === "geplant") {
        const startsSoon =
          j.start_date && new Date(j.start_date) < weekAhead;
        if (startsSoon) {
          aktiv.push(item);
        } else {
          bestaetigt.push(item);
        }
      } else if (j.status === "in_arbeit") {
        aktiv.push(item);
      } else if (j.status === "abgeschlossen") {
        if (!j.start_date || new Date(j.start_date) >= monthAgo) {
          abgeschlossen.push(item);
        }
      }
    }

    setStages([
      {
        key: "neu",
        title: "Neue Anfragen",
        icon: Inbox,
        accent: "border-blue-500/30",
        items: newAnfrage.slice(0, 8),
        total: newAnfrage.length,
      },
      {
        key: "angebot",
        title: "Angebot offen",
        icon: Send,
        accent: "border-amber-500/30",
        items: angebot.slice(0, 8),
        total: angebot.length,
      },
      {
        key: "bestaetigt",
        title: "Bestätigt",
        icon: CheckCircle2,
        accent: "border-emerald-500/30",
        items: bestaetigt.slice(0, 8),
        total: bestaetigt.length,
      },
      {
        key: "aktiv",
        title: "Diese Woche",
        icon: Zap,
        accent: "border-red-500/40",
        items: aktiv.slice(0, 8),
        total: aktiv.length,
      },
      {
        key: "fertig",
        title: "Letzte 30 Tage",
        icon: Archive,
        accent: "border-zinc-500/30",
        items: abgeschlossen.slice(0, 8),
        total: abgeschlossen.length,
      },
    ]);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 rounded bg-muted animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-80 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          Pipeline-Übersicht
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Alle Veranstaltungen in einem Blick — von der Anfrage bis zum Abschluss.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {stages.map((stage) => {
          const Icon = stage.icon;
          return (
            <Card key={stage.key} className={`border-t-2 ${stage.accent}`}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {stage.title}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {stage.total}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stage.items.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Aktuell leer
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {stage.items.map((item) => (
                      <li key={`${item.source}-${item.id}`}>
                        <Link
                          href={item.href}
                          className="block rounded-lg border bg-background p-2.5 hover:bg-muted/40 transition group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">
                                {item.title}
                              </p>
                              {item.customer_name && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {item.customer_name}
                                </p>
                              )}
                              <div className="flex items-center gap-x-3 mt-1 text-[11px] text-muted-foreground">
                                {item.date && (
                                  <span>
                                    {new Date(item.date).toLocaleDateString(
                                      "de-CH",
                                      {
                                        day: "numeric",
                                        month: "short",
                                        year: "2-digit",
                                      }
                                    )}
                                  </span>
                                )}
                                {item.location_name && (
                                  <span className="inline-flex items-center gap-0.5 truncate">
                                    <MapPin className="h-3 w-3" />
                                    <span className="truncate">
                                      {item.location_name}
                                    </span>
                                  </span>
                                )}
                              </div>
                            </div>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 mt-0.5 shrink-0 group-hover:text-foreground transition" />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {stage.total > stage.items.length && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    +{stage.total - stage.items.length} weitere
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="rounded-xl border bg-muted/30 p-4 text-xs text-muted-foreground">
        <p>
          <strong className="text-foreground">Datenquelle:</strong> Diese Übersicht
          fasst Anfragen aus <code className="px-1 bg-background rounded">rental_requests</code> und
          bestätigte Events aus <code className="px-1 bg-background rounded">jobs</code> zusammen.
          Detail-Ansichten unverändert unter{" "}
          <Link href="/anfragen" className="underline">Anfragen-Eingang</Link>,{" "}
          <Link href="/auftraege" className="underline">Bestätigte Events</Link> und{" "}
          <Link href="/vertrieb" className="underline">Verkaufs-Details</Link>.
        </p>
      </div>
    </div>
  );
}
