-- =============================================
-- 1. Jobs: Projektleiter-Feld hinzufügen
-- =============================================
alter table public.jobs add column if not exists project_lead_id uuid references public.profiles(id);

-- =============================================
-- 2. Job-Termine (Termine pro Auftrag, zuweisbar)
-- =============================================
create table if not exists public.job_appointments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  title text not null,
  description text,
  start_time timestamptz not null,
  end_time timestamptz,
  assigned_to uuid references public.profiles(id),
  is_done boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger job_appointments_updated_at
  before update on public.job_appointments
  for each row execute function public.update_updated_at();

alter table public.job_appointments enable row level security;

create policy "Job-Termine sind sichtbar"
  on public.job_appointments for select to authenticated using (true);
create policy "Admins können Termine erstellen"
  on public.job_appointments for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');
create policy "Admins können Termine bearbeiten"
  on public.job_appointments for update to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');
create policy "Admins können Termine löschen"
  on public.job_appointments for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- =============================================
-- 3. Vermietungsanfragen: Enddatum
-- =============================================
alter table public.rental_requests add column if not exists event_end_date timestamptz;

-- =============================================
-- 4. Standort-Kontaktpersonen
-- =============================================
create table if not exists public.location_contacts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  notes text,
  created_at timestamptz default now()
);

alter table public.location_contacts enable row level security;

create policy "Kontakte sind sichtbar"
  on public.location_contacts for select to authenticated using (true);
create policy "Admins können Kontakte erstellen"
  on public.location_contacts for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');
create policy "Admins können Kontakte bearbeiten"
  on public.location_contacts for update to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');
create policy "Admins können Kontakte löschen"
  on public.location_contacts for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- =============================================
-- 5. Standort-Instandhaltungsarbeiten
-- =============================================
create table if not exists public.maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'offen' check (status in ('offen', 'erledigt')),
  due_date date,
  completed_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger maintenance_tasks_updated_at
  before update on public.maintenance_tasks
  for each row execute function public.update_updated_at();

alter table public.maintenance_tasks enable row level security;

create policy "Instandhaltung ist sichtbar"
  on public.maintenance_tasks for select to authenticated using (true);
create policy "Admins können Instandhaltung erstellen"
  on public.maintenance_tasks for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');
create policy "Admins können Instandhaltung bearbeiten"
  on public.maintenance_tasks for update to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');
create policy "Admins können Instandhaltung löschen"
  on public.maintenance_tasks for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- =============================================
-- 6. Todos (globale Aufgabenliste)
-- =============================================
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'offen' check (status in ('offen', 'erledigt')),
  priority text default 'normal' check (priority in ('niedrig', 'normal', 'hoch', 'dringend')),
  due_date date,
  assigned_to uuid references public.profiles(id),
  job_id uuid references public.jobs(id),
  created_by uuid references public.profiles(id),
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger todos_updated_at
  before update on public.todos
  for each row execute function public.update_updated_at();

alter table public.todos enable row level security;

create policy "Todos sind sichtbar"
  on public.todos for select to authenticated using (true);
create policy "Benutzer können Todos erstellen"
  on public.todos for insert to authenticated with check (true);
create policy "Benutzer können Todos bearbeiten"
  on public.todos for update to authenticated using (true);
create policy "Admins können Todos löschen"
  on public.todos for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');
