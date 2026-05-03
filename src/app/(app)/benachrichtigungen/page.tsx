"use client";

/**
 * Benachrichtigungen-Vollansicht — alle Notifications mit Filter,
 * Bulk-Aktionen und Pagination. Erreicht ueber den Footer-Link in
 * der Sidebar-Glocke.
 *
 * Filter: Tabs Alle/Ungelesen/Gelesen + Type-Filter-Dropdown.
 * Bulk: Mehrere markieren via Checkboxes → "Als gelesen markieren"
 *       oder "Loeschen". Plus pauschal "Aelter als 30 Tage loeschen".
 *
 * Layout 1:1 wie Glocke (Type-Icon + Titel + Subtitel + Zeit) plus
 * Checkbox-Spalte links und Datum rechts.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { SearchableSelect } from "@/components/searchable-select";
import { useConfirm } from "@/components/ui/use-confirm";
import { toast } from "sonner";
import { CheckSquare, Square, Trash2, Bell as BellIcon } from "lucide-react";
import {
  NOTIFICATION_META,
  ACCENT_CLASSES,
  timeBucket,
  TIME_BUCKET_LABEL,
} from "@/lib/notification-meta";
import type { Notification, NotificationType } from "@/types";

type FilterRead = "alle" | "ungelesen" | "gelesen";
type FilterType = "alle" | NotificationType;

export default function BenachrichtigungenPage() {
  const supabase = createClient();
  const router = useRouter();
  const { confirm, ConfirmModalElement } = useConfirm();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRead, setFilterRead] = useState<FilterRead>("alle");
  const [filterType, setFilterType] = useState<FilterType>("alle");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(500);
    if (filterRead === "ungelesen") q = q.eq("is_read", false);
    if (filterRead === "gelesen") q = q.eq("is_read", true);
    if (filterType !== "alle") q = q.eq("type", filterType);
    const { data } = await q;
    setNotifications((data as Notification[]) ?? []);
    setSelected(new Set());
    setLoading(false);
  }, [supabase, filterRead, filterType]);

  useEffect(() => { load(); }, [load]);

  // Realtime — bei jeder DB-Aenderung neu laden.
  useEffect(() => {
    const channel = supabase
      .channel("benachrichtigungen-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, load]);

  const grouped = useMemo(() => {
    const buckets: Record<string, Notification[]> = { heute: [], gestern: [], diese_woche: [], aelter: [] };
    for (const n of notifications) {
      buckets[timeBucket(n.created_at)].push(n);
    }
    return [
      { key: "heute", items: buckets.heute },
      { key: "gestern", items: buckets.gestern },
      { key: "diese_woche", items: buckets.diese_woche },
      { key: "aelter", items: buckets.aelter },
    ].filter((g) => g.items.length > 0);
  }, [notifications]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === notifications.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(notifications.map((n) => n.id)));
    }
  }

  async function markSelectedRead() {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    await supabase.from("notifications").update({ is_read: true }).in("id", ids);
    toast.success(`${ids.length} als gelesen markiert`);
    load();
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    const ok = await confirm({
      title: "Auswahl löschen?",
      message: `${selected.size} Benachrichtigung${selected.size === 1 ? "" : "en"} unwiderruflich entfernen.`,
      confirmLabel: "Löschen",
      variant: "red",
    });
    if (!ok) return;
    const ids = Array.from(selected);
    await supabase.from("notifications").delete().in("id", ids);
    toast.success(`${ids.length} gelöscht`);
    load();
  }

  async function deleteOlderThan30() {
    const ok = await confirm({
      title: "Älter als 30 Tage löschen?",
      message: "Alle Benachrichtigungen die älter als 30 Tage sind werden unwiderruflich entfernt.",
      confirmLabel: "Aufräumen",
      variant: "red",
    });
    if (!ok) return;
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error, count } = await supabase
      .from("notifications")
      .delete({ count: "exact" })
      .lt("created_at", cutoff);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${count ?? 0} alte Einträge entfernt`);
    load();
  }

  async function markAllRead() {
    await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
    toast.success("Alle als gelesen markiert");
    load();
  }

  async function clickNotification(n: Notification) {
    if (!n.is_read) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
    }
    if (n.link) router.push(n.link);
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString("de-CH", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  }

  const allSelected = selected.size > 0 && selected.size === notifications.length;
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 min-h-9">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Benachrichtigungen</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Alle Aktivitäten zu deinen Aufträgen, Tickets und Stempel-Anfragen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button type="button" onClick={markAllRead} className="kasten kasten-muted">
              Alle gelesen
            </button>
          )}
          <button type="button" onClick={deleteOlderThan30} className="kasten kasten-red">
            <Trash2 className="h-3.5 w-3.5" />Älter als 30 Tage
          </button>
        </div>
      </div>

      {/* Filter-Bar */}
      <div className="flex flex-wrap gap-2">
        {(["alle", "ungelesen", "gelesen"] as FilterRead[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilterRead(f)}
            className={filterRead === f ? "kasten-active" : "kasten-toggle-off"}
          >
            {f === "alle" ? "Alle" : f === "ungelesen" ? "Ungelesen" : "Gelesen"}
          </button>
        ))}
        <div className="w-full sm:w-56 ml-auto">
          <SearchableSelect
            value={filterType}
            onChange={(v) => setFilterType(v as FilterType)}
            items={[
              { id: "alle", label: "Alle Typen" },
              { id: "ticket_new", label: NOTIFICATION_META.ticket_new.label },
              { id: "ticket_done", label: NOTIFICATION_META.ticket_done.label },
              { id: "ticket_rejected", label: NOTIFICATION_META.ticket_rejected.label },
              { id: "system", label: NOTIFICATION_META.system.label },
            ]}
            searchable={false}
            clearable={false}
            active={filterType !== "alle"}
          />
        </div>
      </div>

      {/* Bulk-Bar — nur bei Auswahl */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground/[0.04] border border-border">
          <button type="button" onClick={toggleAll} className="text-muted-foreground hover:text-foreground">
            {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </button>
          <span className="text-sm font-medium">{selected.size} ausgewählt</span>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={markSelectedRead} className="kasten kasten-muted">
              Als gelesen markieren
            </button>
            <button type="button" onClick={deleteSelected} className="kasten kasten-red">
              <Trash2 className="h-3.5 w-3.5" />Löschen
            </button>
          </div>
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Card key={i} className="animate-pulse bg-card"><CardContent className="p-4 h-12" /></Card>)}</div>
      ) : notifications.length === 0 ? (
        <Card className="bg-card border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <BellIcon className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg">Keine Benachrichtigungen</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {filterRead !== "alle" || filterType !== "alle"
                ? "Mit den aktuellen Filtern wurde nichts gefunden."
                : "Du bist auf dem aktuellen Stand."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.key} className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70 px-1">
                {TIME_BUCKET_LABEL[group.key as keyof typeof TIME_BUCKET_LABEL]}
              </p>
              <div className="space-y-1.5">
                {group.items.map((n) => {
                  const meta = NOTIFICATION_META[(n.type as NotificationType) ?? "system"] ?? NOTIFICATION_META.system;
                  const Icon = meta.icon;
                  const isSelected = selected.has(n.id);
                  return (
                    <Card key={n.id} className={`bg-card transition-colors ${!n.is_read ? "border-blue-500/30" : ""} ${isSelected ? "bg-foreground/[0.05]" : ""}`}>
                      <CardContent className="px-4 py-2.5 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => toggleOne(n.id)}
                          className="text-muted-foreground/50 hover:text-foreground shrink-0"
                          aria-label={isSelected ? "Auswahl entfernen" : "Auswählen"}
                        >
                          {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                        </button>
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${ACCENT_CLASSES[meta.accent]}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <button
                          type="button"
                          onClick={() => clickNotification(n)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <p className={`text-sm truncate ${!n.is_read ? "font-semibold" : ""}`}>{n.title}</p>
                            {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />}
                          </div>
                          {n.message && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{n.message}</p>
                          )}
                        </button>
                        <span className="text-[11px] text-muted-foreground/70 shrink-0 hidden sm:inline">{formatTime(n.created_at)}</span>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {ConfirmModalElement}
    </div>
  );
}
