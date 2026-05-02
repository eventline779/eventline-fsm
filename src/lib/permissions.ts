// Single source of truth fuer das Permission-Modell.
//
// Permissions sind Strings im Format "module:action".
//   "kunden:view"   = Kunden sehen / Kunden-Tab in Sidebar zeigen
//   "kunden:create" = Neuer Kunde anlegen
//   "kunden:edit"   = Kundendaten bearbeiten
//   "kunden:delete" = Kunde archivieren/loeschen
//
// Die admin-Rolle wird im SQL-Helper `has_permission()` und im JS-Helper
// `hasPermission()` IMMER als allmaechtig behandelt — das verhindert dass
// sich ein Admin per UI-Konfiguration selbst aussperrt.
//
// Module die keine Action-Granularitaet haben (Kalender, HR, Vertrieb,
// Einstellungen): nur "view". Wer diese Module sieht, sieht alles drin.

export type PermissionAction = "view" | "create" | "edit" | "archive" | "delete" | "manage";

export interface PermissionModule {
  slug: string;
  label: string;
  /** Pfade die zu diesem Modul gehoeren — fuer Layout-Guard. */
  paths: string[];
  /** Welche Aktionen werden in der Rollen-Matrix angeboten. */
  actions: PermissionAction[];
}

export const PERMISSION_MODULES: PermissionModule[] = [
  { slug: "kalender",      label: "Kalender",      paths: ["/kalender"],                                         actions: ["view"] },
  { slug: "auftraege",     label: "Operations",    paths: ["/auftraege"],                                        actions: ["view", "create", "edit", "delete"] },
  { slug: "vertrieb",      label: "Vertrieb",      paths: ["/vertrieb"],                                         actions: ["view"] },
  { slug: "locations",     label: "Locations",     paths: ["/locations", "/standorte", "/raeume", "/belegungsplan"], actions: ["view", "create", "edit", "delete"] },
  { slug: "kunden",        label: "Kunden",        paths: ["/kunden"],                                           actions: ["view", "create", "edit", "archive", "delete"] },
  { slug: "partner",       label: "Partner",       paths: ["/partner"],                                          actions: ["view", "create", "edit", "delete"] },
  { slug: "hr",            label: "HR",            paths: ["/hr", "/todos", "/schulungen", "/stempelzeiten"],    actions: ["view"] },
  { slug: "tickets",       label: "Tickets",       paths: ["/tickets"],                                          actions: ["view", "create", "manage"] },
  { slug: "einstellungen", label: "Einstellungen", paths: ["/einstellungen"],                                    actions: ["view"] },
];

/** Pfade die fuer alle eingeloggten User erreichbar sind, unabhaengig von der Rolle. */
const ALWAYS_ALLOWED_PREFIXES = ["/dashboard"];

/** Permission-Check fuer eine konkrete Aktion (z.B. "kunden:edit"). */
export function hasPermission(permissions: string[], role: string, perm: string): boolean {
  if (role === "admin") return true;
  return permissions.includes(perm);
}

/** True wenn der User das Modul sehen darf (= module:view-Permission). */
function canSeeModule(slug: string, permissions: string[], role: string): boolean {
  return hasPermission(permissions, role, `${slug}:view`);
}

export function isPathAllowed(pathname: string, permissions: string[], role: string): boolean {
  if (role === "admin") return true;
  if (ALWAYS_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  for (const mod of PERMISSION_MODULES) {
    if (mod.paths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return canSeeModule(mod.slug, permissions, role);
    }
  }
  // Pfade die zu keinem Modul gehoeren (z.B. /api/...) lassen wir durch.
  return true;
}

// Feature-Permissions: cross-cutting Funktionen die nicht an einen Modul-
// Pfad gebunden sind (z.B. Bexio-Buttons tauchen auf Kunden- UND Auftrags-
// Detailseiten auf). In der Rollen-Matrix als eigene Sektion gerendert.
export interface PermissionFeature {
  key: string;
  label: string;
  description: string;
}

export const PERMISSION_FEATURES: PermissionFeature[] = [
  {
    key: "bexio:use",
    label: "Bexio benutzen",
    description: "Kontakte mit Bexio verlinken, in Bexio anlegen, dort öffnen",
  },
];

/** Sammelt alle bekannten Permission-Strings — fuer API-Validierung beim Anlegen/Aendern von Rollen. */
export function allKnownPermissions(): string[] {
  const out: string[] = [];
  for (const m of PERMISSION_MODULES) {
    for (const a of m.actions) out.push(`${m.slug}:${a}`);
  }
  for (const f of PERMISSION_FEATURES) out.push(f.key);
  return out;
}
