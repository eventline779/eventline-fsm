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
  CheckSquare,
  Eye,
  EyeOff,
  Sun,
  Moon,
  AlertTriangle,
  GraduationCap,
  Briefcase,
  Ticket,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { useTheme } from "next-themes";

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
};

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

  function toggleSimplified() {
    setSimplified((prev) => {
      const next = !prev;
      localStorage.setItem("eventline-simplified", String(next));
      return next;
    });
  }

  // Auto-Refresh alle 30 Sekunden
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, 30000);
    return () => clearInterval(interval);
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
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa]">
        <div className="text-center flex flex-col items-center">
          <Logo size="lg" variant="dark" />
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

      <div className="flex-1 flex flex-col pb-20 md:pb-0">
        <main className="flex-1 p-4 pt-[calc(env(safe-area-inset-top)+16px)] md:p-8 md:pt-8 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>

      <MobileNav onMenuOpen={() => setMobileMenuOpen(true)} />

      {/* Mobile Menu Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="bg-gradient-to-b from-[#0a0a0a] to-[#111] text-white border-white/5 w-[280px] p-0">
          <SheetHeader className="px-6 py-6 border-b border-white/5">
            <SheetTitle className="text-left">
              <Logo size="md" variant="light" />
            </SheetTitle>
          </SheetHeader>
          <nav className="px-3 py-4 space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">
            {groups.map((group) => {
              const items = simplified
                ? group.items.filter((item) => item.simplified)
                : group.items;
              if (items.length === 0) return null;

              return (
                <div key={group.label}>
                  <p className="px-3 mb-1.5 text-[10px] font-semibold tracking-wider text-white/25 uppercase">
                    {group.label}
                  </p>
                  {items.map((item) => {
                    const Icon = iconMap[item.icon];
                    const fullUrl = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
                    const isActive = item.href.includes("?")
                      ? fullUrl === item.href
                      : item.href === "/einstellungen"
                        ? pathname === "/einstellungen" && !searchParams.get("tab")
                        : item.href === "/dashboard"
                          ? pathname === "/dashboard"
                          : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          "group flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all",
                          isActive
                            ? "bg-white/10 text-white"
                            : "text-white/40 hover:text-white/90 hover:bg-white/[0.05]"
                        )}
                      >
                        {Icon && (
                          <div className={cn(
                            "flex items-center justify-center w-7 h-7 rounded-md",
                            isActive
                              ? "bg-red-500/20 text-red-400"
                              : "bg-white/[0.03] text-white/30"
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
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.05] transition-all"
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </button>
            <button
              onClick={toggleSimplified}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.05] transition-all"
            >
              {simplified ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {simplified ? "Alle Module" : "Vereinfacht"}
            </button>
          </div>

          <div className="absolute bottom-3 left-3 right-3">
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-white text-sm font-bold">
                  {profile.full_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold">{profile.full_name}</p>
                  <p className="text-[11px] text-white/30 capitalize">{profile.role}</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="mt-3 w-full text-left text-[13px] text-white/30 hover:text-white/70 transition-colors"
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
