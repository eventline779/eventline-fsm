-- Migration 207: konfigurierbares Dashboard
--
-- Zwei Ebenen der Anpassung:
--   1) Rollen-Set: Admin legt pro Rolle fest, welche Widgets in welcher
--      Reihenfolge angezeigt werden (roles.dashboard_widgets).
--   2) Persoenliche Overrides: jeder User kann eigene Widgets ausblenden
--      und die Reihenfolge fuer sich anpassen (user_dashboard_overrides).
--
-- Datenmodell (bewusst so gewaehlt):
--   Wir speichern KEINE 'shown'-Liste. Das Rollen-/User-Objekt beschreibt
--   nur (a) welche IDs ausgeblendet sind und (b) in welcher Reihenfolge.
--   Neue Widget-IDs die spaeter in die Registry (src/lib/dashboard-widgets.tsx)
--   kommen, tauchen damit automatisch fuer alle passenden Rollen/User auf,
--   ohne dass ein Backfill noetig ist.
--
--   'order' als Spaltenname ist ein SQL-Keyword — wir nehmen absichtlich
--   'widget_order', damit Queries nicht standardmaessig quoten muessen.

-- 1) Rollen-Override
alter table public.roles
  add column if not exists dashboard_widgets jsonb default null;

comment on column public.roles.dashboard_widgets is
  'Rollen-Override fuer das Dashboard. NULL = Default-Registry-Set (siehe src/lib/dashboard-widgets.tsx). Sonst {order: string[], hidden: string[]}. Admin (is_system=true) ignoriert das Feld — die Admin-Rolle sieht immer alle Widgets die es zu ihrer Rolle gibt.';

-- 2) User-Override
create table if not exists public.user_dashboard_overrides (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  hidden text[] not null default '{}',
  -- 'order' ist SQL-Keyword — Spalte heisst deshalb widget_order.
  widget_order text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_dashboard_overrides is
  'Persoenliche Dashboard-Anpassungen pro User. Ueberschreibt (subtraktiv) das Rollen-Set aus roles.dashboard_widgets. hidden = Widget-IDs die dieser User ausblendet; widget_order = Wunsch-Reihenfolge (greedy: erst gelistete IDs in dieser Reihenfolge, dann alle restlichen sichtbaren IDs in der Reihenfolge des Rollen-Sets).';

comment on column public.user_dashboard_overrides.hidden is
  'Widget-IDs die dieser User NICHT sehen will. Neue IDs die spaeter in die Registry kommen sind automatisch sichtbar (nicht in hidden).';

comment on column public.user_dashboard_overrides.widget_order is
  'Wunsch-Reihenfolge der sichtbaren Widget-IDs. Greedy angewendet — IDs die nicht (mehr) sichtbar sind, werden ignoriert.';

-- Trigger: updated_at automatisch pflegen (globale update_updated_at() aus Migration 013).
drop trigger if exists user_dashboard_overrides_updated_at on public.user_dashboard_overrides;
create trigger user_dashboard_overrides_updated_at
  before update on public.user_dashboard_overrides
  for each row execute function public.update_updated_at();

-- RLS: strikt eigener User (§5 CLAUDE.md — alle 4 Verben explizit).
alter table public.user_dashboard_overrides enable row level security;

drop policy if exists "user_dashboard_overrides_select" on public.user_dashboard_overrides;
create policy "user_dashboard_overrides_select"
  on public.user_dashboard_overrides for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_dashboard_overrides_insert" on public.user_dashboard_overrides;
create policy "user_dashboard_overrides_insert"
  on public.user_dashboard_overrides for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_dashboard_overrides_update" on public.user_dashboard_overrides;
create policy "user_dashboard_overrides_update"
  on public.user_dashboard_overrides for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_dashboard_overrides_delete" on public.user_dashboard_overrides;
create policy "user_dashboard_overrides_delete"
  on public.user_dashboard_overrides for delete to authenticated
  using (auth.uid() = user_id);
