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
 * Steuerung:
 *   - Reihenfolge via echtem Drag-and-Drop (@dnd-kit/core + sortable).
 *     PointerSensor + KeyboardSensor -> Touch/Maus/Screenreader out of
 *     the box (CLAUDE.md § "robust by default"). Fallback ohne Maus:
 *     Tastatur-Pfeile ueber den Drag-Handle des fokussierten Widgets.
 *   - Sichtbarkeit via Eye/EyeOff-icon-btn im Widget-Kopf; hidden Widgets
 *     bleiben in der Reihenfolge, werden aber ausgegraut + mit Overlay
 *     markiert (User sieht wo sie wieder auftauchen wuerden).
 *   - Mobile-Vorschau-Toggle: zwingt alle Widgets im Preview auf volle
 *     Breite (1 Spalte), so sieht der User das effektive Mobile-Layout.
 *   - Auto-Save debounced 400ms bei Aenderung — kein "Speichern"-Button;
 *     Server-Fehler landen als Toast (CLAUDE.md § "sofortiges Ladefeedback").
 *   - "Auf Standard zuruecksetzen" = DELETE /api/dashboard/overrides.
 *   - "Fertig" flusht pending Save und triggert Parent-Refetch.
 *
 * Vorschau vs. echtes Dashboard:
 *   Die Preview-Bausteine sind Layout-Vorschauen: Titel + Icon + Span-
 *   Groesse (col-span-4 / col-span-6 / col-span-12), NICHT die volle
 *   Widget-Renderung. Damit bleibt das Modal schnell (keine API-Requests
 *   pro Widget) und passt auch bei kleinem Viewport in den Modal-Rahmen.
 *   Die Span-Klassen sind eine 1:1-Kopie aus dashboard/page.tsx —
 *   Aenderungen dort muessen hier mit-nachgezogen werden (Konstante
 *   PREVIEW_SPAN, siehe unten).
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
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
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
// Widget-Preview-Metadaten. 1:1-Spiegel zu WIDGET_SPAN in dashboard/page.tsx.
// Wenn ein Widget dort umsortiert wird, hier nachziehen — sonst zeigt die
// Vorschau eine andere Aufteilung als das echte Dashboard.
// ---------------------------------------------------------------------------

const PREVIEW_SPAN: Record<string, string> = {
  "kpi-offene-auftraege": "col-span-12 sm:col-span-4",
  "kpi-termine-woche": "col-span-12 sm:col-span-4",
  "kpi-nicht-abgerechnet": "col-span-12 sm:col-span-4",
  "overdue-jobs": "col-span-12",
  "zu-erledigen": "col-span-12 lg:col-span-6",
  "team-status": "col-span-12 lg:col-span-6",
  "anwesenheitskalender": "col-span-12",
  "stempel-status": "col-span-12 lg:col-span-6",
  "ma-monat-stunden": "col-span-12 lg:col-span-6",
  "ma-prognose": "col-span-12 lg:col-span-6",
  "ma-naechster-einsatz": "col-span-12",
  "partner-willkommen": "col-span-12",
};

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
  "stempel-status": <Clock className="h-4 w-4" />,
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
  return PREVIEW_SPAN[id] ?? "col-span-12";
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

  function handleDragEnd(event: DragEndEvent) {
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

  // dnd-kit Sensoren: PointerSensor mit kleiner Aktivierungs-Distanz, damit
  // ein reiner Klick auf den Auge-Button NICHT als Drag interpretiert wird.
  // KeyboardSensor fuer Screenreader/Tastatur-Nutzer.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortableIds = useMemo(() => items.map((i) => i.id), [items]);

  return (
    <Modal open={open} onClose={handleFinish} title="Dashboard anpassen" size="3xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Widgets verschieben, ausblenden oder Reihenfolge aendern — nur fuer dich sichtbar.
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
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
            <div
              className="rounded-xl border p-3"
              style={{
                backgroundColor:
                  "color-mix(in oklab, var(--foreground) 3%, transparent)",
              }}
            >
              <div className="grid grid-cols-12 gap-2">
                {items.map((it) => (
                  <SortablePreviewTile
                    key={it.id}
                    item={it}
                    spanClass={spanFor(it.id, mobilePreview)}
                    onToggle={() => toggleHidden(it.id)}
                  />
                ))}
              </div>
            </div>
          </SortableContext>
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
// Preview-Kachel — sortierbar via dnd-kit; state-driven Hover (CLAUDE.md §3).
// Die Kachel bildet die Groesse des echten Widgets nach (col-span…), zeigt
// Icon + Titel und den Sichtbarkeits-Toggle. Der Drag-Handle ist die ganze
// Kachel-Oberflaeche minus des Auge-Buttons — so kann der User intuitiv
// irgendwo auf das Widget greifen.
// ---------------------------------------------------------------------------

function SortablePreviewTile({
  item,
  spanClass,
  onToggle,
}: {
  item: PreferenceItem;
  spanClass: string;
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });
  const [hover, setHover] = useState(false);

  // CSS.Transform.toString liefert translate3d(...) mit korrekten Werten,
  // inkl. Fallback wenn transform=null (kein aktives Dragging).
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.85 : 1,
    // Kachel-Hintergrund: hidden = ausgegraut, hover = leichter Boost.
    backgroundColor: item.hidden
      ? "color-mix(in oklab, var(--foreground) 4%, transparent)"
      : hover
        ? "color-mix(in oklab, var(--foreground) 8%, var(--card))"
        : "var(--card)",
    // Grip-Cursor nur wenn nicht gerade geklickt (Auge etc handelt eigenen Cursor).
    cursor: isDragging ? "grabbing" : "grab",
    // Touch-Action: pan-y ist Standard-Scroll; wir muessen es hier
    // deaktivieren, sonst schluckt der Browser den Drag-Gesture auf Mobile.
    touchAction: "none",
    boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.18)" : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`${spanClass} relative rounded-lg border transition-colors select-none`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start gap-2 p-2.5 min-h-16">
        <span
          className="mt-0.5 shrink-0 text-muted-foreground/60"
          aria-hidden
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <div
          className="flex-1 min-w-0"
          style={{ opacity: item.hidden ? 0.55 : 1 }}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            <span className="text-accent shrink-0">{iconFor(item.id)}</span>
            <span className="truncate">{item.title}</span>
          </div>
          <div className="mt-1.5 h-2 rounded bg-muted-foreground/15 w-3/4" />
          <div className="mt-1 h-2 rounded bg-muted-foreground/10 w-1/2" />
        </div>
        {/* Auge-Button: eigenes Pointer-Handling, damit Klick NICHT als
            Drag-Start missinterpretiert wird. stopPropagation reicht,
            weil der Sensor am Container haengt. */}
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
      </div>

      {item.hidden && (
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
