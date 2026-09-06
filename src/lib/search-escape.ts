/**
 * Such-Input-Escape-Helper fuer PostgREST/Supabase.
 *
 * Zwei Ebenen:
 *  1. escapeForOr    — Escaped Zeichen die den .or(...)-Filter-Ausdruck
 *                      selbst zerbrechen wuerden (Komma, Klammern, Stern,
 *                      Backslash). Ohne das sprengt ein User-Term mit ","
 *                      oder "(" die gesamte Query still (Supabase parst
 *                      die Filter-Grammar und wirft "unexpected token").
 *  2. escapeLikeWildcards — Escaped die LIKE/ILIKE-Wildcards % und _ .
 *                      Ohne das kaempft der User gegen die Datenbank
 *                      (Tippt "50_%" und trifft alles), im Worst Case
 *                      DoS-artige Query auf grossen Tabellen.
 *
 * Fuer typische Suchleisten wollen wir BEIDE — daher der Wrapper
 * `escapeForIlike` der den Term erst LIKE-safe macht und danach fuer
 * .or() safe macht.
 *
 * NIE `raw` in einen .or() oder .ilike()-Wert einsetzen, ohne diese
 * Helper genutzt zu haben.
 */

/** Escaped Zeichen die .or(...)-Filter-Grammar zerbrechen. */
export function escapeForOr(s: string): string {
  return s.replace(/[,()*\\]/g, "\\$&");
}

/** Escaped ILIKE/LIKE-Wildcards (% und _) mit Backslash. */
export function escapeLikeWildcards(s: string): string {
  return s.replace(/[%_]/g, "\\$&");
}

/**
 * Vollstaendiger Escape fuer einen User-Suchterm der in einem
 * `.or()`-Ausdruck als `.ilike.` Wert landet — also der Regelfall
 * fuer Suchleisten (Kunden, Auftraege, Tickets …).
 * Reihenfolge wichtig: erst Wildcards escapen (fuegt Backslash ein),
 * dann OR-Zeichen escapen (escapet auch den frischen Backslash).
 */
export function escapeForIlike(s: string): string {
  return escapeForOr(escapeLikeWildcards(s));
}

/**
 * UUID-Validator (RFC-4122 v1-v5 sowie das Null-UUID) — z.B. bevor
 * eine profileId aus dem Route-Param in eine .or()/.eq()-Query
 * eingesetzt wird. PostgREST wirft sonst 500er wenn der Wert nicht
 * matched, oder — bei .or() — sprengt die Filter-Grammar.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: string | null | undefined): s is string {
  if (!s) return false;
  return UUID_RE.test(s);
}
