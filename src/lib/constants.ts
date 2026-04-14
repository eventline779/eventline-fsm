// Status-Labels für Aufträge
export const JOB_STATUS = {
  entwurf: { label: "Entwurf", color: "bg-purple-100 text-purple-700" },
  offen: { label: "Offen", color: "bg-gray-100 text-gray-700" },
  geplant: { label: "Geplant", color: "bg-blue-100 text-blue-700" },
  in_arbeit: { label: "In Arbeit", color: "bg-yellow-100 text-yellow-700" },
  abgeschlossen: { label: "Abgeschlossen", color: "bg-green-100 text-green-700" },
  storniert: { label: "Storniert", color: "bg-red-100 text-red-700" },
} as const;

// Status-Labels für Vermietungsanfragen
export const RENTAL_STATUS = {
  neu: { label: "Neu", color: "bg-blue-100 text-blue-700" },
  konditionen_gesendet: { label: "Konditionen gesendet", color: "bg-yellow-100 text-yellow-700" },
  konditionen_bestaetigt: { label: "Konditionen bestätigt", color: "bg-emerald-100 text-emerald-700" },
  angebot_gesendet: { label: "Angebot gesendet", color: "bg-orange-100 text-orange-700" },
  in_bearbeitung: { label: "In Bearbeitung", color: "bg-yellow-100 text-yellow-700" },
  bestaetigt: { label: "Bestätigt", color: "bg-green-100 text-green-700" },
  abgelehnt: { label: "Abgelehnt", color: "bg-red-100 text-red-700" },
} as const;

// Prioritäten
export const JOB_PRIORITY = {
  niedrig: { label: "Niedrig", color: "bg-gray-100 text-gray-600" },
  normal: { label: "Normal", color: "bg-blue-100 text-blue-600" },
  hoch: { label: "Hoch", color: "bg-orange-100 text-orange-600" },
  dringend: { label: "Dringend", color: "bg-red-100 text-red-600" },
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

// Gruppierte Navigation
export interface NavItem {
  href: string;
  label: string;
  icon: string;
  simplified?: boolean; // Wird in der vereinfachten Ansicht angezeigt
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Übersicht",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", simplified: true },
    ],
  },
  {
    label: "Aufträge & Kunden",
    items: [
      { href: "/auftraege", label: "Aufträge", icon: "ClipboardList", simplified: true },
      { href: "/anfragen", label: "Vermietungen", icon: "Inbox" },
      { href: "/kunden", label: "Kunden", icon: "Users" },
      { href: "/vertrieb", label: "Vertrieb", icon: "TrendingUp" },
    ],
  },
  {
    label: "Planung",
    items: [
      { href: "/kalender", label: "Kalender", icon: "Calendar", simplified: true },
      { href: "/zeiterfassung", label: "Zeiterfassung", icon: "Clock", simplified: true },
      { href: "/todos", label: "Todos", icon: "CheckSquare" },
      { href: "/tickets", label: "Tickets", icon: "Ticket" },
    ],
  },
  {
    label: "Dokumentation",
    items: [
      { href: "/rapporte", label: "Rapporte", icon: "FileText" },
      { href: "/standorte", label: "Standorte", icon: "MapPin" },
      { href: "/raeume", label: "Räume", icon: "DoorOpen" },
      { href: "/belege", label: "Belege", icon: "Receipt" },
    ],
  },
  {
    label: "HR",
    items: [
      { href: "/hr", label: "HR", icon: "Briefcase", simplified: true },
    ],
  },
];

export const ADMIN_NAV_GROUP: NavGroup = {
  label: "Admin",
  items: [
    { href: "/einstellungen?tab=admin", label: "Einstellungen", icon: "Settings" },
  ],
};

// Flat lists for backwards compatibility
export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
export const ADMIN_NAV_ITEMS = ADMIN_NAV_GROUP.items;
