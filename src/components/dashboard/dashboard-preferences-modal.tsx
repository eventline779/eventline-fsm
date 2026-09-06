"use client";

/**
 * DashboardPreferencesModal — Zahnrad-Modal fuer persoenliche
 * Widget-Sichtbarkeit + Reihenfolge im Dashboard.
 *
 * Bau-Modus: Drag-and-Drop mit ECHTER 1:1 Layout-Vorschau (kein Listen-
 * Kompromiss). Das Preview-Grid nutzt die selben col-span-Klassen wie
 * das echte Dashboard — der User sieht genau, wie sein Dashboard nach
 * dem Umsortieren aussehen wird.
 *
 * Datenmodell (Server, /api/dashboard + /api/dashboard/overrides):
 *   catalog        — alle Widgets die die Registry kennt (aus /api/dashboard).
 *   visibleIds     — die aktuell sichtbaren Widgets in ihrer Anzeige-Reihenfolge.
 *   overrides      — {hidden, widget_order} aus user_dashboard_overrides.
 *
 * DnD-Architektur (v3 — 2026-09-06, nach Video-Feedback):
 *
 *   Kern-Erkenntnis: @dnd-kit's SortableContext + rectSortingStrategy
 *   berechnet transform-Deltas fuer Auto-Reflow der Kacheln WAEHREND
 *   des Drags. Bei variablen Grid-Spans (col-span-4/6/12) sind diese
 *   Deltas systematisch falsch → Kacheln landen visuell an unmoeglichen
 *   Positionen (Video: "verzerrt den Rest, ueberlappt, ragt raus").
 *
 *   Neue Loesung — Sortable-Reflow komplett abschalten, Layout beim
 *   Drop sanft ueberblenden via View-Transitions-API:
 *
 *   1. WAEHREND DRAG: Grid ist eingefroren. Keine Kachel bewegt sich.
 *      Nur der Ghost am Cursor bewegt sich (DragOverlay).
 *   2. URSPRUNGS-SLOT: bleibt sichtbar als dashed Placeholder (accent
 *      Border, Content auf 25%). User sieht klar wo's herkommt.
 *   3. HOVER-TARGET: die Kachel unter dem Cursor bekommt einen accent-
 *      Ring + subtile Fuellung — User sieht LIVE wo der Drop landet.
 *   4. BEIM DROP: `document.startViewTransition` (moderne Browser) laesst
 *      den Browser selbst den Layout-Sprung sauber animieren — inklusive
 *      variabler Spans. Fallback: hartes Umschalten (aeltere Browser).
 *      Jede Kachel bekommt einen eindeutigen `view-transition-name`
 *      damit der Browser die Kachel ueber das Reorder hinweg
 *      identifizieren und animieren kann.
 *
 *   Verwendete dnd-kit-APIs: useDraggable + useDroppable pro Kachel,
 *   KEIN SortableContext, KEIN useSortable. Das ist der Grund warum
 *   das Layout stabil bleibt: die Bibliothek fasst das Grid gar nicht
 *   an.
 *
 * Weitere UX-Details:
 *   - PointerSensor mit 6px activation-distance (Klick auf Auge-Button
 *     wird NICHT als Drag interpretiert) + KeyboardSensor fuer a11y.
 *   - Body-Attribut data-dashboard-dragging setzt globalen grabbing-
 *     Cursor waehrend Drag.
 *   - Mobile-Vorschau-Toggle zwingt alle Kacheln auf col-span-12 →
 *     zeigt effektives Mobile-Layout.
 *   - Auge-Icon auf gezogener Kachel ausgeblendet — Placeholder clean.
 *   - Auto-Save debounced 400ms, Toast bei Fehler, "Fertig" flusht
 *     pending Save im Hintergrund und schliesst sofort.
 *
 * Server-Roundtrips:
 *   - GET    /api/dashboard/overrides  (nur beim Oeffnen)
 *   - PUT    /api/dashboard/overrides  (debounced 400ms bei Aenderung)
 *   - DELETE /api/dashboard/overrides  (bei Reset)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Briefcase,
  CalendarDays,
  ClipboardList,
  Clock,
  Eye,
  EyeOff,
  GripVertical,
  Handshake,
  Loader2,
  Monitor,
  PlayCircle,
  Receipt,
  RotateCcw,
  Smartphone,
  Users,
  Wallet,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { widgetSpanClass } from "@/lib/dashboard-widgets";

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

// ---------------------------------------------------------------------------
// Widget-Preview-Metadaten (Icons pro ID + Span-Auswahl).
// ---------------------------------------------------------------------------

const WIDGET_ICONS: Record<string, React.ReactNode> = {
  "kpi-offene-auftraege": <Briefcase className="h-4 w-4" />,
  "kpi-termine-woche": <CalendarDays className="h-4 w-4" />,
  "kpi-nicht-abgerechnet": <Receipt className="h-4 w-4" />,
  "overdue-jobs": <AlertCircle className="h-4 w-4" />,
  "zu-erledigen": <ClipboardList className="h-4 w-4" />,
  "team-status": <Users className="h-4 w-4" />,
  "anwesenheitskalender": <Users className="h-4 w-4" />,
  "ma-monat-stunden": <Clock className="h-4 w-4" />,
  "ma-prognose": <Wallet className="h-4 w-4" />,
  "ma-naechster-einsatz": <PlayCircle className="h-4 w-4" />,
  "partner-willkommen": <Handshake className="h-4 w-4" />,
};

function iconFor(id: string): React.ReactNode {
  return WIDGET_ICONS[id] ?? <ClipboardList className="h-4 w-4" />;
}

function spanFor(id: string, mobile: boolean): string {
  if (mobile) return "col-span-12";
  return widgetSpanClass(id);
}

/** Applies fn inside a View Transition if the browser supports it (Chromium,
 *  Safari 18+, Firefox 145+). Falls es nicht geht: fn direkt aufrufen. */
