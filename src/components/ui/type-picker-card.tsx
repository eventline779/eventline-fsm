"use client";

/**
 * TypePickerCard — die "schicke" Auswahl-Karte mit Icon + Label +
 * Beschreibung. Wird als Liste angeboten wenn der User aus 2-6 Typen
 * waehlen soll: z.B. Stempel-Modal (Auftrag/Andere), Neues-Ticket-Modal
 * (IT/Beleg/Stempel/Material), HR-Hub (Todos/Stempelzeiten/Tickets/Schulungen).
 *
 * Animation (state-driven inline-style — Tailwind hover:-Variants greifen
 * in dem Projekt nicht zuverlaessig):
 *   - Hover : scale(1.01) translateY(-2px), akzent-Border + akzent-Tint
 *             + akzent-farbiger Schatten, Icon-Bubble scale(1.1) rotate(-4deg)
 *   - Press : scale(0.99) translateY(0)
 *
 * Pro Tone (red, amber, blue, purple, green) wird die Akzent-Farbe
 * automatisch gewaehlt — Border, Shadow, Tint, Icon-Bubble.
 */

import { useState } from "react";

export type TypePickerTone = "red" | "amber" | "blue" | "purple" | "green";

const TONES: Record<TypePickerTone, {
  rgb: string;
  border: string;
  iconBg: string;
}> = {
  red:    { rgb: "220,38,38",  border: "rgb(248,113,113)", iconBg: "bg-red-50    dark:bg-red-500/15    text-red-600    dark:text-red-400"    },
  amber:  { rgb: "245,158,11", border: "rgb(251,191,36)",  iconBg: "bg-amber-50  dark:bg-amber-500/15  text-amber-600  dark:text-amber-400"  },
  blue:   { rgb: "37,99,235",  border: "rgb(96,165,250)",  iconBg: "bg-blue-50   dark:bg-blue-500/15   text-blue-600   dark:text-blue-400"   },
  purple: { rgb: "124,58,237", border: "rgb(167,139,250)", iconBg: "bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400" },
  green:  { rgb: "0,168,107",  border: "rgb(34,197,94)",   iconBg: "bg-green-50  dark:bg-green-500/15  text-green-600  dark:text-green-400"  },
};

interface Props {
  icon: React.ComponentType<{ className?: string }>;
  tone: TypePickerTone;
  label: string;
  description?: string;
  onClick: () => void;
  /** Optional rechts-aligned, z.B. ChevronRight oder Pfeil. */
  trailing?: React.ReactNode;
}

export function TypePickerCard({ icon: Icon, tone, label, description, onClick, trailing }: Props) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const t = TONES[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      className="w-full flex items-center gap-3 p-4 rounded-xl text-left bg-card"
      style={{
        transform: pressed
          ? "scale(0.99) translateY(0)"
          : hovered
            ? "scale(1.01) translateY(-2px)"
            : "scale(1) translateY(0)",
        transition: "transform 180ms cubic-bezier(0.4,0,0.2,1), box-shadow 180ms, border-color 180ms, background-color 180ms",
        border: `1px solid ${hovered ? t.border : "var(--border)"}`,
        boxShadow: hovered
          ? `0 8px 20px -6px rgba(${t.rgb}, 0.25)`
          : "0 1px 2px rgba(0,0,0,0.05)",
        backgroundColor: hovered ? `rgba(${t.rgb}, 0.04)` : "var(--card)",
      }}
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.iconBg}`}
        style={{
          transform: hovered ? "scale(1.1) rotate(-4deg)" : "scale(1) rotate(0)",
          transition: "transform 180ms cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </button>
  );
}
