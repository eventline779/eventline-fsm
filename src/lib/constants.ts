// Status-Labels für Aufträge — Light- + Dark-Mode-Farben.
// Lifecycle: anfrage → entwurf → offen → abgeschlossen | storniert.
// 'anfrage' ist die Akquise-Phase (5 Schritte via REQUEST_STEPS). Sobald die
// Anfrage konvertiert wird, wechselt der Status auf 'offen' (oder 'entwurf')
// und request_step wird NULL. Ab dann normale Auftragslogik.
export const JOB_STATUS = {
  anfrage: { label: "Vermietentwurf", color: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" },
  entwurf: { label: "Entwurf", color: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300" },
  offen: { label: "Bevorstehend", color: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-300" },
  abgeschlossen: { label: "Abgeschlossen", color: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300" },
  storniert: { label: "Storniert", color: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" },
} as const;

// === Mietanfrage-Pipeline ===
// 4 Schritte waehrend status='anfrage'. Step-Position wird in jobs.request_step gespeichert.
// Nach Schritt 4 (Angebot bestaetigt durch Kunde) wird der Vermietentwurf
// automatisch in einen Auftrag (status='offen') umgewandelt — der Vertrag
// laeuft dann ausserhalb dieser Pipeline (z.B. ueber den normalen Auftrag-
// Mail-Flow oder direkt am Standort).
// Labels formuliert als ERREICHTER ZUSTAND — selbsterklaerend, keine Sub-Beschreibung noetig.
// Single source of truth — sowohl Step-Tracker-UI als auch Listen-Filter ziehen daraus.
export interface RequestStep {
  step: 1 | 2 | 3 | 4;
  label: string;
  /** True wenn dieser Schritt eine Mail an den Kunden ausloest (Schritt 1+3).
   *  Auf Warte-Schritten (2+4) ist es false — der Kunde bestaetigt aus der Mail. */
  sendsMail: boolean;
}

// Haeufigste Veranstaltungstypen einer Anfrage. UI zeigt diese als Dropdown,
// Letztes Item ist "Sonstige" — dann oeffnet sich ein Textfeld fuer Freitext.
export const EVENT_TYPES = [
  "Konzert",
  "Theater",
  "Firmenanlass",
  "Comedyshow",
  "Privatfeier",
] as const;

export const REQUEST_STEPS: readonly RequestStep[] = [
  { step: 1, label: "Konditionen senden", sendsMail: true },
  { step: 2, label: "Konditionen bestätigt", sendsMail: false },
  { step: 3, label: "Angebot senden", sendsMail: true },
  { step: 4, label: "Angebot bestätigt", sendsMail: false },
] as const;

// Schritt-Nummern die eine Mail ausloesen — abgeleitet aus REQUEST_STEPS.
// Vorher in 3 Files dupliziert (auftraege/page, vermietentwurf/[id], send-step-modal).
export const REQUEST_MAIL_STEPS = new Set<number>(
  REQUEST_STEPS.filter((s) => s.sendsMail).map((s) => s.step),
);

// Prioritäten — nur 'normal' (default) und 'dringend'
// 'niedrig' und 'hoch' wurden nie genutzt, der relevante Hinweis ist binär:
// "ist das jetzt dringend oder nicht?"
export const JOB_PRIORITY = {
  normal: { label: "Normal", color: "bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300" },
  dringend: { label: "Dringend", color: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" },
} as const;

// Kundentypen
export const CUSTOMER_TYPES = {
  company: "Firma",
  individual: "Privatperson",
  organization: "Organisation",
} as const;

// Benutzerrollen
export const USER_ROLES = {
  admin: "Admin",
  techniker: "Service-Techniker",
} as const;

// === NAVIGATION (single source of truth) ===
// Adding/changing nav items: edit ONLY this file.
// Sidebar, mobile bottom-nav and mobile sheet all read from NAV_GROUPS.
// Icons resolve via src/lib/nav-icons.ts — add new icons there.

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Visible in techniker simplified view (mobile + sidebar). */
  simplified?: boolean;
  /** Show as a primary tab in mobile bottom-nav. Max 4 across all items. */
  mobile?: boolean;
  /** Zusatz-Pfade die als "in diesem Bereich" gelten — fuer Routen die unter
   *  einem anderen Top-Level-Pfad liegen aber semantisch hierher gehoeren
   *  (z.B. /standorte/[id] und /raeume/[id] gehoeren zu /locations). */
  matchPrefixes?: string[];
}

export interface NavGroup {
  /** Empty string = no group header (renders flat at top of sidebar). */
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "",
    items: [
      { href: "/heute", label: "Heute", icon: "LayoutDashboard", simplified: true, mobile: true },
      { href: "/kalender", label: "Kalender", icon: "Calendar", simplified: true, mobile: true },
    ],
  },
  {
    label: "Buchungen",
    items: [
      { href: "/auftraege", label: "Operations", icon: "ClipboardList", simplified: true, mobile: true },
      { href: "/vertrieb", label: "Vertrieb", icon: "TrendingUp" },
    ],
  },
  {
    label: "Räumlichkeiten",
    items: [
      { href: "/belegungsplan", label: "Belegungsplan", icon: "CalendarClock", simplified: true },
      // Standorte (Verwaltungen, intern) und Räume (externe Reference) leben
      // gemeinsam unter /locations — Detail-Routen bleiben getrennt.
      { href: "/locations", label: "Locations", icon: "MapPin", matchPrefixes: ["/standorte", "/raeume"] },
    ],
  },
  {
    label: "Kontakte",
    items: [
      { href: "/kunden", label: "Kunden", icon: "Users" },
      { href: "/partner", label: "Partner", icon: "Briefcase" },
    ],
  },
  {
    label: "Dokumente",
    items: [
      { href: "/rapporte", label: "Rapporte", icon: "FileText", simplified: true },
      { href: "/belege", label: "Rechnungen & Belege", icon: "Receipt" },
      { href: "/vorlagen", label: "E-Mail-Vorlagen", icon: "Send" },
    ],
  },
  {
    label: "Meine Arbeit",
    items: [
      { href: "/zeiterfassung", label: "Zeiterfassung", icon: "Clock", simplified: true, mobile: true },
      { href: "/todos", label: "Todos", icon: "CheckSquare", simplified: true },
      { href: "/tickets", label: "Tickets", icon: "Ticket" },
    ],
  },
];

export const ADMIN_NAV_GROUP: NavGroup = {
  label: "Admin",
  items: [
    { href: "/hr", label: "HR", icon: "Briefcase" },
    { href: "/schulungen", label: "Schulungen", icon: "GraduationCap" },
    { href: "/einstellungen?tab=admin", label: "Einstellungen", icon: "Settings" },
  ],
};

// Flat lists for backwards compatibility
export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
export const ADMIN_NAV_ITEMS = ADMIN_NAV_GROUP.items;
