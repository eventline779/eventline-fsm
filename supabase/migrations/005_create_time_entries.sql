create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  job_id uuid references public.jobs(id),
  clock_in timestamptz not null,
  clock_out timestamptz,
  break_minutes integer default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger time_entries_updated_at
  before update on public.time_entries
  for each row execute function public.update_updated_at();

alter table public.time_entries enable row level security;

-- Jeder sieht eigene Einträge
create policy "Benutzer sehen eigene Zeiteinträge"
  on public.time_entries for select to authenticated
  using (profile_id = auth.uid());

-- Admins sehen alle
create policy "Admins sehen alle Zeiteinträge"
  on public.time_entries for select to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- Jeder kann eigene erstellen
create policy "Benutzer können eigene Zeiteinträge erstellen"
  on public.time_entries for insert to authenticated
  with check (profile_id = auth.uid());

-- Jeder kann eigene updaten
create policy "Benutzer können eigene Zeiteinträge bearbeiten"
  on public.time_entries for update to authenticated
  using (profile_id = auth.uid());
