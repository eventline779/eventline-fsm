// Zentrale Registry aller Dashboard-Widgets.
//
// Wahrheit ueber:
//   - welche Widgets es gibt (WidgetId)
//   - welche Permission ein Widget braucht (requires: "modul:action"[])
//   - fuer welche Rollen es standardmaessig sichtbar ist (defaultRoles)
//
// WICHTIG: Diese Datei enthaelt bewusst KEINE Render-Funktionen / React-Komponenten,
// nur reine Config-Data. Damit kann sie sowohl server-side (in /api/dashboard und
// permission-Helpern) als auch client-side (im Rollen-Tab und Dashboard-Layout)
// importiert werden, ohne dass React-Rendering-Code mitgezogen wird.
//
// Widget-Komponenten leben in `src/app/(app)/dashboard/page.tsx` bzw. in
// `src/components/dashboard/*` und werden dort ueber die WidgetId aus dieser
// Registry aufgeloest.

export type WidgetId =
  | "kpi-offene-auftraege"
  | "kpi-termine-woche"
  | "kpi-nicht-abgerechnet"
  | "overdue-jobs"
  | "zu-erledigen"
  | "team-status"
  | "anwesenheitskalender"
  | "stempel-status"
  | "ma-monat-stunden"
  | "ma-prognose"
  | "ma-naechster-einsatz"
  | "partner-willkommen";

/**
 * Groesse eines Widgets im Dashboard-Raster (Desktop: 2 Spalten).
 *   '1x1' = eine Zelle (halb-breit, eine Reihe)
 *   '2x1' = volle Breite, eine Reihe
 *   '1x2' = halb-breit, zwei Reihen hoch
 *   '2x2' = volle Breite und zwei Reihen hoch
 *
 * Auf Mobile (1-Spalten-Layout) hat die Groesse keinen Effekt — jedes Widget
 * sitzt linear untereinander. col-span/row-span sind bewusst nur unter dem
 * `md:`-Breakpoint aktiv.
 */
export type WidgetSize = "1x1" | "2x1" | "1x2" | "2x2";

export interface DashboardWidget {
  /** Stabile ID — wird in DB (Layout-Persistenz) und URLs referenziert, niemals umbenennen. */
  id: WidgetId;
  /** UI-Label fuer den Rollen-Tab und Widget-Header. */
  title: string;
  /** Raster-Groesse im Dashboard-Grid (siehe WidgetSize). */
  size: WidgetSize;
  /**
   * Permissions die ein Nutzer braucht, damit das Widget sichtbar ist.
   * Format "modul:action" (siehe src/lib/permissions.ts). Leeres Array = keine
   * spezielle Permission noetig (jeder authentifizierte Nutzer darf es sehen).
   * Admins duerfen wie immer alles — hasPermission() gated das.
   */
  requires: string[];
  /**
   * Rollen fuer die dieses Widget in der Default-Layout-Reihenfolge auftaucht,
   * wenn der Nutzer noch kein persoenliches Layout gespeichert hat.
   */
  defaultRoles: string[];
}

/**
 * Reihenfolge in diesem Array bestimmt die Default-Anordnung im Dashboard,
 * pro Rolle gefiltert ueber `widgetsForRole()`.
 */
export const DASHBOARD_WIDGETS: readonly DashboardWidget[] = [
  {
    id: "kpi-offene-auftraege",
    title: "Offene Auftraege",
    size: "1x1",
    requires: ["auftraege:view"],
    defaultRoles: ["admin"],
  },
  {
    id: "kpi-termine-woche",
    title: "Termine diese Woche",
    size: "1x1",
    requires: ["kalender:view"],
    defaultRoles: ["admin"],
  },
  {
    id: "kpi-nicht-abgerechnet",
    title: "Nicht abgerechnet",
    size: "1x1",
    requires: ["abrechnung:view"],
    defaultRoles: ["admin"],
  },
  {
    id: "overdue-jobs",
    title: "Ueberfaellige Auftraege",
    size: "2x1",
    requires: ["auftraege:view"],
    defaultRoles: ["admin"],
  },
  {
    id: "zu-erledigen",
    title: "Zu erledigen",
    size: "1x1",
    requires: [],
    defaultRoles: ["admin"],
  },
  {
    id: "team-status",
    title: "Team-Status",
    size: "1x1",
    requires: ["stempelzeiten:see-all"],
    defaultRoles: ["admin"],
  },
  {
    id: "anwesenheitskalender",
    title: "Buero-Anwesenheit",
    size: "2x2",
    requires: ["anwesenheit:view"],
    defaultRoles: ["admin", "techniker"],
  },
  {
    id: "stempel-status",
    title: "Stempel-Status",
    size: "1x1",
    requires: ["stempelzeiten:view"],
    defaultRoles: ["techniker"],
  },
  {
    id: "ma-monat-stunden",
    title: "Meine Stunden diesen Monat",
    size: "1x1",
    requires: [],
    defaultRoles: ["techniker"],
  },
  {
    id: "ma-prognose",
    title: "Prognose Monatsende",
    size: "1x1",
    requires: [],
    defaultRoles: ["techniker"],
  },
  {
    id: "ma-naechster-einsatz",
    title: "Naechster Einsatz",
    size: "2x1",
    requires: ["kalender:view"],
    defaultRoles: ["techniker"],
  },
  {
    id: "partner-willkommen",
    title: "Willkommen im Partner-Portal",
    size: "2x1",
    requires: [],
    defaultRoles: ["partner"],
  },
] as const;

/**
 * Tailwind-Klassen fuer die Positionierung eines Widgets im 2-Spalten-Grid
 * (siehe Dashboard-Renderer). Mobile bleibt bewusst 1-spaltig — `md:`-Prefixe
 * verhindern, dass col-span/row-span dort reinreissen.
 */
export function widgetSizeClasses(size: WidgetSize): string {
  switch (size) {
    case "1x1":
      return "";
    case "2x1":
      return "md:col-span-2";
    case "1x2":
      return "md:row-span-2";
    case "2x2":
      return "md:col-span-2 md:row-span-2";
  }
}

/**
 * Default-Widget-Reihenfolge fuer eine Rolle — alle Widgets deren
 * `defaultRoles` die Rolle enthalten, in Registry-Reihenfolge.
 *
 * Wird genutzt, wenn ein Nutzer noch kein persoenliches Layout gespeichert hat
 * bzw. der Rollen-Tab in den Einstellungen einen "Zuruecksetzen"-Default zeigt.
 */
export function widgetsForRole(role: string): WidgetId[] {
  return DASHBOARD_WIDGETS
    .filter((w) => w.defaultRoles.includes(role))
    .map((w) => w.id);
}

/**
 * Widget-Metadaten per ID abfragen. Liefert `undefined` fuer unbekannte IDs
 * (z. B. veraltete DB-Layout-Eintraege) — Caller entscheidet, wie damit umgegangen wird.
 */
export function widgetById(id: WidgetId): DashboardWidget | undefined {
  return DASHBOARD_WIDGETS.find((w) => w.id === id);
}
