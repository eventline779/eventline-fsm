-- Räume (externe Veranstaltungsräume)
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address_street text,
  address_zip text,
  address_city text,
  capacity integer,
  technical_details text,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger rooms_updated_at
  before update on public.rooms
  for each row execute function public.update_updated_at();

-- Kontaktpersonen für Räume
create table public.room_contacts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  notes text,
  created_at timestamptz default now()
);

-- Preise für Räume
create table public.room_prices (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  label text not null,
  amount numeric not null,
  currency text default 'CHF',
  notes text,
  created_at timestamptz default now()
);

-- RLS
alter table public.rooms enable row level security;
create policy "Räume sichtbar" on public.rooms for select to authenticated using (true);
create policy "Admins können Räume erstellen" on public.rooms for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');
create policy "Admins können Räume bearbeiten" on public.rooms for update to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');
create policy "Admins können Räume löschen" on public.rooms for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

alter table public.room_contacts enable row level security;
create policy "Raum-Kontakte sichtbar" on public.room_contacts for select to authenticated using (true);
create policy "Admins können Raum-Kontakte erstellen" on public.room_contacts for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');
create policy "Admins können Raum-Kontakte löschen" on public.room_contacts for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

alter table public.room_prices enable row level security;
create policy "Raum-Preise sichtbar" on public.room_prices for select to authenticated using (true);
create policy "Admins können Raum-Preise erstellen" on public.room_prices for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');
create policy "Admins können Raum-Preise löschen" on public.room_prices for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');
