-- Action-Level-Permissions: bisher waren permissions nur Modul-Slugs
-- ("kunden") = "Modul ist sichtbar". Jetzt: "module:action"-Strings
-- ("kunden:view", "kunden:edit", "kunden:delete") damit pro Rolle pro
-- Aktion gesteuert werden kann.
--
-- has_permission(perm) ist die zentrale RLS-Pruefung — admin bekommt
-- IMMER true (sonst koennten sich Admins selbst aussperren), alle anderen
-- Rollen sehen nur was in ihrer permissions-jsonb-Liste steht.
--
-- Die alten policies (c1/c2/c3, j1-j4, l1-l3, rooms_*) werden durch
-- saubere Permissionen-basierte Policies ersetzt. Die assigned-techniker-
-- Sonderregel auf jobs (techs koennen ihre eigenen Aufträge updaten) bleibt
-- erhalten als zweite UPDATE-Policy — RLS ORt PERMISSIVE-Policies, wer
-- entweder die Permission ODER die Job-Zuweisung hat, darf updaten.

-- === 1. has_permission()-Helper ===
create or replace function public.has_permission(perm text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.slug = p.role
    where p.id = auth.uid()
    and (r.slug = 'admin' or r.permissions ? perm)
  );
$$;

-- === 2. Bestehende Rollen auf neue Permission-Shape migrieren ===
-- admin: alle Aktionen auf allen Modulen.
-- techniker: nur view-Permissions (Lesen). Edit/Create/Delete muss der
--   Admin bewusst pro Modul aktivieren. Die Sonderregel "techniker kann
--   eigene Aufträge updaten" lebt in der jobs-RLS-Policy weiter, also
--   geht der Standard-Workflow nicht verloren.
update public.roles set permissions = '[
  "kalender:view",
  "auftraege:view","auftraege:create","auftraege:edit","auftraege:delete",
  "vertrieb:view",
  "locations:view","locations:create","locations:edit","locations:delete",
  "kunden:view","kunden:create","kunden:edit","kunden:delete",
  "partner:view","partner:create","partner:edit","partner:delete",
  "hr:view",
  "einstellungen:view"
]'::jsonb
where slug = 'admin';

update public.roles set permissions = '[
  "kalender:view",
  "auftraege:view",
  "locations:view",
  "kunden:view",
  "partner:view",
  "hr:view"
]'::jsonb
where slug = 'techniker';

-- === 3. customers RLS ===
drop policy if exists "c1" on public.customers;
drop policy if exists "c2" on public.customers;
drop policy if exists "c3" on public.customers;

create policy "customers_select" on public.customers for select to authenticated
  using (public.has_permission('kunden:view'));
create policy "customers_insert" on public.customers for insert to authenticated
  with check (public.has_permission('kunden:create'));
create policy "customers_update" on public.customers for update to authenticated
  using (public.has_permission('kunden:edit'));
create policy "customers_delete" on public.customers for delete to authenticated
  using (public.has_permission('kunden:delete'));

-- === 4. jobs RLS ===
drop policy if exists "j1" on public.jobs;
drop policy if exists "j2" on public.jobs;
drop policy if exists "j3" on public.jobs;
drop policy if exists "j4" on public.jobs;

create policy "jobs_select" on public.jobs for select to authenticated
  using (public.has_permission('auftraege:view'));
create policy "jobs_insert" on public.jobs for insert to authenticated
  with check (public.has_permission('auftraege:create'));
create policy "jobs_update_perm" on public.jobs for update to authenticated
  using (public.has_permission('auftraege:edit'));
-- Sonderregel: zugewiesene Techniker duerfen "ihren" Job updaten auch ohne
-- globales auftraege:edit (Status setzen, Notizen schreiben). PERMISSIVE-OR.
create policy "jobs_update_assigned" on public.jobs for update to authenticated
  using (exists (
    select 1 from public.job_assignments
    where job_assignments.job_id = jobs.id
    and job_assignments.profile_id = auth.uid()
  ));
create policy "jobs_delete" on public.jobs for delete to authenticated
  using (public.has_permission('auftraege:delete'));

-- === 5. locations RLS ===
drop policy if exists "l1" on public.locations;
drop policy if exists "l2" on public.locations;
drop policy if exists "l3" on public.locations;

create policy "locations_select" on public.locations for select to authenticated
  using (public.has_permission('locations:view'));
create policy "locations_insert" on public.locations for insert to authenticated
  with check (public.has_permission('locations:create'));
create policy "locations_update" on public.locations for update to authenticated
  using (public.has_permission('locations:edit'));
create policy "locations_delete" on public.locations for delete to authenticated
  using (public.has_permission('locations:delete'));

-- === 6. rooms RLS ===
drop policy if exists "rooms_select" on public.rooms;
drop policy if exists "rooms_insert" on public.rooms;
drop policy if exists "rooms_update" on public.rooms;
drop policy if exists "rooms_delete" on public.rooms;

create policy "rooms_select" on public.rooms for select to authenticated
  using (public.has_permission('locations:view'));
create policy "rooms_insert" on public.rooms for insert to authenticated
  with check (public.has_permission('locations:create'));
create policy "rooms_update" on public.rooms for update to authenticated
  using (public.has_permission('locations:edit'));
create policy "rooms_delete" on public.rooms for delete to authenticated
  using (public.has_permission('locations:delete'));
