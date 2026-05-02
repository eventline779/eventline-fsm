"use client";

/**
 * HR-Hub — Sammelseite fuer Personal-bezogene Bereiche. Aktuell drei
 * Sektionen: Todos, Schulungen, Stempelzeiten.
 */

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, CheckSquare, Clock } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface HRSection {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
}

const sections: HRSection[] = [
  { href: "/todos", label: "Todos", description: "Persönliche Aufgaben verwalten", icon: CheckSquare, color: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400" },
  { href: "/stempelzeiten", label: "Stempelzeiten", description: "Arbeitszeit-Erfassung pro Auftrag", icon: Clock, color: "bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-400" },
  { href: "/schulungen", label: "Schulungen", description: "Schulungen und Weiterbildungen", icon: GraduationCap, color: "bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400" },
];

export default function HRPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">HR</h1>
        <p className="text-sm text-muted-foreground mt-1" aria-hidden="true">&nbsp;</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="card-hover bg-card cursor-pointer h-full">
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
