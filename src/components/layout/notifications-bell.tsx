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
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  NOTIFICATION_META,
  ACCENT_CLASSES,
  timeBucket,
  TIME_BUCKET_LABEL,
} from "@/lib/notification-meta";
import type { Notification, NotificationType } from "@/types";
import { usePermissions } from "@/lib/use-permissions";

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
  const { role } = usePermissions();
  // Glocke ist fuer Techniker noch nicht freigeschaltet — Click zeigt Toast,
  // Dropdown bleibt zu, Counter-Bubble unsichtbar damit nichts triggert.
  const isLocked = role === "techniker";
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"alle" | "ungelesen">("alle");
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Position des Dropdowns berechnen — fixed zum Viewport, sodass es
  // aus der Sidebar (overflow:hidden + nur 260px breit) herausragen
  // kann nach rechts.
  useEffect(() => {
    if (!open) return;
    function update() {
      if (!buttonRef.current) return;
      const r = buttonRef.current.getBoundingClientRect();
      const dropdownWidth = 360;
      const margin = 8;
      // Standardposition: rechts vom Button (Sidebar-Glocke unten links).
      // Wenn das Dropdown so ueber den Viewport-Rand ginge: clamp.
      let left = r.right + margin;
      if (left + dropdownWidth > window.innerWidth - 16) {
        left = Math.max(16, window.innerWidth - dropdownWidth - 16);
      }
      // Vertikal: bottom-aligned mit dem Button (Dropdown-Bottom = Button-Bottom).
      // 'top' Variante: dropdown-bottom = button-bottom; sonst von oben.
      const top = side === "top"
        ? r.bottom - 8 // bottom = bei button-bottom; top wird via maxHeight bestimmt
        : r.bottom + margin;
      setPos({ top, left });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, side]);

  // Unread-Counter aus separater count-Query — vorher wurde aus den
  // 12 Preview-Items gezaehlt, was bei 13+ Ungelesenen immer "9+"
  // ergab und nach dem Lesen einzelner Items inkonsistent wurde.
  const [unread, setUnread] = useState(0);

  async function load() {
    const [{ data }, { count }] = await Promise.all([
      supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(PREVIEW_LIMIT),
      supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("is_read", false),
    ]);
    if (data) setNotifications(data as Notification[]);
    setUnread(count ?? 0);
  }

  useEffect(() => {
    load();
    // Reload bei Notification-Aenderung — Event kommt vom globalen Channel
    // im (app)/layout.tsx, kein eigener WebSocket mehr noetig.
    const handler = () => load();
    window.addEventListener("realtime:notifications", handler);
    return () => window.removeEventListener("realtime:notifications", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      const target = e.target as Node;
      const inButton = containerRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inButton && !inDropdown) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  async function markAsRead(id: string) {
    // Optimistic Update — Counter SOFORT runter, sonst zeigt die rote
    // Bubble noch Sekunden nach dem Click die alte Zahl bis Realtime
    // reinkommt. Bei Fehler: load() korrigiert.
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnread((prev) => Math.max(0, prev - 1));
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    if (error) load();
  }

  async function markAllAsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
    if (error) load();
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

  const dropdown = open && pos ? (
    <div
      ref={dropdownRef}
      style={{
        position: "fixed",
        top: side === "top" ? undefined : pos.top,
        bottom: side === "top" ? window.innerHeight - pos.top : undefined,
        left: pos.left,
        width: 360,
        maxHeight: "70vh",
      }}
      className="overflow-y-auto rounded-xl bg-card border border-border shadow-2xl z-[1200] text-foreground"
    >
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
  ) : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (isLocked) {
            toast.info("Diese Funktion ist noch in Bearbeitung.");
            return;
          }
          setOpen((o) => !o);
        }}
        className="relative p-2 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
        data-tooltip="Benachrichtigungen"
        aria-label="Benachrichtigungen"
      >
        <Bell className="h-5 w-5" />
        {!isLocked && unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {!isLocked && mounted && dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
