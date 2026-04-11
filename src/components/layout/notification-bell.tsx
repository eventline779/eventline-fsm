"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Bell, X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface Notification {
  id: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [lastCount, setLastCount] = useState(0);
  const supabase = createClient();

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 10000);
    return () => clearInterval(interval);
  }, []);

  // Toast + Browser notification when new ones arrive
  useEffect(() => {
    if (unreadCount > lastCount && lastCount >= 0 && notifications.length > 0) {
      const newest = notifications.find((n) => !n.is_read);
      if (newest && lastCount > 0) {
        toast(newest.title, { description: newest.message || undefined });
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(newest.title, { body: newest.message || undefined });
        }
      }
    }
    setLastCount(unreadCount);
  }, [unreadCount]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  async function loadNotifications() {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setNotifications(data as Notification[]);
  }

  async function markRead(id: string) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications(notifications.map((n) => n.id === id ? { ...n, is_read: true } : n));
  }

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ is_read: true }).in("id", unreadIds);
    setNotifications(notifications.map((n) => ({ ...n, is_read: true })));
  }

  async function deleteNotification(id: string) {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications(notifications.filter((n) => n.id !== id));
  }

  function timeAgo(date: string) {
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (mins < 1) return "Jetzt";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.05] transition-all">
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-5 min-w-[20px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-full bottom-0 ml-2 w-80 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Benachrichtigungen</h3>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[11px] text-blue-600 hover:text-blue-700 font-medium">
                  Alle gelesen
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Keine Benachrichtigungen</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${!n.is_read ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
                  >
                    <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${!n.is_read ? "bg-blue-500" : "bg-transparent"}`} />
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => { markRead(n.id); if (n.link) { setOpen(false); window.location.href = n.link; } }}>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{n.title}</p>
                      {n.message && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>}
                      <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    <button onClick={() => deleteNotification(n.id)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-300 hover:text-red-500 transition-colors shrink-0 mt-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Hook to get badge counts for sidebar items
export function useNotificationCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const supabase = createClient();

  useEffect(() => {
    loadCounts();
    const interval = setInterval(loadCounts, 15000);
    return () => clearInterval(interval);
  }, []);

  async function loadCounts() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [todosRes, ticketsRes] = await Promise.all([
      supabase.from("todos").select("id", { count: "exact", head: true }).eq("assigned_to", user.id).eq("status", "offen"),
      supabase.from("tickets").select("id", { count: "exact", head: true }),
    ]);

    setCounts({
      "/todos": todosRes.count ?? 0,
      "/tickets": ticketsRes.count ?? 0,
    });
  }

  return counts;
}
