-- Option A: Teamleiter-Scope-System.
--
-- Neuer Zugriffs-Layer zusaetzlich zum bestehenden Permission-System.
-- Bisher: 'self' (Owner-only) oder 'all' (has_permission('*:see-all')).
-- Neu:    dazwischen ein 'team'-Scope — Rolle sieht (und ggf. bearbeitet)
--         nur die Datensaetze der Mitarbeiter, deren team_lead_id auf
--         den aktuellen User zeigt.
--
-- Zwei Bausteine:
--   1) roles.scope  ('self' | 'team' | 'all')
--   2) profiles.team_lead_id (FK auf profiles.id)
--
-- Zentraler Helper sees_user(target_uid) kapselt die Logik — Policies
-- rufen nur diesen Wrapper auf, damit die Sichtbarkeits-Regel an EINER
-- Stelle sitzt (analog zu has_permission() aus Migration 049 und
-- is_admin_or_lead() aus 166).
--
-- Bestehende Policies bleiben unveraendert; wir HAENGEN pro Table nur
-- eine zusaetzliche PERMISSIVE-Policy `<table>_select_team` (und wo
-- semantisch sinnvoll `_update_team`) an. PERMISSIVE-OR heisst: eine
-- Zeile ist sichtbar/editierbar, wenn irgendeine Policy zutrifft — die
-- neuen Team-Zweige oeffnen also nur zusaetzliche Sicht, nehmen keine weg.
--
-- Explizit AUSGENOMMEN (Owner-only Semantik bleibt):
--   - time_off.UPDATE  (Team-Leiter darf nur SEHEN; Genehmigen lief
--     schon immer ueber die separate Permission 'ferien:approve')
--   - tickets.UPDATE   (Owner-only im offenen Status, sonst tickets:manage)
--   - project_time_entries.UPDATE (nur Owner + Admin duerfen eigene
--     Projekt-Stempel korrigieren)
--   - job_appointments.UPDATE (bleibt an kalender:edit; siehe Kommentar
--     bei job_appointments_select_team unten)

-- =====================================================================
-- 1. Schema-Erweiterungen
-- =====================================================================

-- roles.scope: gilt fuer JEDEN Zugriff der Rolle. Default 'self' = wie bisher.
alter table public.roles
  add column if not exists scope text not null default 'self'
  check (scope in ('self', 'team', 'all'));

comment on column public.roles.scope is
  'Zugriffs-Reichweite der Rolle: self = nur eigene Datensaetze (Default), '
  'team = zusaetzlich Datensaetze der Mitarbeiter mit team_lead_id = auth.uid(), '
  'all = alle Datensaetze. Wird zusammen mit den *-see-all/*-edit-all-'
  'Permissions ausgewertet (PERMISSIVE OR). Admin ist immer scope=all.';

-- profiles.team_lead_id: pro Mitarbeiter EIN Teamleiter (NULL = keiner).
alter table public.profiles
  add column if not exists team_lead_id uuid
  references public.profiles(id) on delete set null;

create index if not exists profiles_team_lead_idx
  on public.profiles(team_lead_id);

comment on column public.profiles.team_lead_id is
  'FK auf den Teamleiter dieses Mitarbeiters. NULL = kein Teamleiter. '
  'Wird von sees_user() gelesen um scope=team-Zugriffe aufzuloesen.';

-- =====================================================================
-- 2. Helper-Funktionen
-- =====================================================================

-- get_my_scope: liest die scope-Spalte der Rolle des aktuellen Users.
-- Admin bekommt IMMER 'all' (analog zu has_permission()), damit sich
-- niemand versehentlich selber aussperren kann.
create or replace function public.get_my_scope()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_admin() then 'all'
    else coalesce(
      (select r.scope
         from public.profiles p
         join public.roles r on r.slug = p.role
        where p.id = auth.uid()),
      'self'
    )
  end;
$$;

grant execute on function public.get_my_scope() to authenticated;

