-- Partners / Lieferanten directory
-- Catering, Technik, AV, etc. — vendors Eventline coordinates with for events.
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('catering', 'technik', 'av', 'mobiliar', 'reinigung', 'security', 'sonstiges')),
  contact_person text,
  email text,
  phone text,
  website text,
  address_street text,
  address_zip text,
  address_city text,
  notes text,
  rating smallint check (rating between 1 and 5),
  is_active boolean default true,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index partners_type_idx on public.partners(type) where is_active = true;
create index partners_name_idx on public.partners(lower(name));

create trigger partners_updated_at
  before update on public.partners
  for each row execute function public.update_updated_at();

alter table public.partners enable row level security;

create policy "Authenticated users can view partners"
  on public.partners for select
  to authenticated
  using (true);

create policy "Authenticated users can insert partners"
  on public.partners for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update partners"
  on public.partners for update
  to authenticated
  using (true);

create policy "Authenticated users can delete partners"
  on public.partners for delete
  to authenticated
  using (true);
