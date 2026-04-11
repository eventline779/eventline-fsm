"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, ADMIN_NAV_GROUP } from "@/lib/constants";
import type { NavGroup } from "@/lib/constants";
import { Logo } from "@/components/logo";
import {
  LayoutDashboard,
  ClipboardList,
  Inbox,
  Users,
  MapPin,
  Calendar,
  CalendarClock,
  Clock,
  FileText,
  FolderOpen,
  Settings,
  LogOut,
  ChevronRight,
  CheckSquare,
  Eye,
  EyeOff,
  Sun,
  Moon,
  AlertTriangle,
  X,
  Send,
  GraduationCap,
  Briefcase,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import type { Profile } from "@/types";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  ClipboardList,
  Inbox,
  Users,
  MapPin,
  Calendar,
  CalendarClock,
  Clock,
  FileText,
  FolderOpen,
  Settings,
  CheckSquare,
  AlertTriangle,
  GraduationCap,
  Briefcase,
};

interface SidebarProps {
  profile: Profile;
  onSignOut: () => void;
  simplified: boolean;
  onToggleSimplified: () => void;
}

export function Sidebar({ profile, onSignOut, simplified, onToggleSimplified }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { theme, setTheme } = useTheme();
  const fullUrl = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");

  const [showTicket, setShowTicket] = useState(false);
  const [ticketForm, setTicketForm] = useState({ subject: "", description: "", priority: "normal" });
  const [sendingTicket, setSendingTicket] = useState(false);

  async function submitTicket(e: React.FormEvent) {
    e.preventDefault();
    setSendingTicket(true);
    try {
      const res = await fetch("/api/it-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ticketForm, reporter: profile.full_name, reporterEmail: profile.email }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("IT-Ticket gesendet");
        setTicketForm({ subject: "", description: "", priority: "normal" });
        setShowTicket(false);
      } else {
        toast.error("Fehler: " + (json.error || "Unbekannt"));
      }
    } catch {
      toast.error("Fehler beim Senden");
    }
    setSendingTicket(false);
  }

  const groups: NavGroup[] = profile.role === "admin"
    ? [...NAV_GROUPS, ADMIN_NAV_GROUP]
    : [...NAV_GROUPS];

  function isActive(href: string) {
    // Exact match for items with query params (e.g. /einstellungen?tab=zeiten)
    if (href.includes("?")) {
      return fullUrl === href;
    }
    // For /einstellungen without params, only active if no tab param
    if (href === "/einstellungen") {
      return pathname === "/einstellungen" && !searchParams.get("tab");
    }
    // Default: path prefix matching
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <aside className="hidden md:flex md:w-[260px] md:flex-col bg-gradient-to-b from-[#0a0a0a] to-[#111111] text-white h-screen sticky top-0 shadow-2xl">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-white/5">
        <Link href="/dashboard" className="block">
          <Logo size="md" variant="light" />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-4">
        {groups.map((group) => {
          const items = simplified
            ? group.items.filter((item) => item.simplified)
            : group.items;
          if (items.length === 0) return null;

          return (
            <div key={group.label}>
              <p className="px-3 mb-1.5 text-[10px] font-semibold tracking-wider text-white/40 uppercase">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = iconMap[item.icon];
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "group flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-200",
                        active
                          ? "bg-white/10 text-white shadow-sm backdrop-blur-sm"
                          : "text-white hover:bg-white/[0.05]"
                      )}
                    >
                      {Icon && (
                        <div className={cn(
                          "flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200",
                          active
                            ? "bg-red-500/20 text-red-400"
                            : "bg-white/[0.08] text-white"
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>
                      )}
                      <span className="flex-1">{item.label}</span>
                      {active && (
                        <ChevronRight className="h-3 w-3 text-white/20" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Toggles */}
      <div className="px-3 mb-2 space-y-0.5">
        <button
          onClick={onToggleSimplified}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.05] transition-all"
        >
          {simplified ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {simplified ? "Alle Module anzeigen" : "Vereinfachte Ansicht"}
        </button>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.05] transition-all"
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>
      </div>

      {/* IT Ticket Button */}
      <div className="px-3 mb-2">
        <button
          onClick={() => setShowTicket(true)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-all shadow-lg shadow-red-500/20"
        >
          <AlertTriangle className="h-4 w-4" />
          IT-Ticket erstellen
        </button>
      </div>

      {/* IT Ticket Modal */}
      {showTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h2 className="font-semibold text-gray-900 dark:text-white">IT-Ticket erstellen</h2>
              </div>
              <button onClick={() => setShowTicket(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <form onSubmit={submitTicket} className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Betreff *</label>
                <input
                  value={ticketForm.subject}
                  onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
                  placeholder="z.B. Drucker funktioniert nicht"
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500/20 text-gray-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Beschreibung *</label>
                <textarea
                  value={ticketForm.description}
                  onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
                  placeholder="Beschreibe das Problem so genau wie möglich..."
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20 text-gray-900 dark:text-white"
                  rows={4}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Priorität</label>
                <select
                  value={ticketForm.priority}
                  onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value })}
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="niedrig">Niedrig</option>
                  <option value="normal">Normal</option>
                  <option value="hoch">Hoch</option>
                  <option value="kritisch">Kritisch</option>
                </select>
              </div>
              <p className="text-xs text-gray-400">Ticket wird an Mischa Dittus (IT) gesendet</p>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowTicket(false)} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  Abbrechen
                </button>
                <button type="submit" disabled={sendingTicket} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50">
                  <Send className="h-4 w-4" />
                  {sendingTicket ? "Senden..." : "Ticket senden"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User */}
      <div className="p-4 mx-3 mb-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-red-500/20">
            {profile.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {profile.full_name}
            </p>
            <p className="text-[11px] text-white/30 capitalize">{profile.role}</p>
          </div>
          <button
            onClick={onSignOut}
            className="p-2 rounded-lg text-white/20 hover:text-white/70 hover:bg-white/[0.05] transition-all duration-200"
            title="Abmelden"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
