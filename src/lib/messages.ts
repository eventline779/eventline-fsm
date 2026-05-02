/**
 * Toast-Helper fuer wiederkehrende Validation- und Fehler-Patterns.
 * Statt inline `toast.error("Titel ist Pflicht")` schreiben wir
 * `TOAST.requiredField("Titel")` — selbe Wortwahl app-weit, an einer Stelle
 * editierbar.
 */

import { toast } from "sonner";

export const TOAST = {
  /** Required-Field-Validation: "{label} ist Pflicht" */
  requiredField: (label: string) => toast.error(`${label} ist Pflicht`),

  /** Generischer Fehler mit Detail-Message: "Fehler: {msg}" */
  error: (msg: string) => toast.error(`Fehler: ${msg}`),

  /** Fehler mit Fallback wenn Backend-Message leer ist. */
  errorOr: (msg: string | null | undefined, fallback = "Unbekannter Fehler") =>
    toast.error(`Fehler: ${msg || fallback}`),

  /** Upload-Fehler mit Detail oder "Unbekannt"-Fallback */
  uploadError: (msg: string | null | undefined) =>
    toast.error(`Upload-Fehler: ${msg || "Unbekannt"}`),

  /** Mail-Fehler mit Detail oder "Unbekannt"-Fallback */
  mailError: (msg: string | null | undefined) =>
    toast.error(`Mail-Fehler: ${msg || "Unbekannt"}`),

  /** Network/Catch-Fallback wenn fetch geworfen hat ohne strukturierte Antwort */
  networkError: (label: string) =>
    toast.error(`${label} fehlgeschlagen`),

  /** Postgres/RLS-Errors aus Supabase einheitlich uebersetzen. PGRST201 ist
   *  Permission-Denied (RLS lehnt ab); 23505 ist Duplicate-Key etc. */
  supabaseError: (err: { code?: string; message?: string } | null | undefined, fallback = "Aktion fehlgeschlagen") => {
    if (!err) return toast.error(fallback);
    if (err.code === "PGRST201" || err.code === "42501") {
      return toast.error("Keine Berechtigung für diese Aktion");
    }
    if (err.code === "23505") {
      return toast.error("Eintrag existiert bereits");
    }
    return toast.error(err.message || fallback);
  },
};
