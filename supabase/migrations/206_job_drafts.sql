-- 206_job_drafts.sql
-- ============================================================
-- Eigenstaendige Tabelle fuer Auftrags-Entwuerfe.
--
-- Motivation (Leo 2026-09-05):
--   Entwuerfe haben andere Beduerfnisse als fixe Auftraege — intensive
--   Kunden-Kontakte (viele Notizen, Anrufe, Mail-Historie), Datum oft
--   Jahre in der Zukunft, eine verantwortliche Person, Umwandlung in
--   einen echten Auftrag ist ein bewusster Schritt. Getrennte Tabelle
--   sorgt dafuer dass:
--     - `jobs`-Queries nie versehentlich Entwuerfe mitziehen
--     - Detail-UI zwei klar getrennte Layouts hat (Entwurf vs Auftrag)
--     - Notizen-Historie/Owner nur dort existieren wo sinnvoll
--
-- Zusaetzlich: der frueher separate Konzept-Weg „Vermietentwurf" wird
-- hierher konsolidiert — es gibt keinen Grund fuer zwei parallele
-- Entwurfs-Konzepte. Existierende jobs mit status='entwurf' werden
-- 1:1 migriert (der frueher unter jobs geflickte Entwurfs-Zustand
-- wird beendet).
-- ============================================================

-- 1) Sequenz fuer draft_number (ENT-1, ENT-2, ...)
create sequence if not exists public.job_drafts_number_seq start 1000;

