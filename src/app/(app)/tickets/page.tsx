"use client";

/**
 * Tickets-Listenseite.
 *
 * Vier Typen (it, beleg, stempel_aenderung, material), drei Status
 * (offen, erledigt, abgelehnt). RLS sortiert: Mitarbeiter sehen ihre
 * eigenen + die ihnen zugewiesenen, Admins sehen alles.
 *
 * Layout 1:1 wie /auftraege /todos: Header + Filter-Bar + Cards.
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/searchable-select";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";
import {
  Plus, Search, Ticket as TicketIcon, Wrench, Receipt, Clock, Package,
} from "lucide-react";
import type { TicketWithRelations, TicketType, TicketStatus } from "@/types";

type FilterStatus = "alle" | TicketStatus;
type FilterType = "alle" | TicketType;

// Tickets gelten als 'archiviert' wenn sie erledigt/abgelehnt sind UND
// das vor mehr als 14 Tagen passiert ist. Nur dann werden sie aus der
// aktiven Liste ausgeblendet.
const ARCHIVE_AFTER_DAYS = 14;
function isArchived(t: { status: TicketStatus; resolved_at: string | null }): boolean {
  if (t.status === "offen") return false;
  if (!t.resolved_at) return false;
  const ms = Date.now() - new Date(t.resolved_at).getTime();
  return ms > ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

const TYPE_META: Record<TicketType, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  it:               { label: "IT-Problem",        icon: Wrench,  color: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/15" },
  beleg:            { label: "Beleg",              icon: Receipt, color: "text-amber-600  dark:text-amber-400  bg-amber-50  dark:bg-amber-500/15"  },
  stempel_aenderung:{ label: "Stempel-Änderung",  icon: Clock,   color: "text-blue-600   dark:text-blue-400   bg-blue-50   dark:bg-blue-500/15"   },
  material:         { label: "Material",          icon: Package, color: "text-red-600    dark:text-red-400    bg-red-50    dark:bg-red-500/15"    },
};

const STATUS_META: Record<TicketStatus, { label: string; classes: string }> = {
  offen:     { label: "Offen",     classes: "bg-blue-100  text-blue-700  dark:bg-blue-500/20  dark:text-blue-300"  },
  erledigt:  { label: "Erledigt",  classes: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300" },
  abgelehnt: { label: "Abgelehnt", classes: "bg-red-100   text-red-700   dark:bg-red-500/20   dark:text-red-300"   },
};

export default function TicketsPage() {
  const supabase = createClient();
  const [tickets, setTickets] = useState<TicketWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("offen");
  const [filterType, setFilterType] = useState<FilterType>("alle");
  const [showNew, setShowNew] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showOnlyMine, setShowOnlyMine] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Admin-Check + eigene User-ID laden — bestimmt Filter-Optionen.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      setIsAdmin(profile?.role === "admin");
    })();
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("tickets")
      .select(`
        *,
        creator:profiles!created_by(full_name),
        assignee:profiles!assigned_to(full_name),
        resolver:profiles!resolved_by(full_name),
        attachments:ticket_attachments(id, filename, storage_path, mime_type)
      `)
      .order("created_at", { ascending: false });

    if (filterStatus !== "alle") q = q.eq("status", filterStatus);
    if (filterType !== "alle") q = q.eq("type", filterType);
    if (showOnlyMine && currentUserId) q = q.eq("created_by", currentUserId);

    const term = search.trim();
    if (term.length > 0) {
      const like = `%${term}%`;
      q = q.or(`title.ilike.${like},description.ilike.${like}`);
    }

    const { data } = await q;
    const all = (data as unknown as TicketWithRelations[]) ?? [];
    // Archiv-Toggle: zeige entweder NUR archivierte (älter als 14 Tage
    // erledigt/abgelehnt) oder NUR die aktiven (alles andere).
    const filtered = all.filter((t) => showArchive ? isArchived(t) : !isArchived(t));
    setTickets(filtered);
    setLoading(false);
  }, [supabase, filterStatus, filterType, showOnlyMine, showArchive, currentUserId, search]);

  useEffect(() => {
    const t = setTimeout(() => { load(); }, 200);
    return () => clearTimeout(t);
  }, [load]);

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "2-digit" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 min-h-9">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tickets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            IT-Probleme · Belege · Stempel-Änderungen · Material-Anfragen
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowArchive((v) => !v)}
            className={showArchive ? "kasten-active" : "kasten-toggle-off"}
          >
            Archiv
          </button>
          <button type="button" onClick={() => setShowNew(true)} className="kasten kasten-red">
            <Plus className="h-3.5 w-3.5" />Neues Ticket
          </button>
        </div>
      </div>

      {/* Filter-Bar */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Titel oder Beschreibung…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-card"
          />
        </div>
        <div className="w-full sm:w-44">
          <SearchableSelect
            value={filterStatus}
            onChange={(v) => setFilterStatus(v as FilterStatus)}
            items={[
              { id: "offen", label: "Offen" },
              { id: "erledigt", label: "Erledigt" },
              { id: "abgelehnt", label: "Abgelehnt" },
              { id: "alle", label: "Alle Status" },
            ]}
            searchable={false}
            clearable={false}
            active={filterStatus !== "offen"}
          />
        </div>
        <div className="w-full sm:w-44">
          <SearchableSelect
            value={filterType}
            onChange={(v) => setFilterType(v as FilterType)}
            items={[
              { id: "alle", label: "Alle Typen" },
              { id: "it", label: "IT-Problem" },
              { id: "beleg", label: "Beleg" },
              { id: "stempel_aenderung", label: "Stempel-Änderung" },
              { id: "material", label: "Material" },
            ]}
            searchable={false}
            clearable={false}
            active={filterType !== "alle"}
          />
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowOnlyMine((v) => !v)}
            className={showOnlyMine ? "kasten-active" : "kasten-toggle-off"}
          >
            Nur meine
          </button>
        )}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Card key={i} className="animate-pulse bg-card"><CardContent className="p-4 h-20" /></Card>)}</div>
      ) : tickets.length === 0 ? (
        <Card className="bg-card border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <TicketIcon className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg">Keine Tickets</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search || filterType !== "alle" || filterStatus !== "alle"
                ? "Mit den aktuellen Filtern wurde nichts gefunden."
                : "Erstelle dein erstes Ticket über den Knopf oben."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => {
            const typeMeta = TYPE_META[t.type];
            const Icon = typeMeta.icon;
            return (
              <Link key={t.id} href={`/tickets/${t.id}`} className="block">
                <Card className="card-hover bg-card">
                  <CardContent className="px-4 py-1.5 flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${typeMeta.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[11px] font-semibold text-muted-foreground shrink-0">T-{t.ticket_number}</span>
                        <span className="font-medium text-sm truncate">{t.title}</span>
                        <span className={`inline-flex items-center px-1.5 py-0 text-[10px] font-medium rounded-full shrink-0 ${STATUS_META[t.status].classes}`}>
                          {STATUS_META[t.status].label}
                        </span>
                        {t.priority === "dringend" && (
                          <span className="inline-flex items-center px-1.5 py-0 text-[10px] font-semibold rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 shrink-0">
                            Dringend
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                        <span>{typeMeta.label}</span>
                        <span>·</span>
                        <span>{t.creator?.full_name ?? "—"}</span>
                        <span>·</span>
                        <span>{formatDate(t.created_at)}</span>
                        {t.attachments.length > 0 && (
                          <>
                            <span>·</span>
                            <span>{t.attachments.length} Anhang{t.attachments.length === 1 ? "" : "e"}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <NewTicketModal open={showNew} onClose={() => setShowNew(false)} onCreated={load} />
    </div>
  );
}