-- sees_user: darf der aktuelle User Datensaetze des target-Users sehen?
-- Kern-Logik, an EINER Stelle:
--   - target = ich selbst              → true (Owner-Rechte)
--   - Admin                            → true
--   - scope = 'all'                    → true
--   - scope = 'team' UND target.team_lead_id = ich → true
--   - sonst                            → false
create or replace function public.sees_user(target_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_uid = auth.uid()
    or public.is_admin()
    or public.get_my_scope() = 'all'
    or (
      public.get_my_scope() = 'team'
      and exists (
        select 1 from public.profiles p
         where p.id = target_uid
           and p.team_lead_id = auth.uid()
      )
    );
$$;

grant execute on function public.sees_user(uuid) to authenticated;

-- =====================================================================
-- 3. RLS-Sweep — zusaetzliche team-Zweige pro Tabelle
--    (bestehende Policies aus 049/061/073/082/091/167/188 bleiben)
-- =====================================================================

-- ─────── time_entries ───────
drop policy if exists "time_entries_select_team" on public.time_entries;
create policy "time_entries_select_team" on public.time_entries
  for select to authenticated
  using (public.sees_user(user_id));

drop policy if exists "time_entries_update_team" on public.time_entries;
create policy "time_entries_update_team" on public.time_entries
  for update to authenticated
  using (public.sees_user(user_id))
  with check (public.sees_user(user_id));

-- DELETE bleibt bewusst NICHT erweitert — Loeschen von Stempelzeiten
-- ist eine destruktive Aktion, dafuer soll weiterhin 'stempelzeiten:edit-all'
-- explizit vergeben werden. Team-Leiter sehen und korrigieren (UPDATE),
-- loeschen aber nur mit expliziter Permission.

-- ─────── todos ───────
-- Owner ist ENTWEDER created_by ODER assigned_to — beide zaehlen.
drop policy if exists "todos_select_team" on public.todos;
create policy "todos_select_team" on public.todos
  for select to authenticated
  using (public.sees_user(created_by) or public.sees_user(assigned_to));

drop policy if exists "todos_update_team" on public.todos;
create policy "todos_update_team" on public.todos
  for update to authenticated
  using (public.sees_user(created_by) or public.sees_user(assigned_to))
  with check (public.sees_user(created_by) or public.sees_user(assigned_to));

-- ─────── time_off (Ferien) ───────
-- Nur SELECT — UPDATE bleibt Owner-only (Genehmigen laeuft ueber die
-- separate Permission 'ferien:approve', siehe Migration 082).
drop policy if exists "time_off_select_team" on public.time_off;
create policy "time_off_select_team" on public.time_off
  for select to authenticated
  using (public.sees_user(user_id));

-- ─────── tickets ───────
-- Nur SELECT — UPDATE bleibt strikt: Owner darf im offenen Status,
-- alle anderen Aenderungen ueber 'tickets:manage' (Migration 061).
drop policy if exists "tickets_select_team" on public.tickets;
create policy "tickets_select_team" on public.tickets
  for select to authenticated
  using (public.sees_user(created_by) or public.sees_user(assigned_to));

-- ─────── job_appointments (Termine) ───────
-- Nur SELECT — UPDATE bleibt an 'kalender:edit' (Migration 073). Ein
-- Team-Leiter der Termine seines Teams tatsaechlich verschieben soll
-- braucht 'kalender:edit' zusaetzlich in der Rolle. So bleibt die
-- Semantik zwischen "Terminkalender sehen" und "Termine planen" sauber
-- getrennt.
drop policy if exists "job_appointments_select_team" on public.job_appointments;
create policy "job_appointments_select_team" on public.job_appointments
  for select to authenticated
  using (public.sees_user(assigned_to));

-- ─────── project_time_entries (Projekt-Stempel) ───────
-- Nur SELECT — UPDATE bleibt Owner-only (Migration 188), damit fremde
-- Projekt-Stempel nicht via Team-Scope korrigiert werden. Admin kann
-- weiterhin alles.
drop policy if exists "pte_select_team" on public.project_time_entries;
create policy "pte_select_team" on public.project_time_entries
  for select to authenticated
  using (public.sees_user(user_id));

-- =====================================================================
-- 4. profiles: keine RLS-Aenderung — team_lead_id ist nur Schema.
--    Die bestehende profiles-Sicht (Migration 053+054) reicht: der Wert
--    wird von sees_user() SECURITY DEFINER gelesen, also unabhaengig
--    vom Client-Zugriff.
-- =====================================================================
