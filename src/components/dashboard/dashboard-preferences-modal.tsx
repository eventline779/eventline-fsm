"use client";

/**
 * DashboardPreferencesModal — Zahnrad-Modal fuer persoenliche
 * Widget-Sichtbarkeit + Reihenfolge im Dashboard.
 *
 * Bau-Modus: Drag-and-Drop mit Live-Vorschau (Mini-Dashboard-Grid).
 *
 * Datenmodell (Server, /api/dashboard + /api/dashboard/overrides):
 *   catalog        — alle Widgets die die Registry kennt (aus /api/dashboard).
 *   visibleIds     — die aktuell sichtbaren Widgets in ihrer Anzeige-Reihenfolge
 *                    (Server hat bereits Rollen- + Permission- + User-Filter
 *                    angewendet).
 *   overrides      — {hidden, widget_order} aus user_dashboard_overrides
 *                    (leerer Default falls kein Eintrag existiert).
 *
 * Modal-Set (welche Widgets der User ueberhaupt sieht):
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
 * Steuerung (Pro-DnD, refactored 2026-09-06 — nach Feedback "verschwindet
 * beim Draggen, verzerrt den Rest"):
 *   - Reihenfolge via @dnd-kit/core + sortable MIT DragOverlay. Grund:
 *     das Preview-Grid hat variable Spans (col-span-4/6/12); ohne Overlay
 *     springt das gezogene Element beim Layout-Reflow — mit Overlay bleibt
 *     ein sichtbarer Placeholder an der Ursprungsposition und ein Ghost
 *     folgt dem Cursor. Alle anderen Kacheln gleiten in ihre neue Position.
 *   - Ursprungs-Slot ist ein SICHTBARER dashed Placeholder (opacity 0.35 +
 *     dashed accent border). Frueher unsichtbar per opacity:0 — dann fuehlte
 *     sich der Drag an als waere das Widget "weg". Jetzt ist immer klar wo
 *     das Widget hingehoert (Ghost am Cursor, Placeholder im Grid).
 *   - Ghost hat rotate 1.5deg, tiefen Shadow, accent-Border → sieht optisch
 *     "hochgehoben" aus (Linear/Notion-Muster). Kein leichter "scale" mehr —
 *     Rotation liest sich besser als "in-motion" als eine schlichte Skalierung.
 *   - Drop-Target-Highlight: der Slot unter dem Cursor bekommt einen
 *     accent-farbenen Ring + subtiles Background-Tint → User sieht LIVE wohin
 *     die Kachel landen wird, nicht erst nach dem Drop.
 *   - Grid-Container bekommt beim Drag einen leichten Ambient-Tint (heller
 *     Backdrop) → visuell klar "Drag-Modus aktiv".
 *   - Cursor state-driven getrennt: idle=grab, drag=grabbing (auf ganzer
 *     Kachel via body.data-dashboard-dragging Attribut).
 *   - PointerSensor (activation-distance 6px, sonst wuerde ein Klick auf
 *     den Auge-Button faelschlicherweise als Drag gewertet) + KeyboardSensor
 *     fuer Screenreader/Tastatur-Nutzer.
 *   - Sichtbarkeit via Eye/EyeOff-icon-btn im Widget-Kopf; hidden Widgets
 *     bleiben in der Reihenfolge, werden aber ausgegraut + mit Overlay
 *     markiert (User sieht wo sie wieder auftauchen wuerden).
 *   - Mobile-Vorschau-Toggle: zwingt alle Widgets im Preview auf volle
 *     Breite (1 Spalte), so sieht der User das effektive Mobile-Layout.
 *   - Auto-Save debounced 400ms bei Aenderung — kein "Speichern"-Button;
 *     Server-Fehler landen als Toast (CLAUDE.md § "sofortiges Ladefeedback").
 *   - "Auf Standard zuruecksetzen" = DELETE /api/dashboard/overrides.
 *   - "Fertig" schliesst das Modal SOFORT und flusht pending Save im
 *     Hintergrund; onSaved() feuert erst nach abgeschlossenem PUT damit
 *     der Parent-Refetch die aktuellen Overrides sieht.
 *
 * Vorschau vs. echtes Dashboard:
 *   Die Preview-Bausteine sind Layout-Vorschauen: Titel + Icon + Span-
 *   Groesse (col-span-4 / col-span-6 / col-span-12), NICHT die volle
 *   Widget-Renderung. Damit bleibt das Modal schnell (keine API-Requests
 *   pro Widget) und passt auch bei kleinem Viewport in den Modal-Rahmen.
 *   Die Span-Klassen kommen aus dashboard-widgets.ts — Single-Source-of-
 *   Truth, dieselbe Konstante die dashboard/page.tsx nutzt.
 *
 * Server-Roundtrips:
 *   - GET  /api/dashboard/overrides  (nur beim Oeffnen)
 *   - PUT  /api/dashboard/overrides  (debounced 400ms bei Aenderung)
 *   - DELETE /api/dashboard/overrides (bei Reset)
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
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
// Widget-Preview-Metadaten. Span kommt aus dashboard-widgets.ts (Single-Source
// of Truth) — dieselbe Konstante die dashboard/page.tsx nutzt. Icons hingegen
// leben hier lokal, weil sie React-Nodes sind (Registry ist reine Config).
// ---------------------------------------------------------------------------

/** Icon pro Widget — identisch zu Dashboard-Renderern. Fehlender Eintrag
 *  faellt auf einen neutralen Punkt zurueck (siehe iconFor). */
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

