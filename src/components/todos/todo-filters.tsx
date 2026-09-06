"use client";

/**
 * Filter-Leiste der Todos-Seite.
 *
 * Drei Zonen (§10 URL-Query + localStorage; alle Filter server-seitig
 * ausgewertet):
 *   Links  — Scope-Segment (An mich / Von mir delegiert / Team / Alle)
 *            mit Live-Counts. Team/Alle nur wenn canSeeAll.
 *   Mitte  — Zeit-Segment (Heute+Ueberfaellig / Diese Woche / Alles)
 *            + Status-Segment (Offen / Erledigt / Geloescht)
 *   Rechts — Suche + Prio-Toggle "Nur dringend" + optional Personen-
 *            Filter (nur bei team/alle).
 */

import { Search, X, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/searchable-select";
import type { TodoScope, TodoStatus, TodoTimeFilter } from "@/lib/todos-query";
import type { Profile } from "@/types";

export interface FilterState {
  scope: TodoScope;
  status: TodoStatus;
  timeFilter: TodoTimeFilter;
  onlyUrgent: boolean;
  search: string;
  assigneeFilter: string;
}

export interface ScopeCounts { mine: number; delegated: number; team: number; all: number }

interface Props {
  state: FilterState;
  counts: ScopeCounts;
  canSeeAll: boolean;
  profiles: Profile[];
  onChange: (patch: Partial<FilterState>) => void;
}

function Seg<T extends string>({
  value, current, label, onClick, badge,
}: { value: T; current: T; label: string; onClick: (v: T) => void; badge?: number }) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={active ? "kasten-active" : "kasten-toggle-off"}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className={`ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-semibold px-1 ${
          active ? "bg-foreground/20" : "bg-foreground/[0.08] text-muted-foreground"
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}

export function TodoFilters({ state, counts, canSeeAll, profiles, onChange }: Props) {
  const showAssigneeFilter = canSeeAll && (state.scope === "team" || state.scope === "all");
  return (
    <div className="flex flex-col gap-3">
      {/* Scope + Zeit + Status in einer Reihe wo Platz reicht */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Seg value="mine"       current={state.scope} label="An mich"           onClick={(v) => onChange({ scope: v })} badge={counts.mine} />
          <Seg value="delegated"  current={state.scope} label="Von mir delegiert" onClick={(v) => onChange({ scope: v })} badge={counts.delegated} />
          {canSeeAll && <Seg value="team" current={state.scope} label="Team" onClick={(v) => onChange({ scope: v })} badge={counts.team} />}
          {canSeeAll && <Seg value="all"  current={state.scope} label="Alle" onClick={(v) => onChange({ scope: v })} badge={counts.all} />}
        </div>

        <span className="mx-1 h-6 w-px bg-border hidden sm:inline-block" aria-hidden />

        <div className="flex flex-wrap items-center gap-1.5">
          <Seg value="all"    current={state.timeFilter} label="Alles"              onClick={(v) => onChange({ timeFilter: v })} />
          <Seg value="urgent" current={state.timeFilter} label="Heute+Ueberfaellig" onClick={(v) => onChange({ timeFilter: v })} />
          <Seg value="week"   current={state.timeFilter} label="Diese Woche"        onClick={(v) => onChange({ timeFilter: v })} />
        </div>

        <span className="mx-1 h-6 w-px bg-border hidden sm:inline-block" aria-hidden />

        <div className="flex flex-wrap items-center gap-1.5">
          <Seg value="offen"     current={state.status} label="Offen"     onClick={(v) => onChange({ status: v })} />
          <Seg value="erledigt"  current={state.status} label="Erledigt"  onClick={(v) => onChange({ status: v })} />
          <Seg value="geloescht" current={state.status} label="Geloescht" onClick={(v) => onChange({ status: v })} />
        </div>
      </div>

      {/* Suche + Prio + Personen-Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Titel oder Beschreibung suchen ..."
            value={state.search}
            onChange={(e) => onChange({ search: e.target.value })}
            className="pl-9 h-9"
          />
        </div>

        <button
          type="button"
          onClick={() => onChange({ onlyUrgent: !state.onlyUrgent })}
          className={state.onlyUrgent ? "kasten kasten-red" : "kasten-toggle-off"}
          data-tooltip="Nur dringende Todos zeigen"
        >
          <AlertCircle className="h-3.5 w-3.5" />
          Nur dringend
        </button>

        {showAssigneeFilter && (
          <div className="w-full sm:w-56">
            <SearchableSelect
              value={state.assigneeFilter}
              onChange={(v) => onChange({ assigneeFilter: v || "all" })}
              items={[
                { id: "all", label: "Alle Personen" },
                ...profiles.map((p) => ({ id: p.id, label: p.full_name })),
              ]}
              clearable={false}
              active={state.assigneeFilter !== "all"}
              placeholder="Person filtern ..."
            />
          </div>
        )}

        {state.search && (
          <button
            type="button"
            onClick={() => onChange({ search: "" })}
            className="h-9 px-3 text-xs text-muted-foreground hover:text-foreground rounded-lg flex items-center gap-1.5 transition-colors"
            data-tooltip="Suche zuruecksetzen"
          >
            <X className="h-3.5 w-3.5" />
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
