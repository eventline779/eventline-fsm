"use client";

// Stempel-Anzeige im Sidebar-Footer (oberhalb Dark-Mode-Toggle).
// Nutzt den gleichen useStempel-Hook wie das schwebende Widget, rendert
// aber inline + breiter — passt besser zum Sidebar-Layout (260px).
//
// Hover-/Press-Animation per onMouseEnter/onMouseLeave + inline-style,
// gleicher Trick wie beim StempelWidget weil Tailwind-Hover-Variants
// auf neuen Komponenten sporadisch nicht greifen.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Square, Briefcase, FileText } from "lucide-react";
import { useStempel, formatStempelDuration } from "@/lib/use-stempel";
import { StempelModal } from "./stempel-modal";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export function SidebarStempel() {
  const { active, loading, clockOut } = useStempel();
  const [showModal, setShowModal] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [jobLabel, setJobLabel] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [stopHovered, setStopHovered] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

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

  async function handleStop(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const res = await clockOut();
    if (res.success) toast.success("Ausgestempelt");
    else toast.error(res.error || "Ausstempeln fehlgeschlagen");
  }

  return (
    <>
      <div className="px-3 mb-2">
        {active ? (
          <div
            className="rounded-xl overflow-hidden"
            style={{
              transform: pressed ? "scale(0.99)" : hovered ? "scale(1.015)" : "scale(1)",
              transition: "transform 180ms cubic-bezier(0.4,0,0.2,1), background-color 180ms, border-color 180ms",
              border: stopHovered
                ? "2px solid var(--status-red, #dc2626)"
                : "2px solid var(--status-green, #00a86b)",
              backgroundColor: stopHovered
                ? "rgba(220,38,38,0.18)"
                : (hovered ? "rgba(0,168,107,0.22)" : "rgba(0,168,107,0.12)"),
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => { setHovered(false); setPressed(false); }}
            onMouseDown={() => setPressed(true)}
            onMouseUp={() => setPressed(false)}
          >
            <Link
              href="/stempelzeiten"
              className="flex items-center gap-2 px-3 py-2"
              style={{
                transition: "color 180ms",
                color: stopHovered ? "rgb(185,28,28)" : "rgb(21,128,61)",
              }}
            >
              <span className="relative flex shrink-0">
                <span
                  className="animate-ping absolute inline-flex h-2 w-2 rounded-full opacity-50"
                  style={{ backgroundColor: stopHovered ? "rgb(239,68,68)" : "rgb(0,168,107)" }}
                />
                <span
                  className="relative inline-flex h-2 w-2 rounded-full"
                  style={{ backgroundColor: stopHovered ? "rgb(239,68,68)" : "rgb(0,168,107)" }}
                />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm font-semibold tabular-nums leading-tight">
                  {formatStempelDuration(active.clock_in, now)}
                </p>
                <p className="text-[10px] opacity-75 truncate leading-tight mt-0.5">
                  {active.job_id
                    ? (jobLabel ?? "Auftrag laden…")
                    : (active.description || "Andere Arbeit")}
                </p>
              </div>
              {active.job_id
                ? <Briefcase className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
                : <FileText className="h-3.5 w-3.5 shrink-0 opacity-65" />}
            </Link>
            <button
              type="button"
              onClick={handleStop}
              onMouseEnter={() => setStopHovered(true)}
              onMouseLeave={() => setStopHovered(false)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium"
              style={{
                transition: "background-color 180ms, color 180ms, border-color 180ms",
                borderTop: `1px solid ${stopHovered ? "rgba(220,38,38,0.35)" : "rgba(0,168,107,0.25)"}`,
                backgroundColor: stopHovered ? "rgba(220,38,38,0.18)" : "rgba(0,168,107,0.06)",
                color: stopHovered ? "rgb(185,28,28)" : "rgb(22,101,52)",
              }}
            >
              <Square className="h-3 w-3" fill="currentColor" />
              Ausstempeln
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
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium text-green-700 dark:text-green-300"
            style={{
              transform: pressed ? "scale(0.99)" : hovered ? "scale(1.015)" : "scale(1)",
              transition: "transform 180ms cubic-bezier(0.4,0,0.2,1), background-color 180ms",
              border: "2px solid var(--status-green, #00a86b)",
              backgroundColor: hovered ? "rgba(0,168,107,0.22)" : "rgba(0,168,107,0.12)",
            }}
          >
            <Clock className="h-4 w-4" />
            <span className="flex-1 text-left">Einstempeln</span>
          </button>
        )}
      </div>

      <StempelModal open={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
