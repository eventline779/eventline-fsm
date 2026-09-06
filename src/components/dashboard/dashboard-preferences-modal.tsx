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
 * Steuerung (Pro-DnD v2, refactored 2026-09-06 nach Video-Feedback
 * "man kann es so nicht gebrauchen"):
 *   - DARSTELLUNG: vertikale Liste, EINE Kachel pro Zeile, uniforme Zeilen-
 *     hoehe. Frueher waren die Kacheln in einem 12-col-Grid mit variablen
 *     col-spans (4/6/12); @dnd-kit's rectSortingStrategy berechnet aber
 *     Transform-Deltas basierend auf uniformer Zellgroesse → bei variablen
 *     Spans landen Kacheln waehrend Drag an unmoeglichen Positionen und
 *     ueberlappen sich (Video-Beweis). Uniforme Liste + verticalListSorting
 *     macht das Layout stabil (Muster: Notion-Widgets, macOS Widget-Editor).
 *   - Die tatsaechliche Layout-Breite (1/3, 1/2, 2/3, Voll) bleibt sichtbar
 *     als kleines Badge + Balken-Icon rechts an jeder Zeile — der User
 *     sieht also weiterhin welche Kachel wie breit sein wird, ohne dass
 *     das Modal-Layout selbst variable Breiten haben muss.
 *   - Ursprungs-Slot ist ein SICHTBARER dashed Placeholder (accent border,
 *     Content auf 25% gefadet). Frueher unsichtbar per opacity:0 — dann
 *     fuehlte sich der Drag an als waere das Widget "weg". Jetzt ist immer
 *     klar wo das Widget hingehoert.
 *   - Ghost mit rotate 1.5deg, tiefer Shadow, accent-Border → sieht optisch
 *     "hochgehoben" aus (Linear/Notion-Muster).
 *   - Drop-Target-Highlight: die Zeile unter dem Cursor bekommt einen
 *     accent-farbenen Ring + Background-Tint → User sieht LIVE wohin
 *     die Kachel landen wird, nicht erst nach dem Drop.
 *   - Container-Backdrop tintiert waehrend Drag leicht in accent → visuell
 *     klar "Drag-Modus aktiv".
 *   - Cursor state-driven getrennt: idle=grab, drag=grabbing (auf ganzer
 *     Kachel via body.data-dashboard-dragging Attribut).
 *   - PointerSensor (activation-distance 6px, sonst wuerde ein Klick auf
 *     den Auge-Button faelschlicherweise als Drag gewertet) + KeyboardSensor
 *     fuer Screenreader/Tastatur-Nutzer.
 *   - Sichtbarkeit via Eye/EyeOff-icon-btn rechts; hidden Widgets bleiben
 *     in der Reihenfolge, werden aber ausgegraut markiert.
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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { widgetSpanClass } from "@/lib/dashboard-widgets";

