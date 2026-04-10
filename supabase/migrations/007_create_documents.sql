create table public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_path text not null,
  file_size bigint,
  mime_type text,
  job_id uuid references public.jobs(id),
  location_id uuid references public.locations(id),
  customer_id uuid references public.customers(id),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz default now()
);

alter table public.documents enable row level security;

create policy "Dokumente sind sichtbar"
  on public.documents for select to authenticated using (true);

create policy "Benutzer können Dokumente hochladen"
  on public.documents for insert to authenticated
  with check (uploaded_by = auth.uid());

create policy "Admins können Dokumente löschen"
  on public.documents for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');
