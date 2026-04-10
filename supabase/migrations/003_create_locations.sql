create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address_street text,
  address_zip text,
  address_city text default 'Basel',
  capacity integer,
  customer_id uuid references public.customers(id),
  notes text,
  technical_details text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger locations_updated_at
  before update on public.locations
  for each row execute function public.update_updated_at();

alter table public.locations enable row level security;

create policy "Standorte sind für authentifizierte Benutzer sichtbar"
  on public.locations for select to authenticated using (true);

create policy "Admins können Standorte erstellen"
  on public.locations for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "Admins können Standorte bearbeiten"
  on public.locations for update to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');
