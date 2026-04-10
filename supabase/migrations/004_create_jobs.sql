create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'offen' check (status in ('offen', 'geplant', 'in_arbeit', 'abgeschlossen', 'storniert')),
  priority text default 'normal' check (priority in ('niedrig', 'normal', 'hoch', 'dringend')),
  customer_id uuid not null references public.customers(id),
  location_id uuid references public.locations(id),
  start_date timestamptz,
  end_date timestamptz,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger jobs_updated_at
  before update on public.jobs
  for each row execute function public.update_updated_at();

-- Job Assignments (Techniker-Zuweisung)
create table public.job_assignments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  role_on_job text default 'techniker',
  notes text,
  created_at timestamptz default now(),
  unique(job_id, profile_id)
);

-- RLS Jobs
alter table public.jobs enable row level security;

create policy "Aufträge sind für authentifizierte Benutzer sichtbar"
  on public.jobs for select to authenticated using (true);

create policy "Admins können Aufträge erstellen"
  on public.jobs for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "Admins können Aufträge bearbeiten"
  on public.jobs for update to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- Techniker dürfen Status ihrer zugewiesenen Aufträge ändern
create policy "Techniker können zugewiesene Aufträge updaten"
  on public.jobs for update to authenticated
  using (
    exists (
      select 1 from public.job_assignments
      where job_id = jobs.id and profile_id = auth.uid()
    )
  );

-- RLS Job Assignments
alter table public.job_assignments enable row level security;

create policy "Zuweisungen sind sichtbar"
  on public.job_assignments for select to authenticated using (true);

create policy "Admins können Zuweisungen erstellen"
  on public.job_assignments for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "Admins können Zuweisungen löschen"
  on public.job_assignments for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');
