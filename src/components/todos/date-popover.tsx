"use client";

/**
 * DatePopover — anchored an einen Trigger, zeigt Quick-Chips
 * "Heute / Morgen / Freitag / Naechste Woche / Ohne Datum" + freies
 * Date-Input. Nutzt Portal in document.body damit das Popover nicht
 * vom Row-Overflow abgeschnitten wird.
 *
 * Ist bewusst KEINE volle Calendar-Component — 5 Chips + Native-Date-
 * Picker decken 95% aller Todo-Umplanungen ab. Wer ein Datum in 3
 * Monaten braucht: manueller Picker daneben.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
// createPortal ist SSR-safe wenn wir document nur zur Render-Zeit anfassen.
import { createPortal } from "react-dom";
import { addDaysIso, todayIso, nextWeekdayIso } from "@/lib/relative-date";

interface Props {
  /** Aktueller Wert im Format YYYY-MM-DD oder null. */
  value: string | null;
  /** Callback beim Setzen. null = "Ohne Datum". */
  onChange: (iso: string | null) => void;
  /** Trigger-Element (Chip, Icon-Button etc.). */
  children: (opts: { open: () => void; isOpen: boolean }) => ReactNode;
  /** "clear" ausblenden (fuer Quick-Add wo NULL nicht sinnvoll ist). */
  hideClear?: boolean;
}

interface Pos { top: number; left: number; width: number }

export function DatePopover({ value, onChange, children, hideClear }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function measure() {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = 240;
      const height = 240;
      const spaceBelow = window.innerHeight - r.bottom;
      const top = spaceBelow < height + 12 && r.top > height + 12
        ? r.top - height - 6
        : r.bottom + 6;
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      setPos({ top, left, width });
    }
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(iso: string | null) {
    onChange(iso);
    setOpen(false);
  }

  const today = todayIso();
  const chips: { key: string; label: string; iso: string | null }[] = [
    { key: "today", label: "Heute", iso: today },
    { key: "tomorrow", label: "Morgen", iso: addDaysIso(today, 1) },
    { key: "friday", label: "Freitag", iso: nextWeekdayIso(5) },
    { key: "week", label: "In 1 Woche", iso: addDaysIso(today, 7) },
  ];

  const popover = open && pos && typeof document !== "undefined" ? createPortal(
    <div
      ref={popRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
      className="z-[1200] rounded-xl border border-border bg-popover shadow-lg p-2 space-y-1"
      onClick={(e) => e.stopPropagation()}
    >
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => pick(c.iso)}
          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors hover:bg-foreground/[0.06] dark:hover:bg-foreground/[0.12] ${
            value === c.iso ? "font-semibold bg-foreground/[0.05]" : ""
          }`}
        >
          {c.label}
        </button>
      ))}
      <div className="pt-1 border-t border-border">
        <input
          type="date"
          value={value ?? ""}
          onChange={(e) => pick(e.target.value || null)}
          className="w-full px-2.5 py-1.5 rounded-lg text-sm bg-card border border-border focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
      </div>
      {!hideClear && (
        <button
          type="button"
          onClick={() => pick(null)}
          className="w-full text-left px-2.5 py-1.5 rounded-lg text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.06] dark:hover:bg-foreground/[0.12]"
        >
          Ohne Datum
        </button>
      )}
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <div ref={anchorRef} className="inline-flex">
        {children({ open: () => setOpen((o) => !o), isOpen: open })}
      </div>
      {popover}
    </>
  );
}
