"use client";

/**
 * Glocke oben in der Sidebar — zeigt ungelesene Notifications mit
 * roter Counter-Bubble. Click oeffnet ein Dropdown mit:
 *   - Header: Tabs 'Alle | Ungelesen', 'Alle gelesen'-Aktion
 *   - Body: Notifications gruppiert nach Zeit-Bucket (Heute/Gestern/
 *     Diese Woche/Aelter), jede mit Type-Icon links + Titel/Subtitel
 *   - Footer: Link auf /benachrichtigungen fuer Vollansicht
 *
 * Realtime-Subscription auf der notifications-Tabelle haelt die Liste
 * live. RLS sorgt automatisch dafuer dass jeder User nur seine eigenen
 * Notifications sieht.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  NOTIFICATION_META,
  ACCENT_CLASSES,
  timeBucket,
  TIME_BUCKET_LABEL,
} from "@/lib/notification-meta";
import type { Notification, NotificationType } from "@/types";

interface Props {
  /** Auf welcher Seite das Dropdown aufklappt. Default 'bottom' (unter
   *  der Glocke). 'top' wenn die Glocke unten in der Sidebar steht und
   *  das Dropdown nach OBEN aufklappen muss. */
  side?: "top" | "bottom";
}

const PREVIEW_LIMIT = 12;

export function NotificationsBell({ side = "bottom" }: Props = {}) {
  const supabase = createClient();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"alle" | "ungelesen">("alle");
  const containerRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.is_read).length;

  async function load() {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PREVIEW_LIMIT);
    if (data) setNotifications(data as Notification[]);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("notifications-bell")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  async function markAsRead(id: string) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }

  async function markAllAsRead() {
    await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  async function clickNotification(n: Notification) {
    if (!n.is_read) markAsRead(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return "gerade eben";
    if (diffMin < 60) return `vor ${diffMin}min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `vor ${diffH}h`;
    return d.toLocaleString("de-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  // Filter + Gruppierung — gruppiert nach Zeit-Bucket damit's übersichtlich ist.
  const grouped = useMemo(() => {
    const filtered = filter === "ungelesen" ? notifications.filter((n) => !n.is_read) : notifications;
    const buckets: Record<string, Notification[]> = { heute: [], gestern: [], diese_woche: [], aelter: [] };
    for (const n of filtered) {
      buckets[timeBucket(n.created_at)].push(n);
    }
    return [
      { key: "heute", items: buckets.heute },
      { key: "gestern", items: buckets.gestern },
      { key: "diese_woche", items: buckets.diese_woche },
      { key: "aelter", items: buckets.aelter },
    ].filter((g) => g.items.length > 0);
  }, [notifications, filter]);

  const totalShown = grouped.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
        data-tooltip="Benachrichtigungen"
        aria-label="Benachrichtigungen"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute right-0 w-[360px] max-h-[70vh] overflow-y-auto rounded-xl bg-card border border-border shadow-2xl z-50 text-foreground ${
          side === "top" ? "bottom-full mb-2" : "top-full mt-2"
        }`}>
          {/* Header — Tabs + Aktionen, sticky damit beim Scrollen sichtbar bleibt */}
          <div className="sticky top-0 bg-card border-b border-border z-10">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <p className="text-sm font-semibold">Benachrichtigungen</p>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Alle gelesen
                </button>
              )}
            </div>
            <div className="flex gap-1 px-4 pb-2">
              <button
                type="button"
                onClick={() => setFilter("alle")}
                className={`text-[11px] font-medium px-2 py-1 rounded-md transition-colors ${
                  filter === "alle"
                    ? "bg-foreground/[0.08] text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Alle
              </button>
              <button
                type="button"
                onClick={() => setFilter("ungelesen")}
                className={`text-[11px] font-medium px-2 py-1 rounded-md transition-colors ${
                  filter === "ungelesen"
                    ? "bg-foreground/[0.08] text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Ungelesen{unread > 0 ? ` (${unread})` : ""}
              </button>
            </div>
          </div>

          {/* Body — gruppiert nach Zeit */}
          {totalShown === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              {filter === "ungelesen" ? "Alle gelesen — nichts mehr offen." : "Keine Benachrichtigungen."}
            </div>
          ) : (
            <div>
              {grouped.map((group) => (
                <div key={group.key}>
                  <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70">
                    {TIME_BUCKET_LABEL[group.key as keyof typeof TIME_BUCKET_LABEL]}
                  </div>
                  <div className="divide-y divide-border">
                    {group.items.map((n) => {
                      const meta = NOTIFICATION_META[(n.type as NotificationType) ?? "system"] ?? NOTIFICATION_META.system;
                      const Icon = meta.icon;
                      return (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => clickNotification(n)}
                          className={`w-full text-left px-4 py-2.5 hover:bg-muted/40 transition-colors flex items-start gap-3 ${
                            !n.is_read ? "bg-blue-500/[0.04]" : ""
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${ACCENT_CLASSES[meta.accent]}`}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2">
                              <p className={`text-sm truncate ${!n.is_read ? "font-semibold" : ""}`}>{n.title}</p>
                              {!n.is_read && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />}
                            </div>
                            {n.message && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                            )}
                            <p className="text-[10px] text-muted-foreground/70 mt-1">{formatTime(n.created_at)}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer — Link zur Vollansicht */}
          <div className="sticky bottom-0 bg-card border-t border-border">
            <Link
              href="/benachrichtigungen"
              onClick={() => setOpen(false)}
              className="block w-full text-center text-[11px] font-medium text-muted-foreground hover:text-foreground py-2.5 transition-colors"
            >
              Alle Benachrichtigungen ansehen →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
