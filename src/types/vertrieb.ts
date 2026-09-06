/**
 * Vertrieb-Types (Alias-Layer).
 *
 * `vertrieb_contacts.notizen` ist ein JSON-serialisierter Container
 * `{ _text, _details: VertriebDetails }` — Quelle-of-Truth ist
 * `src/lib/vertrieb-notes.ts`. Diese Datei exportiert die Struktur unter
 * Alias-Namen (`VertriebContactDetails` / `VertriebTermin`) fuer Consumer
 * (Komponenten, API-Routen), die den Details-Teil ohne Notes-Wrapper
 * konsumieren — statt jedes Mal `_details: any` oder `termine: any[]` zu
 * verwenden.
 */

export type { VertriebDetails as VertriebContactDetails, Termin as VertriebTermin } from "@/lib/vertrieb-notes";
