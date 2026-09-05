"use client";

/**
 * DashboardPreferencesModal — Zahnrad-Modal fuer persoenliche
 * Widget-Sichtbarkeit + Reihenfolge im Dashboard.
 *
 * Datenmodell (Server, /api/dashboard + /api/dashboard/overrides):
 *   catalog        — alle Widgets die die Registry kennt (aus /api/dashboard).
 *   visibleIds     — die aktuell sichtbaren Widgets in ihrer Anzeige-Reihenfolge
 *                    (Server hat bereits Rollen- + Permission- + User-Filter
 *                    angewendet).
 *   overrides      — {hidden, widget_order} aus user_dashboard_overrides
 *                    (leerer Default falls kein Eintrag existiert).
 *
 * Modal-Set (welche Zeilen der User ueberhaupt sieht):
 *   Wir zeigen nur Widgets die der User theoretisch sehen darf — d.h.
 *   `visibleIds ∪ overrides.hidden`. Widgets, die der User aufgrund Rollen-
 *   Restriction oder fehlender Permission NIE bekommt, tauchen erst gar
 *   nicht auf — sonst koennte der User "Geister-Widgets" aktivieren, die
 *   trotzdem serverseitig gefiltert werden. Die einzige Ausnahme sind
 *   Widgets die der User frueher hatte (heute in overrides.hidden) —
 *   die zeigen wir, damit er sie zurueckholen kann.
 *
 * Reihenfolge im Modal:
 *   1) Sichtbare Widgets in visibleIds-Reihenfolge
 *   2) Hidden Widgets (aus overrides.hidden ∩ catalog) am Ende, in
 *      overrides.widget_order-Reihenfolge, danach Registry-Reihenfolge.
 *
 * Steuerung:
 *   - Reihenfolge via ChevronUp/ChevronDown pro Zeile (robust ohne
 *     dnd-kit-Dependency; app-konsistent mit Rollen-Tab).
 *   - Sichtbarkeit via Eye/EyeOff-icon-btn (state-driven Hover per useState,
 *     CLAUDE.md §3).
 *   - Auto-Save debounced 400ms bei Aenderung — kein "Speichern"-Button;
 *     Server-Fehler landen als Toast (CLAUDE.md §7).
 *   - "Auf Standard zuruecksetzen" = DELETE /api/dashboard/overrides.
 *   - "Fertig" flusht pending Save und triggert Parent-Refetch.
 *
 * Server-Roundtrips:
 *   - GET  /api/dashboard/overrides  (nur beim Oeffnen)
 *   - PUT  /api/dashboard/overrides  (debounced 400ms bei Aenderung)
 *   - DELETE /api/dashboard/overrides (bei Reset)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";

interface CatalogItem {
  id: string;
  title: string;
  requires: string[];
}

interface PreferenceItem {
  id: string;
  title: string;
  hidden: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Wird gerufen wenn Overrides sich potenziell geaendert haben — der
   *  Parent soll dann /api/dashboard neu laden. */
  onSaved: () => void;
  /** widget_catalog aus /api/dashboard — komplette Registry. */
  catalog: CatalogItem[];
  /** widgets aus /api/dashboard — aktuell sichtbare IDs in Anzeige-Reihenfolge. */
  visibleIds: string[];
}

