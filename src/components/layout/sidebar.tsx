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
  Ticket,
  DoorOpen,
  Receipt,
  TrendingUp,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { NotificationBell, useNotificationCounts } from "@/components/layout/notification-bell";
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
  Ticket,
  DoorOpen,
  Receipt,
  TrendingUp,
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
  const badgeCounts = useNotificationCounts();


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
      {/* Logo + Glocke */}
      <div className="px-6 py-6 border-b border-white/5 flex items-center justify-between">
        <Link href="/dashboard" className="block">
          <Logo size="md" variant="light" />
        </Link>
        <NotificationBell />
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
                      {badgeCounts[item.href] > 0 && (
                        <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 text-[10px] font-bold text-white bg-red-500 rounded-full">
                          {badgeCounts[item.href]}
                        </span>
                      )}
                      {active && !badgeCounts[item.href] && (
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
