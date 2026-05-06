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

  /** Loeschen-Fehler mit optionalem Detail */
  deleteError: (msg?: string | null) =>
    toast.error(msg ? `Löschen fehlgeschlagen: ${msg}` : "Löschen fehlgeschlagen"),

  /** Erstellen-Fehler mit optionalem Detail */
  createError: (msg?: string | null) =>
    toast.error(msg ? `Erstellen fehlgeschlagen: ${msg}` : "Erstellen fehlgeschlagen"),

  /** Senden-Fehler (Mails, Notifications, Belege) */
  sendError: (msg?: string | null) =>
    toast.error(msg ? `Senden fehlgeschlagen: ${msg}` : "Senden fehlgeschlagen"),

  /** Stempel-Operationen */
  stempelError: (msg?: string | null) =>
    toast.error(msg || "Stempel-Aktion fehlgeschlagen"),

  /** Network/Catch-Fallback wenn fetch geworfen hat ohne strukturierte Antwort */
  networkError: (label: string) =>
    toast.error(`${label} fehlgeschlagen`),

  /** Postgres/RLS-Errors aus Supabase einheitlich uebersetzen. PGRST201 +
   *  42501 = Permission-Denied (RLS lehnt ab); 23505 = Duplicate-Key.
   *
   *  Akzeptiert was auch immer im catch landet — Postgres-Error-Objekt,
   *  String aus einer API-Response, oder unknown aus catch(e). RLS wird
   *  zusaetzlich an der Message erkannt damit auch Fehler die nur als
   *  String durchgeschleift werden (z.B. via /api/db/delete) als
   *  "Keine Berechtigung" rauskommen statt mit "row-level security policy". */
  supabaseError: (err: unknown, fallback = "Aktion fehlgeschlagen") => {
    if (!err) return toast.error(fallback);
    const obj = (typeof err === "object" && err !== null) ? err as { code?: string; message?: string } : null;
    const code = obj?.code;
    const message = typeof err === "string" ? err : obj?.message;

    if (code === "PGRST201" || code === "42501") {
      return toast.error("Keine Berechtigung für diese Aktion");
    }
    if (message && /row-level security|permission denied|insufficient[_ ]privilege/i.test(message)) {
      return toast.error("Keine Berechtigung für diese Aktion");
    }
    if (code === "23505") {
      return toast.error("Eintrag existiert bereits");
    }
    return toast.error(message || fallback);
  },
};
