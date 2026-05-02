"use client";

/**
 * Glocke oben in der Sidebar — zeigt ungelesene Notifications mit
 * roter Counter-Bubble. Click oeffnet ein Dropdown rechts unten mit
 * den letzten 50 Notifications, neueste zuerst. Click auf eine
 * Notification markiert sie als gelesen + navigiert zum Link.
 *
 * Realtime-Subscription auf der notifications-Tabelle haelt die Liste
 * live (auch wenn der User in einem anderen Tab eine Aktion macht
 * sieht er die Notification sofort).
 *
 * RLS sorgt automatisch dafuer dass jeder User nur seine eigenen sieht.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/types";

interface Props {
  /** Auf welcher Seite das Dropdown aufklappt. Default 'bottom' (unter
   *  der Glocke). 'top' wenn die Glocke unten in der Sidebar steht und
   *  das Dropdown nach OBEN aufklappen muss. */
  side?: "top" | "bottom";
}

export function NotificationsBell({ side = "bottom" }: Props = {}) {
  const supabase = createClient();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.is_read).length;

  async function load() {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setNotifications(data as Notification[]);
  }

  useEffect(() => {
    load();
    // Realtime: jede Aenderung an notifications loest reload aus.
    // RLS filtert automatisch auf eigene Rows, also kein Lecking.
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

  // Click ausserhalb schliesst das Dropdown.
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
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "gerade eben";
    if (diffMin < 60) return `vor ${diffMin}min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `vor ${diffH}h`;
    return d.toLocaleString("de-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

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
        <div className={`absolute right-0 w-[320px] max-h-[70vh] overflow-y-auto rounded-xl bg-card border border-border shadow-2xl z-50 text-foreground ${
          side === "top" ? "bottom-full mb-2" : "top-full mt-2"
        }`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-card z-10">
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
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">Keine Benachrichtigungen.</div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => clickNotification(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${!n.is_read ? "bg-blue-500/[0.04]" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${!n.is_read ? "bg-blue-500" : "bg-transparent"}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!n.is_read ? "font-semibold" : ""}`}>{n.title}</p>
                      {n.message && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        {formatTime(n.created_at)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
