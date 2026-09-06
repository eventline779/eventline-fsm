/**
 * Relative-Datum-Helper fuer Todos & Aehnliches.
 *
 * Alle Berechnungen im Lokal-Kalender Europe/Zurich (Grundregel §4:
 * Datumsanzeige IMMER mit timeZone). due_date-Spalten sind vom Typ DATE
 * (nicht timestamptz) — deshalb wird der ISO-String im Format YYYY-MM-DD
 * ueber Date.UTC(y,m-1,d,12) instanziert um Vortag-Bugs bei UTC-Konvert
 * zu vermeiden.
 */
import { localDateIso } from "@/lib/swiss-time";

/** Heute im Lokal-Kalender (YYYY-MM-DD). */
export function todayIso(): string {
  return localDateIso(new Date());
}

/** Tage-Diff (Lokal-Kalender). Positiv = Ziel liegt in der Zukunft. */
export function daysDiff(fromIso: string, toIso: string): number {
  const [y1, m1, d1] = fromIso.split("-").map(Number);
  const [y2, m2, d2] = toIso.split("-").map(Number);
  const from = Date.UTC(y1, m1 - 1, d1);
  const to = Date.UTC(y2, m2 - 1, d2);
  return Math.round((to - from) / 86_400_000);
}

/** Verschiebt ein YYYY-MM-DD um N Tage im Lokal-Kalender. */
export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 12));
  noon.setUTCDate(noon.getUTCDate() + n);
  return localDateIso(noon);
}

/** Naechster Wochentag ab heute (0=Sonntag..6=Samstag). Wenn heute schon
 *  der Wochentag ist, springe eine Woche weiter (typisches "Freitag"-
 *  Verhalten in Task-Apps). */
export function nextWeekdayIso(weekday: number, fromIso: string = todayIso()): string {
  const [y, m, d] = fromIso.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12));
  // getUTCDay ist hier ok — wir haben Mittag-UTC gebaut und Europe/Zurich
  // liegt Vormittag/Nachmittag am gleichen Kalendertag.
  const cur = base.getUTCDay();
  let delta = (weekday - cur + 7) % 7;
  if (delta === 0) delta = 7;
  return addDaysIso(fromIso, delta);
}

/** Formatiert ein YYYY-MM-DD als "de-CH"-Datum (dd.MM.yyyy) via TZ Zurich. */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" });
}

export interface RelativeLabel {
  /** Kurzes Label fuer die Row ("Heute", "Ueberfaellig 2 Tage"). */
  label: string;
  /** Ausfuehrliches Tooltip (hart-Datum). */
  tooltip: string;
  /** True wenn faellig in Vergangenheit + noch offen. */
  overdue: boolean;
  /** True wenn faellig heute. */
  today: boolean;
  /** True wenn faellig innerhalb der naechsten 7 Kalender-Tage (exkl. heute). */
  thisWeek: boolean;
}

/** Baut das Relativ-Label fuer eine Faelligkeit. Overdue-Bit wird nur
 *  aus dem Datum abgeleitet — der Aufrufer muss selber pruefen ob das
 *  Todo noch "offen" ist (sonst waere ein erledigtes Todo "ueberfaellig"). */
export function relativeDueLabel(dueIso: string, todayIsoStr: string = todayIso()): RelativeLabel {
  const diff = daysDiff(todayIsoStr, dueIso);
  const tooltip = formatIsoDate(dueIso);
  if (diff === 0) return { label: "Heute", tooltip, overdue: false, today: true, thisWeek: false };
  if (diff === 1) return { label: "Morgen", tooltip, overdue: false, today: false, thisWeek: true };
  if (diff === -1) return { label: "Gestern überfällig", tooltip, overdue: true, today: false, thisWeek: false };
  if (diff < -1) return { label: `Überfällig ${Math.abs(diff)} Tage`, tooltip, overdue: true, today: false, thisWeek: false };
  if (diff <= 7) return { label: `In ${diff} Tagen`, tooltip, overdue: false, today: false, thisWeek: true };
  // Alles darueber: hartes Datum
  return { label: tooltip, tooltip, overdue: false, today: false, thisWeek: false };
}

/** Gruppierungs-Bucket fuer die Section-Header. */
export type GroupBucket = "overdue" | "today" | "tomorrow" | "thisWeek" | "later" | "noDate";

export function bucketForDue(dueIso: string | null, todayIsoStr: string = todayIso()): GroupBucket {
  if (!dueIso) return "noDate";
  const diff = daysDiff(todayIsoStr, dueIso);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff <= 7) return "thisWeek";
  return "later";
}

export const GROUP_LABEL: Record<GroupBucket, string> = {
  overdue: "Überfällig",
  today: "Heute",
  tomorrow: "Morgen",
  thisWeek: "Diese Woche",
  later: "Spaeter",
  noDate: "Ohne Datum",
};

export const GROUP_ORDER: GroupBucket[] = ["overdue", "today", "tomorrow", "thisWeek", "later", "noDate"];