// Uebersetzt die Tailwind-Span-Klasse in ein User-lesbares Label + einen
// numerischen Anteil (fuer die kleine Breiten-Bar rechts). Fallback = Voll,
// falls jemals ein unbekannter Span reinkommt.
function spanInfo(spanClass: string): { label: string; fraction: number } {
  if (spanClass.includes("col-span-4")) return { label: "1/3 breit", fraction: 1 / 3 };
  if (spanClass.includes("col-span-6")) return { label: "1/2 breit", fraction: 1 / 2 };
  if (spanClass.includes("col-span-8")) return { label: "2/3 breit", fraction: 2 / 3 };
  return { label: "Volle Breite", fraction: 1 };
}

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
        <div className="rounded-xl border bg-muted/30 p-2 space-y-1.5">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
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
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div
              className="rounded-xl border p-2 transition-colors duration-200 max-h-[60vh] overflow-y-auto"
              style={{
                backgroundColor: activeId
                  ? "color-mix(in oklab, var(--accent) 5%, var(--background))"
                  : "color-mix(in oklab, var(--foreground) 3%, transparent)",
                borderColor: activeId
                  ? "color-mix(in oklab, var(--accent) 30%, var(--border))"
                  : undefined,
              }}
            >
              <div className="space-y-1.5">
                {items.map((it) => (
                  <SortablePreviewRow
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
              <PreviewRowVisual
                item={activeItem}
                spanInfo={spanInfo(spanFor(activeItem.id, mobilePreview))}
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
// PreviewRowVisual — reine Darstellungs-Zeile. Uniforme Hoehe (~56px), volle
// Breite. Layout: Grip · Icon · Titel (flex-1) · Breiten-Bar · Auge-Button.
// Wird sowohl von SortablePreviewRow als auch vom DragOverlay verwendet,
// damit Ghost + Original 1:1 identisch aussehen (kein "Sprung"-Effekt beim
// Uebergang zwischen Sortable-Zeile und Overlay).
// ---------------------------------------------------------------------------

function PreviewRowVisual({
  item,
  spanInfo: si,
  style,
  className,
  toggleButton,
  contentOpacity,
}: {
  item: PreferenceItem;
  spanInfo: { label: string; fraction: number };
  style?: React.CSSProperties;
  className?: string;
  /** Auge-Button; kann vom Sortable-Wrapper injiziert werden. Overlay
   *  laesst es leer (Overlay ist rein visuell, nicht interaktiv). */
  toggleButton?: React.ReactNode;
  /** Wenn gesetzt: erzwingt die Content-Opacity (Titel/Icon). Wird vom
   *  Placeholder-State genutzt (dashed Zeile, waehrend Ghost am Cursor
   *  haengt) um den Text auf ~25% zu faden ohne Border/BG mitzuziehen. */
  contentOpacity?: number;
}) {
  const effectiveContentOpacity =
    contentOpacity !== undefined ? contentOpacity : item.hidden ? 0.55 : 1;
  return (
    <div
      className={`relative rounded-lg border select-none flex items-center gap-3 pl-2 pr-2 py-2.5 h-14 ${className ?? ""}`}
      style={{
        backgroundColor: item.hidden
          ? "color-mix(in oklab, var(--foreground) 4%, transparent)"
          : "var(--card)",
        ...style,
      }}
    >
      <span
        className="shrink-0 text-muted-foreground/50"
        aria-hidden
        style={{ opacity: effectiveContentOpacity }}
      >
        <GripVertical className="h-4 w-4" />
      </span>
      <span
        className="shrink-0 text-accent"
        aria-hidden
        style={{ opacity: effectiveContentOpacity }}
      >
        {iconFor(item.id)}
      </span>
      <span
        className="flex-1 min-w-0 truncate text-sm font-medium"
        style={{
          opacity: effectiveContentOpacity,
          color: item.hidden ? "var(--muted-foreground)" : "var(--foreground)",
        }}
      >
        {item.title}
      </span>
      <span
        className="hidden sm:flex items-center gap-2 shrink-0"
        style={{ opacity: effectiveContentOpacity }}
      >
        <span
          className="relative h-1.5 w-16 rounded-full overflow-hidden"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--foreground) 10%, transparent)",
          }}
          aria-hidden
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${si.fraction * 100}%`,
              backgroundColor:
                "color-mix(in oklab, var(--accent) 70%, transparent)",
            }}
          />
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-16 text-right">
          {si.label}
        </span>
      </span>
      {toggleButton}

      {item.hidden && contentOpacity === undefined && (
        <span className="pointer-events-none absolute right-11 top-1/2 -translate-y-1/2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-muted/70 px-1.5 py-0.5 rounded">
          ausgeblendet
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SortablePreviewRow — dnd-kit-Wrapper. Rendert eine Zeile in der vertikalen
// Liste, haengt Drag-Listener auf einen absoluten Handle-Layer (nicht auf
// den Auge-Button — der stopPropagated und liegt eine Ebene hoeher).
// Waehrend Drag: Zeile bleibt SICHTBAR als dashed Placeholder, Ghost am
// Cursor wird ueber DragOverlay gerendert.
// ---------------------------------------------------------------------------

function SortablePreviewRow({
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
  /** Cursor hovert gerade ueber DIESER Zeile waehrend Drag → Drop-Target-Ring */
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
    transition: {
      duration: DND_TRANSITION.duration,
      easing: DND_TRANSITION.easing,
    },
  });
  const [hover, setHover] = useState(false);
  const si = spanInfo(spanClass);

  // Waehrend Drag: Zeile bleibt SICHTBAR als dashed Placeholder.
  const wrapperStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

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
    touchAction: "none",
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
      className={
        item.hidden
          ? "icon-btn shrink-0 relative z-10"
          : "icon-btn icon-btn-green shrink-0 relative z-10"
      }
      aria-label={item.hidden ? "Einblenden" : "Ausblenden"}
      data-tooltip={item.hidden ? "Einblenden" : "Ausblenden"}
      style={{ cursor: "pointer" }}
    >
      {item.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  ) : null;

  return (
    <div ref={setNodeRef} style={wrapperStyle} className="relative">
      {/* Drag-Handle-Layer: deckt die Zeile AUSSER den Auge-Button ab
          (per pointer-events + z-index). Der Button liegt eine Ebene
          hoeher (relative z-10) und faengt seinen Klick selbst. */}
      <div
        className="absolute inset-0 rounded-lg"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        {...attributes}
        {...listeners}
        aria-label={`${item.title} verschieben`}
        style={{ cursor: isActive ? "grabbing" : "grab" }}
      />
      <PreviewRowVisual
        item={item}
        spanInfo={si}
        style={innerStyle}
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
