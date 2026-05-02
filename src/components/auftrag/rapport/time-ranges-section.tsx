"use client";

// Einsatzzeiten-Sektion: Liste pro Tag mit Datum, Techniker, Von/Bis,
// Pause + Gesamt-Stunden-Anzeige. Selbstaendige UI-Komponente — die
// Berechnungen (Dauer pro Range / Total) leben hier weil sie nur fuer
// Anzeige sind. Das Parent kriegt nur die TimeRange[]-Liste via onChange.

import { Trash2, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { TimeRange, ProfileOption } from "./types";

interface Props {
  timeRanges: TimeRange[];
  profiles: ProfileOption[];
  isReadOnly: boolean;
  onChange: (next: TimeRange[]) => void;
}

function trMinutes(tr: TimeRange): number {
  if (!tr.start || !tr.end) return 0;
  const [sh, sm] = tr.start.split(":").map(Number);
  const [eh, em] = tr.end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  const m = (eh * 60 + em) - (sh * 60 + sm) - (tr.pause || 0);
  return m > 0 ? m : 0;
}

function calcDuration(tr: TimeRange): string {
  const m = trMinutes(tr);
  if (m <= 0) return "–";
  return `${Math.floor(m / 60)}h ${m % 60 > 0 ? (m % 60) + "m" : ""}`.trim();
}

function calcTotalHours(timeRanges: TimeRange[]): string {
  const totalMin = timeRanges.reduce((sum, tr) => sum + trMinutes(tr), 0);
  if (totalMin <= 0) return "0h";
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60 > 0 ? (totalMin % 60) + "m" : ""}`.trim();
}

export function TimeRangesSection({ timeRanges, profiles, isReadOnly, onChange }: Props) {
  function addRange() {
    onChange([...timeRanges, { date: "", start: "", end: "", pause: 0, technician_id: "" }]);
  }
  function removeRange(i: number) {
    if (timeRanges.length <= 1) return;
    onChange(timeRanges.filter((_, idx) => idx !== i));
  }
  function updateRange(i: number, field: keyof TimeRange, value: string | number) {
    onChange(timeRanges.map((tr, idx) => idx === i ? { ...tr, [field]: value } : tr));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Einsatzzeiten</p>
        <span className="text-xs font-semibold text-red-600">Total: {calcTotalHours(timeRanges)}</span>
      </div>
      {timeRanges.map((tr, i) => (
        <div key={i} id={`time-range-${i}`} className="p-3 rounded-xl bg-muted/30 border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {timeRanges.length > 1 ? `Tag ${i + 1}` : "Einsatztag"}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{calcDuration(tr)}</span>
              {timeRanges.length > 1 && (
                <button type="button" onClick={() => removeRange(i)} className="icon-btn icon-btn-red">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          {/* Layout: Datum + Techniker oben (50/50), Von/Bis/Pause
              unten (3 Spalten). So hat das Datum-Feld genug Breite
              um die ganze "DD.MM.YYYY"-Anzeige zu zeigen. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="text-[11px] font-medium text-muted-foreground">Datum *</label>
              <Input type="date" value={tr.date} onChange={(e) => updateRange(i, "date", e.target.value)} disabled={isReadOnly} required className="mt-1 h-9 text-xs" />
            </div>
            <div className="min-w-0">
              <label className="text-[11px] font-medium text-muted-foreground">Techniker *</label>
              <select
                value={tr.technician_id}
                onChange={(e) => updateRange(i, "technician_id", e.target.value)}
                disabled={isReadOnly}
                required
                className="mt-1 w-full h-9 px-2 text-xs rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
              >
                <option value="">Auswählen…</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="min-w-0">
              <label className="text-[11px] font-medium text-muted-foreground">Von *</label>
              <Input type="time" value={tr.start} onChange={(e) => updateRange(i, "start", e.target.value)} disabled={isReadOnly} required className="mt-1 h-9 text-xs" />
            </div>
            <div className="min-w-0">
              <label className="text-[11px] font-medium text-muted-foreground">Bis *</label>
              <Input type="time" value={tr.end} onChange={(e) => updateRange(i, "end", e.target.value)} disabled={isReadOnly} required className="mt-1 h-9 text-xs" />
            </div>
            <div className="min-w-0">
              <label className="text-[11px] font-medium text-muted-foreground">Pause (Min) *</label>
              <Input type="number" min={0} step={5} value={tr.pause} onChange={(e) => updateRange(i, "pause", parseInt(e.target.value) || 0)} disabled={isReadOnly} required className="mt-1 h-9 text-xs" />
            </div>
          </div>
        </div>
      ))}
      {!isReadOnly && (
        <button
          type="button"
          onClick={addRange}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-dashed text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Weitere Stunden hinzufügen
        </button>
      )}
    </div>
  );
}
