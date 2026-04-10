"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import {
  ClipboardList,
  Inbox,
  Clock,
  Users,
  ArrowRight,
  MapPin,
  FileText,
  Calendar,
  TrendingUp,
  Plus,
  CheckSquare,
} from "lucide-react";

interface DashboardStats {
  offeneAuftraege: number;
  neueAnfragen: number;
  aktiveTechniker: number;
  kundenTotal: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    offeneAuftraege: 0,
    neueAnfragen: 0,
    aktiveTechniker: 0,
    kundenTotal: 0,
  });
  const [userName, setUserName] = useState("");
  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        if (profile) setUserName(profile.full_name.split(" ")[0]);
      }

      const [jobsRes, anfragenRes, timeRes, kundenRes] = await Promise.all([
        supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .in("status", ["offen", "geplant", "in_arbeit"]),
        supabase
          .from("rental_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "neu"),
        supabase
          .from("time_entries")
          .select("id", { count: "exact", head: true })
          .is("clock_out", null),
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true),
      ]);

      setStats({
        offeneAuftraege: jobsRes.count ?? 0,
        neueAnfragen: anfragenRes.count ?? 0,
        aktiveTechniker: timeRes.count ?? 0,
        kundenTotal: kundenRes.count ?? 0,
      });
    }

    loadData();
  }, []);

  const statCards = [
    {
      label: "Offene Aufträge",
      value: stats.offeneAuftraege,
      icon: ClipboardList,
      iconBg: "bg-blue-50 text-blue-600",
      href: "/auftraege",
    },
    {
      label: "Neue Vermietungen",
      value: stats.neueAnfragen,
      icon: Inbox,
      iconBg: "bg-amber-50 text-amber-600",
      href: "/anfragen",
    },
    {
      label: "Aktive Techniker",
      value: stats.aktiveTechniker,
      icon: Users,
      iconBg: "bg-emerald-50 text-emerald-600",
      href: "/zeiterfassung",
    },
    {
      label: "Kunden",
      value: stats.kundenTotal,
      icon: TrendingUp,
      iconBg: "bg-violet-50 text-violet-600",
      href: "/kunden",
    },
  ];

  const quickActions = [
    { href: "/auftraege/neu", label: "Neuer Auftrag", icon: ClipboardList, desc: "Auftrag erstellen" },
    { href: "/anfragen/neu", label: "Neue Vermietung", icon: Inbox, desc: "Vermietung erfassen" },
    { href: "/kunden/neu", label: "Neuer Kunde", icon: Users, desc: "Kunde anlegen" },
    { href: "/zeiterfassung", label: "Einstempeln", icon: Clock, desc: "Zeit erfassen" },
  ];

  const navLinks = [
    { href: "/kalender", label: "Kalender", icon: Calendar, desc: "Termine & Planung" },
    { href: "/rapporte/neu", label: "Neuer Rapport", icon: FileText, desc: "Einsatzbericht erstellen" },
    { href: "/todos", label: "Todos", icon: CheckSquare, desc: "Aufgaben verwalten" },
    { href: "/standorte", label: "Standorte", icon: MapPin, desc: "Locations verwalten" },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Guten Morgen" : hour < 17 ? "Guten Tag" : "Guten Abend";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting}{userName ? `, ${userName}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Hier ist deine Übersicht.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="bg-white border-gray-100 hover:shadow-md hover:border-gray-200 transition-all duration-200 cursor-pointer group">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-lg ${stat.iconBg}`}>
                    <stat.icon className="h-4 w-4" />
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-gray-200 group-hover:text-gray-400 transition-colors" />
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
                  <p className="text-xs font-medium text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
          Schnellaktionen
        </h2>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Link key={action.href} href={action.href}>
              <Card className="bg-white border-gray-100 hover:shadow-md hover:border-gray-200 transition-all duration-200 cursor-pointer group h-full">
                <CardContent className="p-4">
                  <div className="w-9 h-9 rounded-lg bg-red-50 text-red-500 flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-colors duration-200">
                    <Plus className="h-4 w-4" />
                  </div>
                  <h3 className="font-semibold mt-2.5 text-sm">{action.label}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{action.desc}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Further Navigation */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
          Weitere Bereiche
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="bg-white border-gray-100 hover:shadow-sm hover:border-gray-200 transition-all cursor-pointer group">
                <CardContent className="p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gray-50 text-gray-500 flex items-center justify-center group-hover:bg-gray-100 transition-colors">
                      <link.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{link.label}</h3>
                      <p className="text-[11px] text-muted-foreground">{link.desc}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-gray-200 group-hover:text-gray-400 transition-colors" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
