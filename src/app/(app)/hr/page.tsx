"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Clock, CalendarClock, AlertTriangle, GraduationCap } from "lucide-react";

const sections = [
  {
    href: "/einstellungen",
    label: "Team",
    description: "Mitarbeiter verwalten und Rollen zuweisen",
    icon: Users,
    color: "bg-blue-50 text-blue-600",
  },
  {
    href: "/einstellungen?tab=zeiten",
    label: "Stempelzeiten",
    description: "Arbeitszeiten und Stempeleinträge einsehen",
    icon: Clock,
    color: "bg-green-50 text-green-600",
  },
  {
    href: "/einstellungen?tab=schichten",
    label: "Schichtplanung",
    description: "Einsatzübersicht und Schichten pro Person",
    icon: CalendarClock,
    color: "bg-amber-50 text-amber-600",
  },
  {
    href: "/it-tickets",
    label: "IT-Tickets",
    description: "IT-Probleme melden und Tickets erstellen",
    icon: AlertTriangle,
    color: "bg-red-50 text-red-600",
  },
  {
    href: "/schulungen",
    label: "Schulungen",
    description: "Schulungen und Weiterbildungen",
    icon: GraduationCap,
    color: "bg-purple-50 text-purple-600",
  },
];

export default function HRPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">HR</h1>
        <p className="text-sm text-muted-foreground mt-1">Team, Zeiten, Schichten, IT-Support & Schulungen</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="bg-white hover:shadow-md transition-all cursor-pointer h-full">
              <CardContent className="p-6">
                <div className={`w-12 h-12 rounded-xl ${s.color} flex items-center justify-center mb-4`}>
                  <s.icon className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-lg">{s.label}</h3>
                <p className="text-sm text-muted-foreground mt-1">{s.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
