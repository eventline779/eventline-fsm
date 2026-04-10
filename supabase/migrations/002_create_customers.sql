create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'company' check (type in ('company', 'individual', 'organization')),
  email text,
  phone text,
  address_street text,
  address_zip text,
  address_city text,
  address_country text default 'CH',
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger customers_updated_at
  before update on public.customers
  for each row execute function public.update_updated_at();

alter table public.customers enable row level security;

create policy "Kunden sind für authentifizierte Benutzer sichtbar"
  on public.customers for select to authenticated using (true);

create policy "Admins können Kunden erstellen"
  on public.customers for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "Admins können Kunden bearbeiten"
  on public.customers for update to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');
