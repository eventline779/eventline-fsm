// Status-Labels für Aufträge — Light- + Dark-Mode-Farben
export const JOB_STATUS = {
  entwurf: { label: "Entwurf", color: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300" },
  offen: { label: "Offen", color: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-300" },
  geplant: { label: "Geplant", color: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" },
  in_arbeit: { label: "In Arbeit", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300" },
  abgeschlossen: { label: "Abgeschlossen", color: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300" },
  storniert: { label: "Storniert", color: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" },
} as const;

// Status-Labels für Vermietungsanfragen
export const RENTAL_STATUS = {
  neu: { label: "Neu", color: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" },
  konditionen_gesendet: { label: "Konditionen gesendet", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300" },
  konditionen_bestaetigt: { label: "Konditionen bestätigt", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" },
  angebot_gesendet: { label: "Angebot gesendet", color: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300" },
  in_bearbeitung: { label: "In Bearbeitung", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300" },
  bestaetigt: { label: "Bestätigt", color: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300" },
  abgelehnt: { label: "Abgelehnt", color: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" },
} as const;

// Prioritäten
export const JOB_PRIORITY = {
  niedrig: { label: "Niedrig", color: "bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400" },
  normal: { label: "Normal", color: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300" },
  hoch: { label: "Hoch", color: "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300" },
  dringend: { label: "Dringend", color: "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300" },
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
      { href: "/anfragen", label: "Vermietungsanfragen", icon: "Inbox", simplified: true, mobile: true },
      { href: "/auftraege", label: "Aufträge", icon: "ClipboardList", simplified: true },
      { href: "/vertrieb", label: "Vertrieb", icon: "TrendingUp" },
    ],
  },
  {
    label: "Räumlichkeiten",
    items: [
      { href: "/belegungsplan", label: "Belegungsplan", icon: "CalendarClock", simplified: true },
      { href: "/standorte", label: "Standorte", icon: "MapPin" },
      { href: "/raeume", label: "Räume", icon: "DoorOpen" },
    ],
  },
  {
    label: "Kontakte",
    items: [
      { href: "/kunden", label: "Kunden", icon: "Users" },
      { href: "/partner", label: "Partner & Lieferanten", icon: "Briefcase" },
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
