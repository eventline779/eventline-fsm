"use client";

/**
 * HR-Hub — Sammelseite fuer Personal-bezogene Bereiche.
 * Aktuelle Sektionen: Todos, Stempelzeiten, Tickets, Schulungen.
 *
 * Karten-Animation kommt von der gemeinsamen TypePickerCard, die
 * app-weit fuer alle Auswahl-Karten genutzt wird (gleiche Stempel-Modal-
 * Animation).
 */

import { useRouter } from "next/navigation";
import { TypePickerCard, type TypePickerTone } from "@/components/ui/type-picker-card";
import { GraduationCap, CheckSquare, Clock, Ticket } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface HRSection {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: TypePickerTone;
}

const sections: HRSection[] = [
  { href: "/todos",         label: "Todos",         description: "Persönliche Aufgaben verwalten",          icon: CheckSquare,    tone: "amber"  },
  { href: "/stempelzeiten", label: "Stempelzeiten", description: "Arbeitszeit-Erfassung pro Auftrag",       icon: Clock,          tone: "green"  },
  { href: "/tickets",       label: "Tickets",       description: "IT, Belege, Stempel-Änderungen, Material", icon: Ticket,        tone: "red"    },
  { href: "/schulungen",    label: "Schulungen",    description: "Schulungen und Weiterbildungen",          icon: GraduationCap,  tone: "purple" },
];

export default function HRPage() {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">HR</h1>
        <p className="text-sm text-muted-foreground mt-1" aria-hidden="true">&nbsp;</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map((s) => (
          <TypePickerCard
            key={s.href}
            icon={s.icon}
            tone={s.tone}
            label={s.label}
            description={s.description}
            onClick={() => router.push(s.href)}
          />
        ))}
      </div>
    </div>
  );
}