function withViewTransition(fn: () => void) {
  if (
    typeof document !== "undefined" &&
    "startViewTransition" in document &&
    typeof (document as unknown as { startViewTransition?: (cb: () => void) => unknown })
      .startViewTransition === "function"
  ) {
    (
      document as unknown as { startViewTransition: (cb: () => void) => unknown }
    ).startViewTransition(fn);
  } else {
    fn();
  }
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
  const [mobilePreview, setMobilePreview] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeSize, setActiveSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [overId, setOverId] = useState<string | null>(null);
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

        const orderedIds: string[] = [];
        const seen = new Set<string>();
        for (const id of visibleIds) {
          if (!catalogById.has(id)) continue;
          if (seen.has(id)) continue;
          seen.add(id);
          orderedIds.push(id);
        }

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
  // Debounced Auto-Save.
  // ------------------------------------------------------------------
  const persist = useCallback(async (payload: PreferenceItem[]) => {
    setSaving(true);
    try {
      const body = {
        hidden: payload.filter((i) => i.hidden).map((i) => i.id),
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

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // ------------------------------------------------------------------
  // Mutations
  // ------------------------------------------------------------------
  function toggleHidden(id: string) {
    setItems((prev) => {
      const next = prev.map((it) => (it.id === id ? { ...it, hidden: !it.hidden } : it));
      scheduleSave(next);
      return next;
    });
  }

  function setDraggingCursor(on: boolean) {
    if (typeof document === "undefined") return;
    if (on) document.body.setAttribute("data-dashboard-dragging", "true");
    else document.body.removeAttribute("data-dashboard-dragging");
  }

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string;
    setActiveId(id);
    const rect = event.active.rect.current.initial;
    if (rect) setActiveSize({ w: rect.width, h: rect.height });
    setDraggingCursor(true);
  }

  function handleDragOver(event: DragOverEvent) {
    const over = event.over;
    setOverId(over ? (over.id as string) : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setActiveSize(null);
    setOverId(null);
    setDraggingCursor(false);
    if (!over || active.id === over.id) return;
    // View-Transition umschliesst das setState → der Browser animiert das
    // Grid-Reorder inkl. variabler col-spans automatisch weich. Fallback:
    // hartes Umschalten (aeltere Browser). Sowohl der Reorder als auch
    // der scheduleSave() muessen VOR dem Ende der Transition passieren,
    // deshalb beides innerhalb des Callbacks.
    withViewTransition(() => {
      setItems((prev) => {
        const oldIdx = prev.findIndex((i) => i.id === active.id);
        const newIdx = prev.findIndex((i) => i.id === over.id);
        if (oldIdx === -1 || newIdx === -1) return prev;
        const next = [...prev];
        const [moved] = next.splice(oldIdx, 1);
        next.splice(newIdx, 0, moved);
        scheduleSave(next);
        return next;
      });
    });
  }

  function handleDragCancel(_event: DragCancelEvent) {
    setActiveId(null);
    setActiveSize(null);
    setOverId(null);
    setDraggingCursor(false);
  }

  useEffect(() => {
    return () => setDraggingCursor(false);
  }, []);

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
      if (!json.success) throw new Error(json.error ?? "Zurücksetzen fehlgeschlagen");
      dirtyRef.current = false;
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Zurücksetzen fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  function handleFinish() {
    const flush = saveTimer.current !== null;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      dirtyRef.current = false;
    }
    onClose();
    if (flush) {
      void persist(items).then(() => onSaved());
    } else {
      onSaved();
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinatesShim }),
  );

  const activeItem = useMemo(
    () => (activeId ? items.find((i) => i.id === activeId) ?? null : null),
    [activeId, items],
  );

  return (
    <Modal open={open} onClose={handleFinish} title="Dashboard anpassen" size="4xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Widgets verschieben, ausblenden oder Reihenfolge ändern — nur für dich sichtbar.
        </p>
        <PreviewToggle mobile={mobilePreview} onChange={setMobilePreview} />
      </div>

      {!loaded ? (
        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="grid grid-cols-12 gap-2">
            <Skeleton className="h-16 col-span-4" />
            <Skeleton className="h-16 col-span-4" />
            <Skeleton className="h-16 col-span-4" />
            <Skeleton className="h-16 col-span-12" />
            <Skeleton className="h-16 col-span-6" />
            <Skeleton className="h-16 col-span-6" />
          </div>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Keine Widgets verfuegbar.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div
            className="rounded-xl border p-3 transition-colors duration-200"
            style={{
              backgroundColor: activeId
                ? "color-mix(in oklab, var(--accent) 5%, var(--background))"
                : "color-mix(in oklab, var(--foreground) 3%, transparent)",
              borderColor: activeId
                ? "color-mix(in oklab, var(--accent) 30%, var(--border))"
                : undefined,
            }}
          >
            <div className="grid grid-cols-12 gap-2">
              {items.map((it) => (
                <GridTile
                  key={it.id}
                  item={it}
                  spanClass={spanFor(it.id, mobilePreview)}
                  onToggle={() => toggleHidden(it.id)}
                  isDragging={activeId === it.id}
                  isOverTarget={overId === it.id && activeId !== it.id}
                  anyDragActive={activeId !== null}
                />
              ))}
            </div>
          </div>

          <DragOverlay zIndex={1200} dropAnimation={null}>
            {activeItem && activeSize ? (
              <TileVisual
                item={activeItem}
                style={{
                  width: activeSize.w,
                  height: activeSize.h,
                  cursor: "grabbing",
                  transform: "rotate(1.5deg)",
                  boxShadow:
                    "0 24px 48px -8px rgba(0, 0, 0, 0.35), 0 8px 16px -4px rgba(0, 0, 0, 0.2)",
                  outline: "2px solid var(--accent)",
                  outlineOffset: "-1px",
                  backgroundColor: "var(--card)",
                }}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
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
          Auf Standard zurücksetzen
        </button>
        <button type="button" onClick={handleFinish} className="kasten kasten-red">
          Fertig
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// TileVisual — reine Darstellungs-Kachel. Wird von GridTile und vom
// DragOverlay verwendet, damit Ghost + Original 1:1 identisch aussehen.
// ---------------------------------------------------------------------------

function TileVisual({
  item,
  style,
  className,
  toggleButton,
  contentOpacity,
}: {
  item: PreferenceItem;
  style?: React.CSSProperties;
  className?: string;
  /** Auge-Button (Ausblenden/Einblenden). Wird IM Content-Flow rechts
   *  neben dem Titel gerendert, nicht absolute am Rand — sonst ragt der
   *  Button visuell aus der Kachel raus in den Grid-Gap. */
  toggleButton?: React.ReactNode;
  /** Wenn gesetzt: erzwingt Content-Opacity (Placeholder faded auf 25%). */
  contentOpacity?: number;
}) {
  const effOp =
    contentOpacity !== undefined ? contentOpacity : item.hidden ? 0.55 : 1;
  return (
    <div
      className={`relative rounded-lg border select-none overflow-hidden ${className ?? ""}`}
      style={{
        backgroundColor: item.hidden
          ? "color-mix(in oklab, var(--foreground) 4%, transparent)"
          : "var(--card)",
        ...style,
      }}
    >
      <div className="flex items-start gap-2 p-2.5 min-h-16">
        <span
          className="mt-0.5 shrink-0 text-muted-foreground/60"
          aria-hidden
          style={{ opacity: effOp }}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <div className="flex-1 min-w-0" style={{ opacity: effOp }}>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            <span className="text-accent shrink-0">{iconFor(item.id)}</span>
            <span className="truncate">{item.title}</span>
          </div>
          <div className="mt-1.5 h-2 rounded bg-muted-foreground/15 w-3/4" />
          <div className="mt-1 h-2 rounded bg-muted-foreground/10 w-1/2" />
        </div>
        {/* Auge-Button IM Flow rechts neben Titel/Bars. Klar innerhalb der
            Kachel-Grenzen, ragt nicht in den Grid-Gap. shrink-0 damit er
            auch in schmalen Kacheln (col-span-4) sichtbar bleibt. */}
        {toggleButton && <div className="shrink-0 -mt-0.5 -mr-0.5">{toggleButton}</div>}
      </div>

      {item.hidden && contentOpacity === undefined && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--background) 55%, transparent)",
          }}
        >
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            ausgeblendet
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GridTile — Kachel im echten col-span-Grid. Nutzt useDraggable +
// useDroppable OHNE SortableContext → keine Auto-Reflow-Transforms
// waehrend Drag, keine Layout-Verzerrung. Grid bleibt eingefroren bis
// zum Drop, dann uebernimmt startViewTransition (Parent) das
// weiche Reorder.
// ---------------------------------------------------------------------------

function GridTile({
  item,
  spanClass,
  onToggle,
  isDragging,
  isOverTarget,
  anyDragActive,
}: {
  item: PreferenceItem;
  spanClass: string;
  onToggle: () => void;
  isDragging: boolean;
  isOverTarget: boolean;
  anyDragActive: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({ id: item.id });
  const {
    setNodeRef: setDropRef,
    isOver,
  } = useDroppable({ id: item.id });
  const [hover, setHover] = useState(false);

  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      setDragRef(el);
      setDropRef(el);
    },
    [setDragRef, setDropRef],
  );

  // Kombinierter Over-Highlight-State: useDroppable's isOver ist zuverlaessig
  // fuer das Hover-Feedback, aber wir kombinieren es mit dem Parent-overId
  // fallback, damit auch der activeId-Fall (Kachel ueber sich selbst) OFF ist.
  const showOverRing = (isOver || isOverTarget) && !isDragging;

  const innerStyle: React.CSSProperties = {
    backgroundColor: isDragging
      ? "color-mix(in oklab, var(--accent) 6%, transparent)"
      : showOverRing
        ? "color-mix(in oklab, var(--accent) 10%, var(--card))"
        : !anyDragActive && hover
          ? "color-mix(in oklab, var(--foreground) 8%, var(--card))"
          : undefined,
    borderColor: isDragging
      ? "color-mix(in oklab, var(--accent) 55%, transparent)"
      : showOverRing
        ? "var(--accent)"
        : undefined,
    borderStyle: isDragging ? "dashed" : "solid",
    borderWidth: showOverRing ? "2px" : "1px",
    boxShadow: showOverRing
      ? "0 0 0 3px color-mix(in oklab, var(--accent) 22%, transparent)"
      : undefined,
    cursor: isDragging ? "grabbing" : "grab",
    touchAction: "none",
    // WICHTIG: transition NUR fuer Farb-/Border-States, NICHT fuer transform
    // — transform darf hier nichts machen, weil Grid nicht ge-reflow'd wird.
    // Der weiche Layout-Wechsel geschieht via startViewTransition beim Drop.
    transition:
      "background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
  };

  const toggleBtn = !isDragging ? (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={item.hidden ? "icon-btn" : "icon-btn icon-btn-green"}
      aria-label={item.hidden ? "Einblenden" : "Ausblenden"}
      data-tooltip={item.hidden ? "Einblenden" : "Ausblenden"}
      style={{ cursor: "pointer" }}
    >
      {item.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  ) : null;

  // WICHTIG: setNodeRef, attributes UND listeners liegen alle auf demselben
  // outer-div (kein separater absolute Handle-Layer). Der vorherige Ansatz
  // mit einer inneren absolute-inset-0-Layer war fragil, weil deren Parent
  // (h-full div in einer CSS-Grid-auto-Zelle) je nach Content 0-Hoehe
  // haben konnte → kein klickbares Feld, Drag ging gar nicht los.
  // Der Auge-Button liegt IM Content-Flow der TileVisual und stopt seinen
  // eigenen Pointer-Event → der Klick auf Auge triggert kein Drag.
  return (
    <div
      ref={setRefs}
      className={spanClass}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...attributes}
      {...listeners}
      // view-transition-name: Browser identifiziert die Kachel ueber das
      // Reorder hinweg und animiert automatisch von old-position zu
      // new-position (moderne Chrome/Edge/Safari 18+). Fallback: kein
      // Effekt, hartes Umschalten.
      style={{
        viewTransitionName: `widget-${item.id}`,
        cursor: isDragging ? "grabbing" : "grab",
      }}
      aria-label={`${item.title} verschieben`}
    >
      <TileVisual
        item={item}
        style={innerStyle}
        className="h-full"
        contentOpacity={isDragging ? 0.25 : undefined}
        toggleButton={toggleBtn}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kleine Segmented-Control fuer Mobile/Desktop-Vorschau. State-driven Hover
// pro Segment (CLAUDE.md §3).
// ---------------------------------------------------------------------------

function PreviewToggle({
  mobile,
  onChange,
}: {
  mobile: boolean;
  onChange: (mobile: boolean) => void;
}) {
  return (
    <div
      className="inline-flex items-center rounded-lg border p-0.5"
      role="group"
      aria-label="Vorschau-Modus"
    >
      <SegBtn active={!mobile} onClick={() => onChange(false)} icon={<Monitor className="h-3.5 w-3.5" />}>
        Desktop
      </SegBtn>
      <SegBtn active={mobile} onClick={() => onChange(true)} icon={<Smartphone className="h-3.5 w-3.5" />}>
        Mobil
      </SegBtn>
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors"
      aria-pressed={active}
      style={{
        backgroundColor: active
          ? "color-mix(in oklab, var(--foreground) 10%, transparent)"
          : hover
            ? "color-mix(in oklab, var(--foreground) 5%, transparent)"
            : "transparent",
        color: active ? "var(--foreground)" : "var(--muted-foreground)",
        fontWeight: active ? 600 : 500,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

// KeyboardSensor Coordinate-Getter — flach, ohne SortableContext, weil wir
// den Sort selbst machen. Rueckt den Fokus fuer arrow-keys um 20px in die
// Richtung — dnd-kit KeyboardSensor braucht das als "Bewegungsvorschlag"
// wenn kein SortableContext den naechsten Slot berechnet.
function sortableKeyboardCoordinatesShim(
  event: KeyboardEvent,
  args: { currentCoordinates: { x: number; y: number } },
) {
  const { currentCoordinates } = args;
  switch (event.code) {
    case "ArrowRight":
      return { x: currentCoordinates.x + 25, y: currentCoordinates.y };
    case "ArrowLeft":
      return { x: currentCoordinates.x - 25, y: currentCoordinates.y };
    case "ArrowDown":
      return { x: currentCoordinates.x, y: currentCoordinates.y + 25 };
    case "ArrowUp":
      return { x: currentCoordinates.x, y: currentCoordinates.y - 25 };
  }
  return undefined;
}
