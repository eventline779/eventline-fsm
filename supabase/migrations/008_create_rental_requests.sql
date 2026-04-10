-- Vermietungsanfragen
create table public.rental_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  location_id uuid references public.locations(id),
  status text not null default 'neu' check (status in ('neu', 'in_bearbeitung', 'bestaetigt', 'abgelehnt')),
  event_date timestamptz,
  event_type text,
  guest_count integer,
  details text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger rental_requests_updated_at
  before update on public.rental_requests
  for each row execute function public.update_updated_at();

-- E-Mail Vorlagen
create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body_html text not null,
  type text not null check (type in ('bestätigung', 'absage', 'info')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger email_templates_updated_at
  before update on public.email_templates
  for each row execute function public.update_updated_at();

-- E-Mail Log
create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  rental_request_id uuid references public.rental_requests(id),
  recipient text not null,
  subject text not null,
  body text not null,
  sent_at timestamptz default now()
);

-- RLS Rental Requests
alter table public.rental_requests enable row level security;

create policy "Anfragen sind sichtbar"
  on public.rental_requests for select to authenticated using (true);

create policy "Admins können Anfragen erstellen"
  on public.rental_requests for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "Admins können Anfragen bearbeiten"
  on public.rental_requests for update to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- RLS Email Templates
alter table public.email_templates enable row level security;

create policy "Vorlagen sind für Admins sichtbar"
  on public.email_templates for select to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "Admins können Vorlagen erstellen"
  on public.email_templates for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "Admins können Vorlagen bearbeiten"
  on public.email_templates for update to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- RLS Email Log
alter table public.email_log enable row level security;

create policy "E-Mail Log ist für Admins sichtbar"
  on public.email_log for select to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "System kann E-Mails loggen"
  on public.email_log for insert to authenticated with check (true);
