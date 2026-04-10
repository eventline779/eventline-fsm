create table public.service_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  created_by uuid not null references public.profiles(id),
  report_date date not null default current_date,
  work_description text not null,
  equipment_used text,
  issues text,
  client_name text,
  signature_url text,
  status text default 'entwurf' check (status in ('entwurf', 'abgeschlossen')),
  pdf_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger service_reports_updated_at
  before update on public.service_reports
  for each row execute function public.update_updated_at();

-- Report Photos
create table public.report_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.service_reports(id) on delete cascade,
  storage_path text not null,
  caption text,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- RLS Service Reports
alter table public.service_reports enable row level security;

create policy "Rapporte sind sichtbar"
  on public.service_reports for select to authenticated using (true);

create policy "Benutzer können Rapporte erstellen"
  on public.service_reports for insert to authenticated
  with check (created_by = auth.uid());

create policy "Ersteller können Rapporte bearbeiten"
  on public.service_reports for update to authenticated
  using (created_by = auth.uid());

create policy "Admins können alle Rapporte bearbeiten"
  on public.service_reports for update to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- RLS Report Photos
alter table public.report_photos enable row level security;

create policy "Fotos sind sichtbar"
  on public.report_photos for select to authenticated using (true);

create policy "Benutzer können Fotos hochladen"
  on public.report_photos for insert to authenticated with check (true);

create policy "Admins können Fotos löschen"
  on public.report_photos for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');
