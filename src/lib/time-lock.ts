/**
 * Client-Spiegel der SQL-Function public.is_time_entry_locked (Migration 214).
 *
 * Ein time_entry ist GESPERRT, sobald in Europe/Zurich der 5. des Monats
 * NACH dem clock_in-Monat erreicht ist. Ab diesem Zeitpunkt darf niemand
 * mehr aendern/loeschen — RLS + apply_ticket-RPC (Migration 215) erzwingen
 * das serverseitig. Dieser Helper dient NUR dem UI-Feedback (Lock-Icon,
 * disabled Buttons, Vorab-Warnung im Ticket-Modal), damit der Nutzer nicht
 * ein Formular ausfuellt und dann von der DB abgewiesen wird.
 *
 * WICHTIG: Muss die SQL-Regel exakt spiegeln. Aenderungen an Migration 214
 * hier mitnachziehen — sonst driftet UI vs Server.
 */

import { ZRH_TZ, localDateIso } from "./swiss-time";

const zurichYearMonthFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZRH_TZ,
  year: "numeric",
  month: "2-digit",
});

/**
 * Ist der gegebene clock_in-Zeitpunkt bereits im gesperrten Abrechnungs-
 * Fenster (Zurich-Kalender)? Leere/ungueltige Werte -> false (nichts
 * blockieren, dann fangen wir es serverseitig ab).
 *
 * Beispiele (alles Europe/Zurich):
 *   clock_in 01.09.2026 → gesperrt ab 05.10.2026 00:00
 *   clock_in 30.09.2026 → gesperrt ab 05.10.2026 00:00
 *   clock_in 01.10.2026 → gesperrt ab 05.11.2026 00:00
 */
export function isTimeEntryLocked(iso: string | Date | null | undefined): boolean {
  if (!iso) return false;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return false;

  // Jahr/Monat des clock_in im Europe/Zurich-Kalender bestimmen.
  const parts = zurichYearMonthFmt.formatToParts(d);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return false;

  // Deadline = 5. des Folgemonats (00:00 Zurich).
  let dlYear = year;
  let dlMonth = month + 1;
  if (dlMonth > 12) {
    dlMonth = 1;
    dlYear += 1;
  }
  const deadlineIso = `${dlYear}-${String(dlMonth).padStart(2, "0")}-05`;

  // Heute im Zurich-Kalender >= Deadline?
  const todayIso = localDateIso(new Date());
  return todayIso >= deadlineIso;
}

/** Text fuer Tooltips / Toast / Inline-Warnung. Zentral, damit alle drei
 *  Stellen (Row-Icon, Approve-Warnung, Modal-Blocker) exakt gleich reden. */
export const TIME_ENTRY_LOCK_MESSAGE =
  "Zeitraum abgerechnet — nicht mehr änderbar";
