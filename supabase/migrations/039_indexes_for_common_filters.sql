-- Composite/partial Indexes auf haeufig gefilterte Spalten.
-- Skaliert bei wachsenden Datenmengen (jobs, customers).
-- Alle if-not-exists damit re-runnable.

-- jobs: Liste filtert mit status, sortiert nach created_at, ignoriert is_deleted.
-- Partial-Index spart Storage und Tree-Tiefe (gelöschte Jobs nicht im Index).
create index if not exists jobs_status_active_idx
  on public.jobs(status, created_at desc)
  where is_deleted is not true;

-- jobs: Customer-Detail-Page laedt deren Auftraege gefiltert nach customer_id.
create index if not exists jobs_customer_id_idx
  on public.jobs(customer_id)
  where customer_id is not null and is_deleted is not true;

-- jobs: Location-Detail-Page laedt deren Auftraege gefiltert nach location_id.
create index if not exists jobs_location_id_idx
  on public.jobs(location_id)
  where location_id is not null and is_deleted is not true;

-- jobs: Heute/Kalender filtert auf start_date-Range.
create index if not exists jobs_start_date_idx
  on public.jobs(start_date)
  where is_deleted is not true;

-- customers: Active-Filter ist Default in fast allen Listen.
create index if not exists customers_is_active_idx
  on public.customers(is_active)
  where is_active = true;

-- customers: Suche per ilike-on-lower(name) → Functional Index beschleunigt das.
create index if not exists customers_name_lower_idx
  on public.customers(lower(name));

-- locations + rooms: Active-Filter.
create index if not exists locations_is_active_idx
  on public.locations(is_active)
  where is_active = true;

create index if not exists rooms_is_active_idx
  on public.rooms(is_active)
  where is_active = true;

-- profiles: Team-Listen filtern is_active.
create index if not exists profiles_is_active_idx
  on public.profiles(is_active)
  where is_active = true;