/** Gemeinsame Transition-Kurve fuer DnD-Reflow + Drop-Animation. Cubic-Bezier
 *  ist ease-out (schnell raus, sanft rein) — matcht wie Notion/Linear ihre
 *  Sortable-Elemente animieren. Duration bewusst kurz (220ms), damit der
 *  Reflow direkt reagiert, aber nicht ruckelt. */
const DND_TRANSITION = {
  duration: 220,
  easing: "cubic-bezier(0.25, 1, 0.5, 1)",
} as const;

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
  // activeId + activeSize werden waehrend Drag gesetzt, damit die DragOverlay-
  // Ghost-Kachel die exakte Groesse der Ursprungskachel bekommt (sonst rendert
  // Overlay in einer beliebigen Default-Groesse und "hopst" beim Drag-Start).
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeSize, setActiveSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  // overId = die Kachel unter dem Cursor waehrend Drag. Wird per onDragOver
  // upgedated und getriggert live das Drop-Target-Highlight (accent-Ring auf
  // dem Ziel-Slot). Ohne das muesste der User raten wohin sein Drop landet.
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
  function toggleHidden(id: string) {
    setItems((prev) => {
      const next = prev.map((it) => (it.id === id ? { ...it, hidden: !it.hidden } : it));
      scheduleSave(next);
      return next;
    });
  }

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string;
    setActiveId(id);
    // Ursprungs-Rect merken → DragOverlay-Ghost hat exakt die Zielgroesse
    // (initial = vor Layout-Shift, sonst waere die Groesse schon 0 wenn
    // andere Kacheln in die Luecke rutschen).
    const rect = event.active.rect.current.initial;
    if (rect) setActiveSize({ w: rect.width, h: rect.height });
    // Body-Attribut fuer Cursor-State: grabbing ueberall waehrend Drag,
    // damit auch das Modal-Backdrop einen konsistenten Cursor zeigt.
    if (typeof document !== "undefined") {
      document.body.setAttribute("data-dashboard-dragging", "true");
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const over = event.over;
    setOverId(over ? (over.id as string) : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    setActiveSize(null);
    setOverId(null);
    if (typeof document !== "undefined") {
      document.body.removeAttribute("data-dashboard-dragging");
    }
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIdx = prev.findIndex((i) => i.id === active.id);
      const newIdx = prev.findIndex((i) => i.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return prev;
      const next = arrayMove(prev, oldIdx, newIdx);
      scheduleSave(next);
      return next;
    });
  }

  function handleDragCancel(_event: DragCancelEvent) {
    setActiveId(null);
    setActiveSize(null);
    setOverId(null);
    if (typeof document !== "undefined") {
      document.body.removeAttribute("data-dashboard-dragging");
    }
  }

  // Cleanup body-attribut wenn Modal unmounted waehrend Drag lief
  useEffect(() => {
    return () => {
      if (typeof document !== "undefined") {
        document.body.removeAttribute("data-dashboard-dragging");
      }
    };
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
    // Modal SOFORT schliessen (kein blockierender Spinner). Wenn noch ein
    // debounced Save pending ist, schicken wir ihn im Hintergrund und
    // triggern onSaved erst NACH dem PUT — sonst refetcht der Parent
    // /api/dashboard vor dem Update und sieht kurz die alten Overrides.
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

  // dnd-kit Sensoren: PointerSensor mit kleiner Aktivierungs-Distanz, damit
  // ein reiner Klick auf den Auge-Button NICHT als Drag interpretiert wird.
  // KeyboardSensor fuer Screenreader/Tastatur-Nutzer.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortableIds = useMemo(() => items.map((i) => i.id), [items]);
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
          // pointerWithin ist praeziser als closestCenter bei variablen
          // Grid-Spans (col-span-4 vs col-span-12): das Hover-Target ist
          // immer die Kachel unter dem Pointer, nicht die naechstliegende
          // Mitte — sonst schwankt das Drop-Target waehrend der User
          // ueber eine breite Kachel hinweg zieht.
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
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
                  <SortablePreviewTile
                    key={it.id}
                    item={it}
                    spanClass={spanFor(it.id, mobilePreview)}
                    onToggle={() => toggleHidden(it.id)}
                    isActive={activeId === it.id}
                    isOverTarget={overId === it.id && activeId !== it.id}
                    anyDragActive={activeId !== null}
                  />
                ))}
              </div>
            </div>
          </SortableContext>

          {/* DragOverlay = die frei schwebende Ghost-Kachel. Erbt Groesse der
              Original-Kachel (activeSize) und rendert mit tiefen Shadow +
              leichter Rotation (1.5deg) + accent-Border — signalisiert
              "hochgehoben, wird bewegt". Rotation liest sich als "in-motion"
              besser als eine schlichte Skalierung (Linear/Notion-Muster).
              dropAnimation gleitet die Ghost sanft in die Zielposition. */}
          <DragOverlay
            zIndex={1200}
            dropAnimation={{
              duration: DND_TRANSITION.duration,
              easing: DND_TRANSITION.easing,
            }}
          >
            {activeItem && activeSize ? (
              <PreviewTileVisual
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
// PreviewTileVisual — reine Darstellungs-Kachel. Wird sowohl von der
// sortable Wrapper-Component als auch vom DragOverlay verwendet, damit
// Ghost + Original 1:1 identisch aussehen (keine "Sprung"-Effekte beim
// Wechsel zwischen Sortable-Kachel und Overlay-Kachel).
// ---------------------------------------------------------------------------

function PreviewTileVisual({
  item,
  style,
  className,
  extraTop,
  contentOpacity,
}: {
  item: PreferenceItem;
  style?: React.CSSProperties;
  className?: string;
  /** Slot fuer die Sortable-Wrapper — z.B. dnd-kit listeners auf dem
   *  Kachel-Body. Overlay laesst das leer. */
  extraTop?: React.ReactNode;
  /** Wenn gesetzt: erzwingt die Content-Opacity (Titel/Icon/Bars). Wird vom
   *  Placeholder-State genutzt (dashed Slot, waehrend Ghost am Cursor haengt)
   *  um den Text auf ~25% zu faden ohne den Border/BG mitzuziehen. */
  contentOpacity?: number;
}) {
  const effectiveContentOpacity =
    contentOpacity !== undefined ? contentOpacity : item.hidden ? 0.55 : 1;
  return (
    <div
      className={`relative rounded-lg border select-none ${className ?? ""}`}
      style={{
        backgroundColor: item.hidden
          ? "color-mix(in oklab, var(--foreground) 4%, transparent)"
          : "var(--card)",
        ...style,
      }}
    >
      {extraTop}
      <div className="flex items-start gap-2 p-2.5 min-h-16">
        <span
          className="mt-0.5 shrink-0 text-muted-foreground/60"
          aria-hidden
          style={{ opacity: effectiveContentOpacity }}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <div
          className="flex-1 min-w-0"
          style={{ opacity: effectiveContentOpacity }}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            <span className="text-accent shrink-0">{iconFor(item.id)}</span>
            <span className="truncate">{item.title}</span>
          </div>
          <div className="mt-1.5 h-2 rounded bg-muted-foreground/15 w-3/4" />
          <div className="mt-1 h-2 rounded bg-muted-foreground/10 w-1/2" />
        </div>
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
// SortablePreviewTile — dnd-kit-Wrapper. Rendert die Kachel im Grid, haengt
// Drag-Listener aufs Body (nicht auf den Auge-Button — sonst wuerde ein
// Klick als Drag-Start missinterpretiert). Waehrend Drag: Body ist ein
// blasser Platzhalter, echter Inhalt wird per DragOverlay gerendert.
// ---------------------------------------------------------------------------

function SortablePreviewTile({
  item,
  spanClass,
  onToggle,
  isActive,
  isOverTarget,
  anyDragActive,
}: {
  item: PreferenceItem;
  spanClass: string;
  onToggle: () => void;
  isActive: boolean;
  /** Cursor hovert gerade ueber DIESER Kachel waehrend Drag → Drop-Target-Ring */
  isOverTarget: boolean;
  /** Irgendwer wird gerade gedraggt (dann Hover-Boosts unterdruecken) */
  anyDragActive: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    // Explizite Transition-Kurve fuer den Layout-Reflow der NICHT-gezogenen
    // Kacheln. dnd-kit-Default (250ms cubic-bezier) waere ok, aber wir
    // teilen die Konstante mit der DragOverlay-Drop-Animation — konsistente
    // Bewegung ueber alle Elemente hinweg.
    transition: {
      duration: DND_TRANSITION.duration,
      easing: DND_TRANSITION.easing,
    },
  });
  const [hover, setHover] = useState(false);

  // Waehrend Drag: die Kachel bleibt SICHTBAR als dashed Placeholder
  // (frueher opacity:0 — hat sich angefuehlt als waere das Widget "weg").
  // Der Ghost am Cursor UND der Placeholder im Grid zusammen sagen dem User
  // klar: "das Widget ist da (Ghost), gehoert hierhin (Placeholder), landet
  // dort (Drop-Target-Ring)". Layout-technisch bleibt der Slot besetzt.
  const wrapperStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Innerer Look:
  // - isDragging: dashed accent-Border + faded Content → sichtbarer Placeholder
  // - isOverTarget: accent-Ring + subtile accent-BG → "hier landet der Drop"
  // - hover (idle): dezenter foreground-Tint
  const innerStyle: React.CSSProperties = {
    backgroundColor: isDragging
      ? "color-mix(in oklab, var(--accent) 6%, transparent)"
      : isOverTarget
        ? "color-mix(in oklab, var(--accent) 10%, var(--card))"
        : !anyDragActive && hover
          ? "color-mix(in oklab, var(--foreground) 8%, var(--card))"
          : undefined,
    borderColor: isDragging
      ? "color-mix(in oklab, var(--accent) 55%, transparent)"
      : isOverTarget
        ? "var(--accent)"
        : undefined,
    borderStyle: isDragging ? "dashed" : "solid",
    borderWidth: isOverTarget && !isDragging ? "2px" : "1px",
    boxShadow: isOverTarget && !isDragging
      ? "0 0 0 3px color-mix(in oklab, var(--accent) 22%, transparent)"
      : undefined,
    cursor: isActive ? "grabbing" : "grab",
    // Touch-Action: pan-y ist Standard-Scroll; wir muessen es hier
    // deaktivieren, sonst schluckt der Browser den Drag-Gesture auf Mobile.
    touchAction: "none",
    // Weiche Farb-/Border-Transition wenn Drag-Target wechselt (nur
    // background+border, NICHT transform — das haengt an dnd-kit).
    transition:
      "background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
  };

  return (
    <div
      ref={setNodeRef}
      className={spanClass}
      style={wrapperStyle}
    >
      <PreviewTileVisual
        item={item}
        style={innerStyle}
        className="h-full"
        contentOpacity={isDragging ? 0.25 : undefined}
        extraTop={
          <>
            {/* Drag-Handle-Layer: fuellt die ganze Kachel, faengt Pointer/Key-
                Events fuer dnd-kit. Absolut positioniert damit der Auge-Button
                DARUEBER stehen kann (button liegt in einer eigenen Layer und
                stopt Propagation). */}
            <div
              className="absolute inset-0 rounded-lg"
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}
              {...attributes}
              {...listeners}
              aria-label={`${item.title} verschieben`}
            />
            {/* Auge-Button: eigene Layer ueber dem Drag-Handle, damit Klick
                den Handle nicht triggert. Waehrend Drag verstecken wir ihn,
                damit der Placeholder minimal-clean aussieht (kein irritierender
                Toggle-Button auf einer "weg-gezogenen" Kachel). */}
            {!isDragging && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
                className={
                  item.hidden
                    ? "icon-btn absolute right-2 top-2 z-10"
                    : "icon-btn icon-btn-green absolute right-2 top-2 z-10"
                }
                aria-label={item.hidden ? "Einblenden" : "Ausblenden"}
                data-tooltip={item.hidden ? "Einblenden" : "Ausblenden"}
                style={{ cursor: "pointer" }}
              >
                {item.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            )}
          </>
        }
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
