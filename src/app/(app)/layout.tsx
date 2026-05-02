"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { StempelWidget } from "@/components/stempel/stempel-widget";
import { Toaster } from "@/components/ui/sonner";
import type { Profile } from "@/types";
import { NAV_GROUPS, ADMIN_NAV_GROUP } from "@/lib/constants";
import { isPathAllowed } from "@/lib/permissions";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { useTheme } from "next-themes";
import { NAV_ICON_MAP } from "@/lib/nav-icons";
import { useEnterAsTab } from "@/lib/use-enter-as-tab";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { theme, setTheme } = useTheme();
  const supabase = createClient();

  // Globale Regel: Enter im Input/Select springt zum nächsten Feld, statt zu submitten.
  useEnterAsTab();

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

  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    async function loadProfile() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        if (error) {
          setLoadError(`Profil-Laden fehlgeschlagen: ${error.message}`);
          setLoading(false);
          return;
        }
        if (!data) {
          setLoadError("Profil nicht gefunden für diesen User.");
          setLoading(false);
          return;
        }

        setProfile(data as Profile);
        // Permissions zur Rolle des Users laden. Falls die Rolle (warum
        // auch immer) nicht existiert, fallen wir auf leere Permissions
        // zurueck — admin-Rolle wird im Helper sowieso special-cased.
        const { data: roleRow } = await supabase
          .from("roles")
          .select("permissions")
          .eq("slug", (data as Profile).role)
          .single();
        const perms = Array.isArray(roleRow?.permissions) ? roleRow.permissions as string[] : [];
        setPermissions(perms);
        setLoading(false);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Unbekannter Fehler beim Laden");
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  // Path-Guard: wenn der aktuelle Pfad fuer diese Rolle nicht erlaubt ist,
  // zurueck aufs Dashboard. Greift wenn jemand eine URL direkt aufruft die
  // nicht in seiner Sidebar steht.
  useEffect(() => {
    if (!profile) return;
    if (!isPathAllowed(pathname, permissions, profile.role)) {
      router.replace("/dashboard");
    }
  }, [pathname, profile, permissions, router]);

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

  if (loadError || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full bg-card border rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-semibold">Konnte nicht geladen werden</h2>
          <p className="text-sm text-muted-foreground">{loadError ?? "Profil ist null."}</p>
          <div className="flex gap-2 pt-2">
            <button onClick={() => location.reload()} className="kasten kasten-muted flex-1">Neu laden</button>
            <button onClick={handleSignOut} className="kasten kasten-red flex-1">Abmelden</button>
          </div>
        </div>
      </div>
    );
  }

  // Sidebar + Mobile-Sheet zeigen dieselben gefilterten Gruppen.
  // Filter laeuft pro Item via isPathAllowed (admin sieht alles).
  const groups = [...NAV_GROUPS, ADMIN_NAV_GROUP]
    .map((g) => ({ ...g, items: g.items.filter((i) => isPathAllowed(i.href, permissions, profile.role)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-screen bg-[#f5f5f7] dark:bg-[#0a0a0a]">
      <Sidebar
        profile={profile}
        permissions={permissions}
        onSignOut={handleSignOut}
      />

      {/* Margin-left = Sidebar-Breite (260px) ab md-Breakpoint, damit der
          Content-Bereich nicht unter der fixed-positionierten Sidebar liegt. */}
      <div className="flex-1 flex flex-col pb-[calc(env(safe-area-inset-bottom)+80px)] md:pb-0 min-w-0 overflow-x-hidden md:ml-[260px]">
        <main className="flex-1 p-3 sm:p-4 pt-[calc(env(safe-area-inset-top)+12px)] sm:pt-[calc(env(safe-area-inset-top)+16px)] md:p-8 md:pt-8 max-w-[1400px] w-full mx-auto min-w-0">{children}</main>
      </div>

      <MobileNav onMenuOpen={() => setMobileMenuOpen(true)} permissions={permissions} role={profile.role} />
      <StempelWidget />

      {/* Mobile Menu Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="bg-sidebar text-sidebar-foreground border-sidebar-border w-[280px] p-0 font-heading">
          <SheetHeader className="px-6 py-6 border-b border-sidebar-border">
            <SheetTitle className="text-left">
              <Logo size="md" />
            </SheetTitle>
          </SheetHeader>
          <nav
            className="px-3 py-4 space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]"
            style={{
              maskImage: "linear-gradient(to bottom, transparent 0, black 32px, black calc(100% - 32px), transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 32px, black calc(100% - 32px), transparent 100%)",
            }}
          >
            {groups.map((group) => {
              const items = group.items;
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
                      : item.href === "/dashboard" || item.href === "/kalender"
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
