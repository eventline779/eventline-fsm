"use client";

// Eine zentrale Stelle fuer den 5-Step-Akquise-Tracker einer Vermietungsanfrage.
// Wird in der Liste (kompakt) und im Detail (gross) verwendet — eine Quelle der Wahrheit
// fuer Look + Logik. Die Schritte selbst kommen aus REQUEST_STEPS in constants.ts.

import { Check } from "lucide-react";
import { REQUEST_STEPS } from "@/lib/constants";

interface RequestStepTrackerProps {
  /** Aktueller Step (1..5). Schritte davor = abgeschlossen, danach = bevorstehend. */
  currentStep: number;
  /** Default 'lg' (Detail-Page). 'sm' fuer Liste-Karten. */
  size?: "sm" | "lg";
  className?: string;
}

export function RequestStepTracker({ currentStep, size = "lg", className = "" }: RequestStepTrackerProps) {
  const isLg = size === "lg";
  return (
    <div className={`flex items-center ${isLg ? "gap-2" : "gap-1"} ${className}`}>
      {REQUEST_STEPS.map((s, i) => {
        const done = s.step < currentStep;
        const active = s.step === currentStep;
        const stateClasses = active
          ? "bg-[var(--status-blue)] text-white border-[var(--status-blue)]"
          : done
            ? "bg-[var(--status-green)] text-white border-[var(--status-green)]"
            : "bg-foreground/[0.04] text-muted-foreground border-foreground/10";
        const dotSize = isLg ? "w-7 h-7 text-xs" : "w-5 h-5 text-[10px]";
        const labelSize = isLg ? "text-xs" : "text-[10px]";
        const lineWidth = isLg ? "w-6" : "w-3";
        return (
          <div key={s.step} className="flex items-center gap-2">
            <div className={`flex flex-col items-center ${isLg ? "gap-1" : "gap-0.5"}`}>
              <div className={`${dotSize} rounded-full flex items-center justify-center font-semibold border transition-colors ${stateClasses}`}>
                {done ? <Check className={isLg ? "h-3.5 w-3.5" : "h-3 w-3"} /> : s.step}
              </div>
              {isLg && (
                <span className={`${labelSize} font-medium ${active ? "text-foreground" : "text-muted-foreground"} text-center max-w-[64px] leading-tight`}>
                  {s.label}
                </span>
              )}
            </div>
            {i < REQUEST_STEPS.length - 1 && (
              <div className={`${lineWidth} h-[2px] rounded-full transition-colors ${done ? "bg-[var(--status-green)]" : "bg-foreground/10"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
