-- Todos-Refactor (Audit-Befund Mai 2026):
--   1. Strikte Per-User-RLS — vorher konnte jeder authenticated User alle
--      Todos lesen/bearbeiten. Jetzt nur eigene (created_by = self) oder
--      einem zugewiesene (assigned_to = self).
--   2. Priority von 4 auf 2 Stufen — Konsistenz mit Auftrags-Priority
--      (normal/dringend), niedrig+hoch wurden empirisch nie sinnvoll genutzt.
--   3. Anhaenge in eigene Tabelle todo_attachments — vorher als JSON in
--      todos.description serialisiert, was bei manuellen DB-Edits verloren
--      ging und keine sauberen Counts/Indizes erlaubte.

-- === 1. Per-User-RLS ===
drop policy if exists "Todos sind sichtbar"              on public.todos;
drop policy if exists "Benutzer können Todos erstellen"  on public.todos;
drop policy if exists "Benutzer können Todos bearbeiten" on public.todos;
drop policy if exists "Admins können Todos löschen"      on public.todos;
-- Legacy-Policies aus aelteren Setups (PROD hatte Kurzbezeichner)
drop policy if exists "td1" on public.todos;
drop policy if exists "td2" on public.todos;
drop policy if exists "td3" on public.todos;
drop policy if exists "td4" on public.todos;

create policy "Eigene Todos sichtbar"
  on public.todos for select to authenticated
  using (created_by = auth.uid() or assigned_to = auth.uid());

create policy "Eigene Todos erstellen"
  on public.todos for insert to authenticated
  with check (created_by = auth.uid());

create policy "Eigene Todos bearbeiten"
  on public.todos for update to authenticated
  using (created_by = auth.uid() or assigned_to = auth.uid());

create policy "Eigene Todos loeschen"
  on public.todos for delete to authenticated
  using (created_by = auth.uid());

-- === 2. Priority auf 2 Stufen ===
update public.todos set priority = 'normal' where priority in ('niedrig', 'hoch');

alter table public.todos drop constraint if exists todos_priority_check;
alter table public.todos
  add constraint todos_priority_check
  check (priority in ('normal', 'dringend'));

-- === 3. Anhaenge in eigene Tabelle ===
create table if not exists public.todo_attachments (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references public.todos(id) on delete cascade,
  name text not null,
  path text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles(id)
);

create index if not exists idx_todo_attachments_todo_id on public.todo_attachments(todo_id);

alter table public.todo_attachments enable row level security;

create policy "Eigene Todo-Anhaenge sichtbar"
  on public.todo_attachments for select to authenticated
  using (exists (
    select 1 from public.todos t
    where t.id = todo_id and (t.created_by = auth.uid() or t.assigned_to = auth.uid())
  ));

create policy "Eigene Todo-Anhaenge erstellen"
  on public.todo_attachments for insert to authenticated
  with check (exists (
    select 1 from public.todos t
    where t.id = todo_id and (t.created_by = auth.uid() or t.assigned_to = auth.uid())
  ));

create policy "Eigene Todo-Anhaenge loeschen"
  on public.todo_attachments for delete to authenticated
  using (exists (
    select 1 from public.todos t
    where t.id = todo_id and (t.created_by = auth.uid() or t.assigned_to = auth.uid())
  ));

-- === 4. Daten-Migration: bestehende JSON-Anhaenge in neue Tabelle ===
-- Alte Form: description = {"_text": "...", "_attachments": [{name, path, uploaded_at}]}
-- Neue Form: description = plain text, Anhaenge in todo_attachments.
do $$
declare
  t record;
  parsed jsonb;
  att jsonb;
begin
  for t in select id, description, created_by from public.todos
           where description like '{%"_attachments%' loop
    begin
      parsed := t.description::jsonb;
      if parsed ? '_attachments' then
        for att in select * from jsonb_array_elements(parsed->'_attachments') loop
          insert into public.todo_attachments (todo_id, name, path, uploaded_at, uploaded_by)
          values (
            t.id,
            att->>'name',
            att->>'path',
            coalesce((att->>'uploaded_at')::timestamptz, now()),
            t.created_by
          );
        end loop;
        update public.todos set description = parsed->>'_text' where id = t.id;
      end if;
    exception when others then
      -- Nicht parsbare Reihen unveraendert lassen.
      null;
    end;
  end loop;
end $$;
