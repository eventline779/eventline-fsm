/**
 * Todos — Query-Builder (drastisch vereinfacht 2026-09).
 *
 * Vorher hatten wir 4 Filter-Achsen (scope × status × timeFilter × onlyUrgent)
 * + Personen-Filter + Suche. Das war zu viel — der User war ueberfordert.
 *
 * Jetzt nur noch: scope (mine/delegated/all) + showCompleted (an/aus) +
 * Suche. Sortierung (Prio > Faelligkeit > Erstellungsdatum) macht die
 * Reihenfolge selbst-erklaerend — Zeit-/Prio-Filter braucht keiner mehr.
 *
 * Geloeschte Todos werden IMMER ausgeblendet (kein "Geloescht"-View mehr).
 * Wer wiederherstellen will: aus DB via Admin.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type TodoScope = "mine" | "delegated" | "all";

export interface TodoQueryParams {
  scope: TodoScope;
  /** Wenn true: erledigte MIT anzeigen. Sonst nur offene. */
  showCompleted: boolean;
  search: string;
  /** ID des angemeldeten Users (Pflicht — sonst kein scope moeglich). */
  userId: string;
}

/**
 * Baut eine Supabase-Query auf 'todos' mit den gegebenen Filtern.
 * Sortierung: dringend zuerst, dann due_date asc (nullsFirst=false),
 * dann created_at desc, dann id desc als Tiebreaker + Cursor-Key.
 *
 * cursor.id: Keyset-Pagination — beim Nachladen id < letzter.id.
 * Reicht als Cursor weil id UUID + wir die Reihenfolge id desc als
 * letzte Ebene haben.
 */
export function buildTodosQuery(
  supabase: SupabaseClient,
  params: TodoQueryParams,
  cursor: { id: string } | null,
  limit: number,
) {
  let q = supabase
    .from("todos")
    .select("*, assignee:profiles!assigned_to(full_name), creator:profiles!created_by(full_name), attachments:todo_attachments(id)");

  // Nie geloeschte Todos anzeigen.
  q = q.is("deleted_at", null);

  // Status-Filter: default = nur offen. Mit showCompleted: offen + erledigt.
  if (!params.showCompleted) {
    q = q.eq("status", "offen");
  }

  // Scope-Filter:
  //  - mine:      assigned_to = self
  //  - delegated: created_by = self AND assigned_to != self (echtes Delegieren)
  //  - all:       alles was die RLS mit see-all liefert (nur wenn canSeeAll)
  if (params.scope === "mine") {
    q = q.eq("assigned_to", params.userId);
  } else if (params.scope === "delegated") {
    q = q.eq("created_by", params.userId).neq("assigned_to", params.userId);
  }
  // all: keine Zusatz-Filter — RLS entscheidet via todos:see-all.

  // Volltext-Suche (title + description).
  const term = params.search.trim();
  if (term.length > 0) {
    const like = `%${term.replace(/[%_]/g, "\\$&")}%`;
    q = q.or(`title.ilike.${like},description.ilike.${like}`);
  }

  // Keyset-Cursor
  if (cursor !== null) {
    q = q.lt("id", cursor.id);
  }

  // Sortierung: Prio zuerst, dann Faelligkeit, dann Erstellungsdatum, dann id
  // desc als deterministischer Tiebreaker (auch Cursor-Key).
  // Achtung: priority ist enum-Text, "dringend" < "normal" alphabetisch → asc
  // ordnet dringend zuerst. Fallback wenn sich das Enum aendert: expliziter
  // Order-Ausdruck ueber CASE.
  return q
    .order("priority", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
}

/**
 * Liefert die Scope-Counts fuer die Segment-Badges. Alle Counts gegen
 * "offen und nicht geloescht" — die Zahl im Segment soll bedeuten
 * "so viele offene Todos hast du in diesem Scope".
 * Ohne see-all ist "all" 0 (der Button wird sowieso ausgeblendet).
 */
export async function loadScopeCounts(
  supabase: SupabaseClient,
  userId: string,
  canSeeAll: boolean,
): Promise<{ mine: number; delegated: number; all: number }> {
  const base = () =>
    supabase.from("todos").select("id", { count: "exact", head: true }).eq("status", "offen").is("deleted_at", null);

  // PostgREST-Query-Builder ist PromiseLike, kein echtes Promise — deshalb
  // hier explizit "await Promise.resolve(...)" um Promise-typing zu bekommen.
  const [mineRes, delRes, allRes] = await Promise.all([
    Promise.resolve(base().eq("assigned_to", userId)),
    Promise.resolve(base().eq("created_by", userId).neq("assigned_to", userId)),
    canSeeAll ? Promise.resolve(base()) : Promise.resolve({ count: 0 as number | null }),
  ]);

  return {
    mine: mineRes.count ?? 0,
    delegated: delRes.count ?? 0,
    all: allRes.count ?? 0,
  };
}
