/**
 * Todos — Query-Builder mit Scope/Zeit/Status/Prio/Suche + Server-Counts.
 *
 * Warum: Die alte Seite hatte alle Filter direkt inline im Component; die
 * Ableitung "an mich vs. von mir delegiert vs. Team" war gar nicht
 * moeglich (RLS mischt eigene + zugewiesene). Hier bauen wir die Query
 * einmal an einer Stelle und liefern sie fuer Liste + Segment-Badges.
 *
 * Backend bleibt unangetastet — nur andere Where-Klauseln auf der
 * bestehenden 'todos'-Tabelle.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIso, addDaysIso } from "@/lib/relative-date";

export type TodoScope = "mine" | "delegated" | "team" | "all";
export type TodoStatus = "offen" | "erledigt" | "geloescht";
export type TodoTimeFilter = "urgent" | "week" | "all";

export interface TodoQueryParams {
  scope: TodoScope;
  status: TodoStatus;
  timeFilter: TodoTimeFilter;
  onlyUrgent: boolean;
  search: string;
  /** Fuer Team/Alle-Modus: optional weitere Filterung auf ein Profil. */
  assigneeFilter: string; // "all" | UUID
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

  // Status-Filter
  if (params.status === "offen") {
    q = q.eq("status", "offen").is("deleted_at", null);
  } else if (params.status === "erledigt") {
    q = q.eq("status", "erledigt").is("deleted_at", null);
  } else {
    // geloescht
    q = q.not("deleted_at", "is", null);
  }

  // Scope-Filter (ueberlagert die RLS-Sicht):
  //  - mine:      assigned_to = self
  //  - delegated: created_by = self AND assigned_to != self (echtes Delegieren)
  //  - team:      alles was die RLS mit see-all liefert (ohne extra Einschraenkung)
  //  - all:       ebenfalls alles — semantisch identisch zu team, aber die UI
  //               nutzt es als "Alle inkl. anderer Personen"-Position.
  if (params.scope === "mine") {
    q = q.eq("assigned_to", params.userId);
  } else if (params.scope === "delegated") {
    q = q.eq("created_by", params.userId).neq("assigned_to", params.userId);
  }
  // team/all: keine Zusatz-Filter — RLS entscheidet via todos:see-all.

  // Personen-Filter (nur relevant fuer team/all): (created_by=X OR assigned_to=X)
  if ((params.scope === "team" || params.scope === "all") && params.assigneeFilter !== "all") {
    q = q.or(`created_by.eq.${params.assigneeFilter},assigned_to.eq.${params.assigneeFilter}`);
  }

  // Prio-Filter
  if (params.onlyUrgent) {
    q = q.eq("priority", "dringend");
  }

  // Zeit-Filter
  if (params.timeFilter === "urgent") {
    // Heute + Ueberfaellig = due_date <= heute (inkl. NULL nicht — die haben ja kein Datum).
    q = q.lte("due_date", todayIso());
  } else if (params.timeFilter === "week") {
    // Naechste 7 Tage inkl. heute.
    q = q.gte("due_date", todayIso()).lte("due_date", addDaysIso(todayIso(), 7));
  }
  // "all": kein Zeit-Filter.

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
 * Liefert die vier Scope-Counts fuer die Segment-Badges.
 * Alle Counts gehen gegen offen-und-nicht-geloescht — die Zahl im Header
 * soll "so viele offene Todos hast du in diesem Scope" bedeuten.
 * Ohne see-all sind team/all identisch zu mine+delegated (die RLS klemmt);
 * das ist ok, die Buttons werden dann sowieso ausgeblendet.
 */
export async function loadScopeCounts(
  supabase: SupabaseClient,
  userId: string,
  canSeeAll: boolean,
): Promise<{ mine: number; delegated: number; team: number; all: number }> {
  const base = () =>
    supabase.from("todos").select("id", { count: "exact", head: true }).eq("status", "offen").is("deleted_at", null);

  // PostgREST-Query-Builder ist PromiseLike, kein echtes Promise — deshalb
  // hier explizit "await Promise.resolve(...)" um Promise-typing zu bekommen.
  const [mineRes, delRes, teamRes] = await Promise.all([
    Promise.resolve(base().eq("assigned_to", userId)),
    Promise.resolve(base().eq("created_by", userId).neq("assigned_to", userId)),
    canSeeAll ? Promise.resolve(base()) : Promise.resolve({ count: 0 as number | null }),
  ]);

  const teamCount = teamRes.count ?? 0;
  return {
    mine: mineRes.count ?? 0,
    delegated: delRes.count ?? 0,
    // team + all bekommen dieselbe unbeschraenkte Sicht (Segment-Semantik:
    // "team" = alles was RLS mich sehen laesst; "all" = extra-explizit gleiche
    // Zahl — wir zeigen sie NUR wenn see-all).
    team: teamCount,
    all: teamCount,
  };
}
