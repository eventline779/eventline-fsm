"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, ADMIN_NAV_GROUP } from "@/lib/constants";
import type { NavGroup } from "@/lib/constants";
import { NAV_ICON_MAP } from "@/lib/nav-icons";
import { Logo } from "@/components/logo";
import {
  LogOut,
  ChevronRight,
  Eye,
  EyeOff,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "next-themes";
import type { Profile } from "@/types";

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


  const groups: NavGroup[] = profile.role === "admin"
    ? [...NAV_GROUPS, ADMIN_NAV_GROUP]
    : [...NAV_GROUPS];

  function isActive(href: string, matchPrefixes?: string[]) {
    // Exact match for items with query params (e.g. /einstellungen?tab=zeiten)
    if (href.includes("?")) {
      return fullUrl === href;
    }
    // For /einstellungen without params, only active if no tab param
    if (href === "/einstellungen") {
      return pathname === "/einstellungen" && !searchParams.get("tab");
    }
    // Top-level singletons: exact match only, so deeper paths don't bleed into the highlight.
    if (href === "/heute" || href === "/kalender") return pathname === href;
    if (pathname.startsWith(href)) return true;
    // Zusatz-Prefixe (z.B. /standorte und /raeume gehoeren zu /orte)
    if (matchPrefixes?.some((p) => pathname.startsWith(p))) return true;
    return false;
  }

  return (
    <aside className="hidden md:flex md:flex-col fixed left-0 top-0 w-[260px] h-screen bg-sidebar text-sidebar-foreground shadow-lg border-r border-sidebar-border font-heading z-30">
      {/* Logo — Top auf 38px */}
      <div className="px-6 pt-[38px] pb-4 flex items-start justify-center">
        <Link href="/heute" className="block">
          <Logo size="md" />
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
            <div key={group.label || group.items[0]?.href}>
              {group.label && (
                <p className="px-3 mb-1.5 text-[10px] font-semibold tracking-wider text-sidebar-foreground/50 uppercase">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = NAV_ICON_MAP[item.icon];
                  const active = isActive(item.href, item.matchPrefixes);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "group flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-200",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                      )}
                    >
                      {Icon && (
                        <div className={cn(
                          "flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200",
                          active
                            ? "bg-red-500/20 text-red-500 dark:text-red-400"
                            : "bg-sidebar-foreground/[0.08] text-sidebar-foreground"
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>
                      )}
                      <span className="flex-1">{item.label}</span>
                      {active && (
                        <ChevronRight className="h-3 w-3 text-sidebar-foreground/30" />
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
        {profile.role === "admin" && (
          <button
            onClick={onToggleSimplified}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-all"
          >
            {simplified ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {simplified ? "Alle Module anzeigen" : "Vereinfachte Ansicht"}
          </button>
        )}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-all"
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>
      </div>

      {/* User */}
      <div className="p-4 mx-3 mb-3 rounded-xl bg-sidebar-foreground/[0.04] border border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-red-500/20">
            {profile.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground truncate">
              {profile.full_name}
            </p>
            <p className="text-[11px] text-sidebar-foreground/50 capitalize">{profile.role}</p>
          </div>
          <button
            onClick={onSignOut}
            className="p-2 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-all duration-200"
            title="Abmelden"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
