"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Toaster } from "@/components/ui/sonner";
import type { Profile } from "@/types";
import { NAV_GROUPS, ADMIN_NAV_GROUP } from "@/lib/constants";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Eye, EyeOff, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { useTheme } from "next-themes";
import { NAV_ICON_MAP } from "@/lib/nav-icons";
import { useEnterAsTab } from "@/lib/use-enter-as-tab";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [simplified, setSimplified] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("eventline-simplified") === "true";
    }
    return false;
  });
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { theme, setTheme } = useTheme();
  const supabase = createClient();

  // Globale Regel: Enter im Input/Select springt zum nächsten Feld, statt zu submitten.
  useEnterAsTab();

  function toggleSimplified() {
    setSimplified((prev) => {
      const next = !prev;
      localStorage.setItem("eventline-simplified", String(next));
      return next;
    });
  }

  // Realtime statt Polling: globale Subscription auf jobs + customers — bei
  // jedem INSERT/UPDATE/DELETE feuern wir einen window-Event den alle Listen
  // abonnieren ("jobs:invalidate" / "customers:invalidate"). Damit aktualisieren
  // sich Listen ohne 10-Sekunden-Polling, und Form-Eingaben werden nicht durch
  // einen Re-Render zerschossen. Skaliert deutlich besser als das vorige
  // setInterval(refresh, 10000) — eine WebSocket-Verbindung statt Dauer-Queries.
  useEffect(() => {
    const channel = supabase
      .channel("global-invalidate")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => {
        window.dispatchEvent(new Event("jobs:invalidate"));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => {
        window.dispatchEvent(new Event("customers:invalidate"));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfile(data as Profile);
        // Techniker bekommen automatisch vereinfachte Ansicht (ohne Umschaltmöglichkeit)
        if (data.role === "techniker") {
          setSimplified(true);
        }
      }
      setLoading(false);
    }

    loadProfile();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center flex flex-col items-center">
          <Logo size="lg" />
          <div className="mt-4 flex items-center justify-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse [animation-delay:200ms]" />
            <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse [animation-delay:400ms]" />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const groups = profile.role === "admin"
    ? [...NAV_GROUPS, ADMIN_NAV_GROUP]
    : [...NAV_GROUPS];

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] dark:bg-[#0a0a0a]">
      <Sidebar
        profile={profile}
        onSignOut={handleSignOut}
        simplified={simplified}
        onToggleSimplified={toggleSimplified}
      />

      {/* Margin-left = Sidebar-Breite (260px) ab md-Breakpoint, damit der
          Content-Bereich nicht unter der fixed-positionierten Sidebar liegt. */}
      <div className="flex-1 flex flex-col pb-[calc(env(safe-area-inset-bottom)+80px)] md:pb-0 min-w-0 overflow-x-hidden md:ml-[260px]">
        <main className="flex-1 p-3 sm:p-4 pt-[calc(env(safe-area-inset-top)+12px)] sm:pt-[calc(env(safe-area-inset-top)+16px)] md:p-8 md:pt-8 max-w-[1400px] w-full mx-auto min-w-0">{children}</main>
      </div>

      <MobileNav onMenuOpen={() => setMobileMenuOpen(true)} />

      {/* Mobile Menu Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="bg-sidebar text-sidebar-foreground border-sidebar-border w-[280px] p-0 font-heading">
          <SheetHeader className="px-6 py-6 border-b border-sidebar-border">
            <SheetTitle className="text-left">
              <Logo size="md" />
            </SheetTitle>
          </SheetHeader>
          <nav className="px-3 py-4 space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">
            {groups.map((group) => {
              const items = simplified
                ? group.items.filter((item) => item.simplified)
                : group.items;
              if (items.length === 0) return null;

              return (
                <div key={group.label || group.items[0]?.href}>
                  {group.label && (
                    <p className="px-3 mb-1.5 text-[10px] font-semibold tracking-wider text-sidebar-foreground/40 uppercase">
                      {group.label}
                    </p>
                  )}
                  {items.map((item) => {
                    const Icon = NAV_ICON_MAP[item.icon];
                    const fullUrl = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
                    const isActive = item.href.includes("?")
                      ? fullUrl === item.href
                      : item.href === "/einstellungen"
                        ? pathname === "/einstellungen" && !searchParams.get("tab")
                        : item.href === "/heute" || item.href === "/kalender"
                          ? pathname === item.href
                          : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          "group flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                        )}
                      >
                        {Icon && (
                          <div className={cn(
                            "flex items-center justify-center w-7 h-7 rounded-md",
                            isActive
                              ? "bg-red-500/20 text-red-500 dark:text-red-400"
                              : "bg-sidebar-foreground/[0.06] text-sidebar-foreground/60"
                          )}>
                            <Icon className="h-4 w-4" />
                          </div>
                        )}
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          {/* Toggles */}
          <div className="absolute bottom-[90px] left-3 right-3 space-y-0.5">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-all"
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </button>
            {profile.role === "admin" && (
              <button
                onClick={toggleSimplified}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-all"
              >
                {simplified ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {simplified ? "Alle Module" : "Vereinfacht"}
              </button>
            )}
          </div>

          <div className="absolute bottom-3 left-3 right-3">
            <div className="p-4 rounded-xl bg-sidebar-foreground/[0.04] border border-sidebar-border">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white text-sm font-bold">
                  {profile.full_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-sidebar-foreground">{profile.full_name}</p>
                  <p className="text-[11px] text-sidebar-foreground/50 capitalize">{profile.role}</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="mt-3 w-full text-left text-[13px] text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
              >
                Abmelden
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Toaster />
    </div>
  );
}