-- 2) Haupt-Tabelle
create table if not exists public.job_drafts (
  id uuid primary key default gen_random_uuid(),
  draft_number int not null default nextval('public.job_drafts_number_seq') unique,

  -- Kern-Info
  title text not null,
  description text,

  -- Kunde: kann noch NULL sein (unbekannter Interessent, kein Kunden-Objekt)
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text, -- Freitext falls customer_id NULL
  contact_person text,
  contact_email text,
  contact_phone text,

  -- Location: Standort / Raum (beide optional)
  location_id uuid references public.locations(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,

  -- Erwartetes Datum (kann Jahre in Zukunft liegen)
  expected_start_date date,
  expected_end_date date,
  guest_count int,

  -- Owner: EINE verantwortliche Person (Leo 2026-09-05: „mach da, dass man nur eine person hinmachen kann")
  owner_id uuid references public.profiles(id) on delete set null,

  -- Entwurfs-Status
  status text not null default 'aktiv' check (status in ('aktiv', 'wartet_auf_kunde', 'storniert', 'umgewandelt')),

  -- Herkunft (fuer spaetere Statistik: Direkt/Partner/Vertrieb-Lead)
  source text default 'direkt' check (source in ('direkt', 'partner_anfrage', 'aus_vertrieb', 'aus_vermietentwurf')),
  source_lead_id uuid, -- optional Verweis auf vertrieb_leads (kein FK weil Tabelle evtl. nicht existiert)

  -- Wenn zu Auftrag umgewandelt: Verweis + Zeitpunkt
  converted_to_job_id uuid references public.jobs(id) on delete set null,
  converted_at timestamptz,

  -- Freitextsammlung fuer schnelle Notizen die keine chronologische
  -- Struktur brauchen (Rahmenbedingungen, Preisspanne, Sonderwuensche).
  -- Chronologische Notizen mit Autor liegen in job_draft_notes.
  general_notes text,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  is_deleted boolean not null default false,

  constraint job_drafts_dates_valid check (
    expected_end_date is null or expected_start_date is null or expected_end_date >= expected_start_date
  )
);

create index if not exists job_drafts_owner_idx on public.job_drafts(owner_id) where is_deleted = false;
create index if not exists job_drafts_status_idx on public.job_drafts(status) where is_deleted = false;
create index if not exists job_drafts_customer_idx on public.job_drafts(customer_id) where is_deleted = false;
create index if not exists job_drafts_expected_start_idx on public.job_drafts(expected_start_date) where is_deleted = false;

-- 3) Notizen-Tabelle (chronologisch, mit Autor)
create table if not exists public.job_draft_notes (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.job_drafts(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  kind text not null default 'notiz' check (kind in ('notiz', 'anruf', 'mail', 'meeting')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists job_draft_notes_draft_idx on public.job_draft_notes(draft_id, created_at desc);

-- 4) updated_at Trigger
create or replace function public.job_drafts_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists job_drafts_updated_at on public.job_drafts;
create trigger job_drafts_updated_at
  before update on public.job_drafts
  for each row execute function public.job_drafts_touch_updated_at();

-- 5) RLS
alter table public.job_drafts enable row level security;
alter table public.job_draft_notes enable row level security;

-- Alle authenticated Users mit „auftraege:view"/„auftraege:edit" — pragmatisch:
-- Entwuerfe folgen dem gleichen Berechtigungs-Modell wie Auftraege.
drop policy if exists job_drafts_select on public.job_drafts;
create policy job_drafts_select on public.job_drafts
  for select using (public.has_permission('auftraege:view'));

drop policy if exists job_drafts_insert on public.job_drafts;
create policy job_drafts_insert on public.job_drafts
  for insert with check (public.has_permission('auftraege:edit'));

drop policy if exists job_drafts_update on public.job_drafts;
create policy job_drafts_update on public.job_drafts
  for update using (public.has_permission('auftraege:edit'))
             with check (public.has_permission('auftraege:edit'));

drop policy if exists job_drafts_delete on public.job_drafts;
create policy job_drafts_delete on public.job_drafts
  for delete using (public.has_permission('auftraege:edit'));

drop policy if exists job_draft_notes_select on public.job_draft_notes;
create policy job_draft_notes_select on public.job_draft_notes
  for select using (public.has_permission('auftraege:view'));

drop policy if exists job_draft_notes_insert on public.job_draft_notes;
create policy job_draft_notes_insert on public.job_draft_notes
  for insert with check (public.has_permission('auftraege:edit'));

drop policy if exists job_draft_notes_update on public.job_draft_notes;
create policy job_draft_notes_update on public.job_draft_notes
  for update using (public.has_permission('auftraege:edit'))
             with check (public.has_permission('auftraege:edit'));

drop policy if exists job_draft_notes_delete on public.job_draft_notes;
create policy job_draft_notes_delete on public.job_draft_notes
  for delete using (public.has_permission('auftraege:edit'));

-- 6) Data-Migration: bestehende jobs mit status='entwurf' → job_drafts.
--    was_anfrage=true bleibt bei jobs (Partneranfrage bleibt Auftrag).
insert into public.job_drafts (
  title, description, customer_id, location_id, room_id,
  expected_start_date, expected_end_date, guest_count,
  general_notes, source,
  created_by, created_at
)
select
  coalesce(j.title, 'Entwurf ohne Titel'),
  j.description,
  j.customer_id,
  j.location_id,
  j.room_id,
  case when j.start_date is not null then j.start_date::date else null end,
  case when j.end_date is not null then j.end_date::date else null end,
  j.guest_count,
  j.description,
  case when j.was_anfrage = true then 'aus_vermietentwurf' else 'direkt' end,
  j.created_by,
  j.created_at
from public.jobs j
where j.status = 'entwurf'
  and j.is_deleted = false
  and not exists (select 1 from public.job_drafts); -- idempotent: nur bei leerer Tabelle

-- 7) Jobs bereinigen: alle mit status='entwurf' auf is_deleted setzen
--    (Soft-Delete). Die Records leben in job_drafts weiter — jobs zeigt
--    nur noch echte Auftraege + laufende Partneranfragen.
update public.jobs
   set is_deleted = true,
       updated_at = now()
 where status = 'entwurf'
   and is_deleted = false;

comment on table public.job_drafts is
  'Auftrags-Entwuerfe. Getrennt von jobs weil andere UI-Beduerfnisse: intensive Kundenkontakte, Notizen-Historie, eine verantwortliche Person, Umwandlung in echten Auftrag als bewusster Schritt.';
comment on table public.job_draft_notes is
  'Chronologische Notizen pro Draft mit Autor. Fuer Anrufe, Mails, Meetings, generelle Notizen.';
