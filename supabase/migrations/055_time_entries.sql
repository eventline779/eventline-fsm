-- Stempel-System: Zeiterfassung pro User mit optionalem Auftrags-Bezug.
--
-- Achtung: PROD hat eine Legacy-Version dieser Tabelle (von der entfernten
-- Stempelzeiten-Funktion) mit profile_id, break_minutes, category. Diese
-- Migration migriert das Schema in-place — Datenbestand bleibt erhalten.

-- === 1. Legacy-Policies abraeumen ===
drop policy if exists te1 on public.time_entries;
drop policy if exists te2 on public.time_entries;
drop policy if exists te3 on public.time_entries;
drop policy if exists te4 on public.time_entries;

-- === 2. Spalten-Rename + neue Spalten ===
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='time_entries' and column_name='profile_id'
  ) then
    alter table public.time_entries rename column profile_id to user_id;
  end if;
end $$;

alter table public.time_entries add column if not exists description text;

-- === 3. Legacy-Daten in description backfilen ===
-- Wenn job_id NULL und description leer: aus notes oder category nehmen,
-- sonst Platzhalter "Legacy-Eintrag". Per DO-Block damit category-Zugriff
-- nur passiert wenn die Spalte existiert (vermeidet Compile-Fehler).
do $$
declare
  has_category boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='time_entries' and column_name='category'
  ) into has_category;

  if has_category then
    execute $sql$
      update public.time_entries
        set description = coalesce(
          nullif(trim(notes), ''),
          nullif(trim(category::text), ''),
          'Legacy-Eintrag'
        )
        where job_id is null and (description is null or trim(description) = '');
    $sql$;
  else
    update public.time_entries
      set description = coalesce(nullif(trim(notes), ''), 'Legacy-Eintrag')
      where job_id is null and (description is null or trim(description) = '');
  end if;
end $$;

-- === 4. Legacy-Spalten droppen ===
alter table public.time_entries drop column if exists break_minutes;
alter table public.time_entries drop column if exists category;

-- === 5. Constraints ===
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'time_entries_job_or_description') then
    alter table public.time_entries
      add constraint time_entries_job_or_description
      check (job_id is not null or (description is not null and length(trim(description)) > 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'time_entries_clock_out_after_in') then
    alter table public.time_entries
      add constraint time_entries_clock_out_after_in
      check (clock_out is null or clock_out >= clock_in);
  end if;
end $$;

-- === 6. Indizes ===
create unique index if not exists time_entries_one_active_per_user
  on public.time_entries(user_id) where clock_out is null;
create index if not exists idx_time_entries_user_id on public.time_entries(user_id);
create index if not exists idx_time_entries_job_id on public.time_entries(job_id);
create index if not exists idx_time_entries_clock_in on public.time_entries(clock_in desc);

-- === 7. RLS ===
alter table public.time_entries enable row level security;

create policy "time_entries_select_own"
  on public.time_entries for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "time_entries_insert_own"
  on public.time_entries for insert to authenticated
  with check (user_id = auth.uid());

create policy "time_entries_update_own"
  on public.time_entries for update to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "time_entries_delete_own"
  on public.time_entries for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- === 8. Admin-Funktion: alle Eintraege mit Joined-User+Job-Info ===
create or replace function public.get_all_time_entries(
  filter_user_id uuid default null,
  filter_from timestamptz default null,
  filter_to timestamptz default null
)
returns table (
  id uuid,
  user_id uuid,
  user_name text,
  job_id uuid,
  job_number int,
  job_title text,
  clock_in timestamptz,
  clock_out timestamptz,
  description text,
  notes text,
  duration_minutes int
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden: nur fuer Administratoren';
  end if;
  return query
    select
      t.id,
      t.user_id,
      p.full_name as user_name,
      t.job_id,
      j.job_number,
      j.title as job_title,
      t.clock_in,
      t.clock_out,
      t.description,
      t.notes,
      case
        when t.clock_out is null then null
        else (extract(epoch from (t.clock_out - t.clock_in)) / 60)::int
      end as duration_minutes
    from public.time_entries t
    join public.profiles p on p.id = t.user_id
    left join public.jobs j on j.id = t.job_id
    where (filter_user_id is null or t.user_id = filter_user_id)
      and (filter_from is null or t.clock_in >= filter_from)
      and (filter_to is null or t.clock_in < filter_to)
    order by t.clock_in desc;
end;
$$;
grant execute on function public.get_all_time_entries(uuid, timestamptz, timestamptz) to authenticated;