export function DashboardPreferencesModal({
  open,
  onClose,
  onSaved,
  catalog,
  visibleIds,
}: Props) {
  const [items, setItems] = useState<PreferenceItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ------------------------------------------------------------------
  // Load overrides + compose modal-set beim Oeffnen.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoaded(false);
    dirtyRef.current = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/overrides", { credentials: "include" });
        const json = (await res.json()) as {
          success?: boolean;
          hidden?: string[];
          widget_order?: string[];
          error?: string;
        };
        if (cancelled) return;
        if (!json.success) {
          toast.error(json.error ?? "Einstellungen konnten nicht geladen werden");
          setItems([]);
          setLoaded(true);
          return;
        }
        const userHidden = new Set(json.hidden ?? []);
        const userOrder = json.widget_order ?? [];
        const catalogById = new Map(catalog.map((c) => [c.id, c]));

        // Sichtbare in genau der Reihenfolge in der der Server sie liefert,
        // gefiltert auf bekannte Katalog-Eintraege (Robustheit gegen
        // Registry-Drift).
        const orderedIds: string[] = [];
        const seen = new Set<string>();
        for (const id of visibleIds) {
          if (!catalogById.has(id)) continue;
          if (seen.has(id)) continue;
          seen.add(id);
          orderedIds.push(id);
        }

        // Hidden-Anhang: nur was der User bewusst versteckt hat und was
        // im Katalog existiert — plus die User-Order fuer stabile Position
        // beim spaeteren Un-Hide.
        const hiddenCandidates = Array.from(userHidden).filter(
          (id) => catalogById.has(id) && !seen.has(id),
        );
        const orderedHidden = [
          ...userOrder.filter((id) => hiddenCandidates.includes(id)),
          ...hiddenCandidates.filter((id) => !userOrder.includes(id)),
        ];
        for (const id of orderedHidden) {
          if (seen.has(id)) continue;
          seen.add(id);
          orderedIds.push(id);
        }

        const composed: PreferenceItem[] = orderedIds.map((id) => ({
          id,
          title: catalogById.get(id)!.title,
          hidden: userHidden.has(id),
        }));
        setItems(composed);
        setLoaded(true);
      } catch (e) {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : "Netzwerk-Fehler");
        setItems([]);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, catalog, visibleIds]);

  // ------------------------------------------------------------------
  // Debounced Auto-Save. Setzt dirtyRef=false erst nach erfolgreichem PUT,
  // damit ein weiterer Klick waehrend Save als "neue Aenderung" zaehlt.
  // ------------------------------------------------------------------
  const persist = useCallback(async (payload: PreferenceItem[]) => {
    setSaving(true);
    try {
      const body = {
        hidden: payload.filter((i) => i.hidden).map((i) => i.id),
        // widget_order enthaelt ALLE Items (sichtbar + versteckt) in
        // aktueller Modal-Reihenfolge — sonst geht die Position eines
        // hidden-Widgets verloren, wenn der User es spaeter re-aktiviert.
        widget_order: payload.map((i) => i.id),
      };
      const res = await fetch("/api/dashboard/overrides", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? "Speichern fehlgeschlagen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }, []);

  const scheduleSave = useCallback(
    (next: PreferenceItem[]) => {
      dirtyRef.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        dirtyRef.current = false;
        void persist(next);
      }, 400);
    },
    [persist],
  );

  // Cleanup pending Save-Timer beim Unmount.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // ------------------------------------------------------------------
  // Mutations
  // ------------------------------------------------------------------
  function move(idx: number, delta: -1 | 1) {
    setItems((prev) => {
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      scheduleSave(next);
      return next;
    });
  }

  function toggleHidden(idx: number) {
    setItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? { ...it, hidden: !it.hidden } : it));
      scheduleSave(next);
      return next;
    });
  }

  async function resetToDefault() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/dashboard/overrides", {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!json.success) throw new Error(json.error ?? "Zuruecksetzen fehlgeschlagen");
      dirtyRef.current = false;
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Zuruecksetzen fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  async function handleFinish() {
    // Pending Save flushen, danach Parent-Refetch triggern und schliessen.
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      dirtyRef.current = false;
      await persist(items);
    }
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={handleFinish} title="Dashboard anpassen" size="md">
      <p className="text-xs text-muted-foreground">
        Blende Widgets aus oder aendere die Reihenfolge — nur fuer dich sichtbar.
      </p>

      {!loaded ? (
        <div className="space-y-1.5">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Keine Widgets verfuegbar.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, idx) => (
            <PreferenceRow
              key={it.id}
              item={it}
              isFirst={idx === 0}
              isLast={idx === items.length - 1}
              onUp={() => move(idx, -1)}
              onDown={() => move(idx, 1)}
              onToggle={() => toggleHidden(idx)}
            />
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 pt-3 border-t">
        <button
          type="button"
          onClick={resetToDefault}
          disabled={saving}
          className="kasten kasten-muted"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          Auf Standard zuruecksetzen
        </button>
        <button type="button" onClick={handleFinish} className="kasten kasten-red">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Fertig
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Zeile im Modal — state-driven Hover (CLAUDE.md §3, Tailwind `hover:` greift
// hier unzuverlaessig).
// ---------------------------------------------------------------------------

function PreferenceRow({
  item,
  isFirst,
  isLast,
  onUp,
  onDown,
  onToggle,
}: {
  item: PreferenceItem;
  isFirst: boolean;
  isLast: boolean;
  onUp: () => void;
  onDown: () => void;
  onToggle: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <li
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors"
      style={{
        backgroundColor: hover
          ? "color-mix(in oklab, var(--foreground) 5%, transparent)"
          : "transparent",
      }}
    >
      <span className="text-muted-foreground/40 shrink-0" aria-hidden>
        <GripVertical className="h-4 w-4" />
      </span>
      <span
        className="flex-1 truncate"
        style={{ opacity: item.hidden ? 0.55 : 1 }}
      >
        {item.title}
      </span>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onUp}
          disabled={isFirst}
          className="icon-btn"
          aria-label="Nach oben"
          data-tooltip="Nach oben"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDown}
          disabled={isLast}
          className="icon-btn"
          aria-label="Nach unten"
          data-tooltip="Nach unten"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className={item.hidden ? "icon-btn" : "icon-btn icon-btn-green"}
          aria-label={item.hidden ? "Einblenden" : "Ausblenden"}
          data-tooltip={item.hidden ? "Einblenden" : "Ausblenden"}
        >
          {item.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </li>
  );
}
