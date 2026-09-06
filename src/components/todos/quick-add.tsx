"use client";

/**
 * Quick-Add — immer-sichtbares Ein-Zeilen-Input direkt unter der Filter-
 * Leiste. Enter = sofort speichern mit Defaults (assignee=self,
 * due_date=heute+7, priority=normal). Chips daneben oeffnen kleine
 * Popovers zum Ueberschreiben der Defaults.
 *
 * "Weniger als Kasten anklicken -> Modal -> Formular" — dies IST die
 * Standard-Erstell-Interaktion. Wer Beschreibung/Anhaenge braucht,
 * klickt den "Detailliert anlegen"-Button oben (der weiter das
 * bestehende Voll-Formular oeffnet).
 */

import { useState, useRef, useEffect } from "react";
import { Plus, User, Calendar, AlertCircle, Loader2 } from "lucide-react";
import { DatePopover } from "./date-popover";
import { SearchableSelect } from "@/components/searchable-select";
import { createPortal } from "react-dom";
import { addDaysIso, todayIso, relativeDueLabel } from "@/lib/relative-date";
import type { Profile } from "@/types";

interface Props {
  profiles: Profile[];
  meProfileId: string;
  meProfileName: string;
  disabled?: boolean;
  onCreate: (payload: {
    title: string;
    dueDate: string | null;
    assignedTo: string;
    urgent: boolean;
  }) => Promise<void>;
}

function AssigneePopover({
  value, options, onChange, children,
}: {
  value: string;
  options: Profile[];
  onChange: (id: string) => void;
  children: (opts: { open: () => void; isOpen: boolean }) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function measure() {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = 260;
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      setPos({ top: r.bottom + 6, left, width });
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

  const popover = open && pos && typeof document !== "undefined" ? createPortal(
    <div
      ref={popRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
      className="z-[1200] rounded-xl border border-border bg-popover shadow-lg p-2"
      onClick={(e) => e.stopPropagation()}
    >
      <SearchableSelect
        value={value}
        onChange={(id) => { onChange(id); setOpen(false); }}
        items={options.map((p) => ({ id: p.id, label: p.full_name }))}
        clearable={false}
        placeholder="Person auswaehlen ..."
      />
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

export function QuickAdd({ profiles, meProfileId, meProfileName, disabled, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(meProfileId);
  const [due, setDue] = useState<string | null>(addDaysIso(todayIso(), 7));
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const assigneeName = assignee === meProfileId
    ? "mich"
    : (profiles.find((p) => p.id === assignee)?.full_name ?? "?");

  const dueLabel = due ? relativeDueLabel(due).label : "Ohne Datum";

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onCreate({
        title: t,
        dueDate: due,
        assignedTo: assignee || meProfileId,
        urgent,
      });
      // Nach Erstellen: Titel zuruecksetzen, Chips (Assignee/Datum/Urgent)
      // BEIBEHALTEN — wenn jemand 5 Todos an X mit Faellig-morgen macht,
      // moechte er nicht jedes Mal die Chips neu setzen.
      setTitle("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className={`flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 transition-colors ${
        disabled ? "opacity-60 pointer-events-none" : "focus-within:border-foreground/30"
      }`}
    >
      <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Was ist zu tun? — Enter zum Speichern"
        className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
        disabled={busy}
        // Quick-Add ist Enter=Submit (der globale useEnterAsTab-Hook
        // greift nur wenn der Handler NICHT preventDefault ruft; native
        // <form>-Submit ruft preventDefault via unser submit()).
      />

      <AssigneePopover value={assignee} options={profiles} onChange={setAssignee}>
        {({ open, isOpen }) => (
          <button
            type="button"
            onClick={open}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
              isOpen || assignee !== meProfileId
                ? "bg-foreground/[0.06] text-foreground"
                : "text-muted-foreground hover:bg-foreground/[0.06]"
            }`}
            data-tooltip="Zuweisen"
          >
            <User className="h-3.5 w-3.5" />
            <span className="max-w-[80px] truncate">{assigneeName}</span>
          </button>
        )}
      </AssigneePopover>

      <DatePopover value={due} onChange={setDue}>
        {({ open, isOpen }) => (
          <button
            type="button"
            onClick={open}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
              isOpen ? "bg-foreground/[0.06] text-foreground" : "text-muted-foreground hover:bg-foreground/[0.06]"
            }`}
            data-tooltip="Faellig ..."
          >
            <Calendar className="h-3.5 w-3.5" />
            <span className="max-w-[110px] truncate">{dueLabel}</span>
          </button>
        )}
      </DatePopover>

      <button
        type="button"
        onClick={() => setUrgent((u) => !u)}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
          urgent
            ? "text-red-700 dark:text-red-300 bg-red-500/10"
            : "text-muted-foreground hover:bg-foreground/[0.06]"
        }`}
        data-tooltip="Als dringend markieren"
      >
        <AlertCircle className="h-3.5 w-3.5" />
        {urgent ? "Dringend" : "Normal"}
      </button>

      <button
        type="submit"
        disabled={!title.trim() || busy}
        className="kasten kasten-blue shrink-0"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Anlegen"}
      </button>
      {/* meProfileName ist Prop damit der Assignee-Chip beim Rendern kein
          Extra-Fetch braucht — wird aktuell in "mich" collapsed, aber
          bewusst als Prop mitgereicht falls wir spaeter "an mich (Leo)"
          zeigen wollen. */}
      <span className="hidden" aria-hidden>{meProfileName}</span>
    </form>
  );
}
