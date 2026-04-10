create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  all_day boolean default false,
  job_id uuid references public.jobs(id),
  location_id uuid references public.locations(id),
  profile_id uuid references public.profiles(id),
  color text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger calendar_events_updated_at
  before update on public.calendar_events
  for each row execute function public.update_updated_at();

alter table public.calendar_events enable row level security;

create policy "Kalendereinträge sind sichtbar"
  on public.calendar_events for select to authenticated using (true);

create policy "Admins können Kalendereinträge erstellen"
  on public.calendar_events for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "Admins können Kalendereinträge bearbeiten"
  on public.calendar_events for update to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "Admins können Kalendereinträge löschen"
  on public.calendar_events for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');
