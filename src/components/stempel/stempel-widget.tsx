"use client";

// Schwebende Stempel-Pille unten-rechts. Immer sichtbar im (app)-Layout
// (siehe layout.tsx). Verhalten:
//   - Eingestempelt: gruene Pille mit Live-Timer + Job/Beschreibung +
//     Stop-Button. Klick auf die Pille zeigt Details.
//   - Ausgestempelt: kompakte Aktions-Pille "Einstempeln" → oeffnet Modal.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Square, Briefcase, FileText, ChevronUp } from "lucide-react";
import { useStempel, formatStempelDuration } from "@/lib/use-stempel";
import { StempelModal } from "./stempel-modal";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export function StempelWidget() {
  const { active, loading, clockOut } = useStempel();
  const [showModal, setShowModal] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);
  const [jobLabel, setJobLabel] = useState<string | null>(null);
  // Hover-State per JS damit's ohne Tailwind-Variant-Kompilierung funktioniert
  // (manche Tailwind-v4-Setups generieren `hover:scale-110` nicht zuverlaessig
  // bei selten-genutzten Elementen).
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const supabase = createClient();

  // Live-Timer: 1s-Tick wenn eingestempelt. Sonst kein Interval (spart Strom).
  useEffect(() => {
    if (!active) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [active]);

  // Job-Label nachladen wenn der active-Eintrag ein job_id hat —
  // wird in der Pille als "INT-1234 · Titel" angezeigt.
  useEffect(() => {
    let cancelled = false;
    if (!active?.job_id) {
      setJobLabel(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("jobs")
        .select("job_number, title")
        .eq("id", active.job_id)
        .maybeSingle();
      if (!cancelled && data) {
        setJobLabel(`INT-${data.job_number} · ${data.title}`);
      }
    })();
    return () => { cancelled = true; };
  }, [active?.job_id, supabase]);

  if (loading) return null;

  async function handleStop() {
    const res = await clockOut();
    if (res.success) toast.success("Ausgestempelt");
    else toast.error(res.error || "Ausstempeln fehlgeschlagen");
    setExpanded(false);
  }

  return (
    <>
      {/* Pille fix unten-rechts NUR auf Mobile (md:hidden). Auf Desktop ist
          der Stempel-Status in der Sidebar oberhalb von Dark-Mode integriert.
          Mobile: 88px Abstand vom Boden wegen Bottom-Nav. */}
      <div className="md:hidden fixed bottom-4 right-4 z-40 mb-[88px]">
        {active ? (
          <div className="flex flex-col items-end gap-2">
            {/* Expand-Card mit Details */}
            {expanded && (
              <div
                className="bg-card rounded-xl p-3 shadow-2xl min-w-[260px] max-w-[320px] animate-in fade-in slide-in-from-bottom-2 duration-200"
                style={{ border: "1px solid rgba(0,168,107,0.4)" }}
              >
                <div className="flex items-start gap-2">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "rgba(0,168,107,0.15)", color: "rgb(0,168,107)" }}
                  >
                    {active.job_id ? <Briefcase className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Eingestempelt</p>
                    <p className="text-sm font-medium truncate">
                      {active.job_id ? (jobLabel ?? "Auftrag laden…") : "Andere Arbeit"}
                    </p>
                    {active.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{active.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Seit {new Date(active.clock_in).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Link
                    href="/stempelzeiten"
                    onClick={() => setExpanded(false)}
                    className="kasten kasten-muted flex-1 text-center"
                  >
                    Verlauf
                  </Link>
                  <button type="button" onClick={handleStop} className="kasten kasten-red flex-1">
                    <Square className="h-3.5 w-3.5" fill="currentColor" />
                    Ausstempeln
                  </button>
                </div>
              </div>
            )}
            {/* Pille selbst — Klick toggelt expand. Inline-style fuer Hover/Press
                damit die Animation garantiert sichtbar ist (Tailwind-Variants
                liefen aus unbekanntem Grund nicht durch). */}
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => { setHovered(false); setPressed(false); }}
              onMouseDown={() => setPressed(true)}
              onMouseUp={() => setPressed(false)}
              className="flex items-center gap-2 pl-3 pr-4 py-2 rounded-full text-green-700 dark:text-green-300"
              style={{
                transform: pressed ? "scale(0.95)" : hovered ? "scale(1.05) translateY(-2px)" : "scale(1) translateY(0)",
                transition: "transform 200ms cubic-bezier(0.4,0,0.2,1), box-shadow 200ms, background-color 200ms",
                backgroundColor: hovered ? "rgba(0,168,107,0.22)" : "rgba(0,168,107,0.12)",
                border: "2px solid var(--status-green, #00a86b)",
                boxShadow: hovered ? "0 8px 20px -6px rgba(0,168,107,0.25)" : "0 3px 10px -3px rgba(0,168,107,0.15)",
              }}
              aria-label={expanded ? "Stempel-Details schliessen" : "Stempel-Details oeffnen"}
            >
              <span className="relative flex">
                <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full opacity-50" style={{ backgroundColor: "rgb(0,168,107)" }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: "rgb(0,168,107)" }} />
              </span>
              <span className="font-mono text-sm font-semibold tabular-nums">
                {formatStempelDuration(active.clock_in, now)}
              </span>
              <ChevronUp className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => { setHovered(false); setPressed(false); }}
            onMouseDown={() => setPressed(true)}
            onMouseUp={() => setPressed(false)}
            className="flex items-center gap-2 pl-3 pr-4 py-2 rounded-full bg-card text-foreground"
            style={{
              transform: pressed ? "scale(0.95)" : hovered ? "scale(1.1) translateY(-4px)" : "scale(1) translateY(0)",
              transition: "transform 200ms cubic-bezier(0.4,0,0.2,1), box-shadow 200ms cubic-bezier(0.4,0,0.2,1), border-color 200ms",
              boxShadow: hovered ? "0 20px 40px -10px rgba(0,0,0,0.25)" : "0 10px 20px -5px rgba(0,0,0,0.15)",
              border: hovered ? "2px solid rgb(0,168,107)" : "2px solid var(--border)",
            }}
            aria-label="Einstempeln"
          >
            <Clock className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium">Einstempeln</span>
          </button>
        )}
      </div>

      <StempelModal open={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
