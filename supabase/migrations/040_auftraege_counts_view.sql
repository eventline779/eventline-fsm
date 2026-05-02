-- View ersetzt 6 parallele HEAD-Queries auf /auftraege durch eine. Nutzt
-- count(*) filter (...) — Postgres macht das in einem einzigen Sequential-
-- oder Index-Scan, deutlich gnädiger zur DB als 6 Round-Trips.
--
-- security_invoker=on damit RLS auf jobs greift wenn ein User die View liest.
-- Sonst wuerde sie unter Owner-Permissions laufen und RLS umgehen.

create or replace view public.auftraege_counts
with (security_invoker = on) as
select
  count(*) filter (
    where status = 'anfrage'
      and (cancelled_as_anfrage is null or cancelled_as_anfrage = false)
  )::int as anfrage,
  count(*) filter (where status = 'offen')::int as offen,
  count(*) filter (where status = 'offen' and was_anfrage = true)::int as offen_vermietung,
  count(*) filter (where status = 'abgeschlossen')::int as abgeschlossen,
  count(*) filter (
    where status = 'storniert'
      and (cancelled_as_anfrage is null or cancelled_as_anfrage = false)
  )::int as storniert,
  count(*) filter (where status = 'entwurf')::int as entwurf
from public.jobs
where is_deleted is not true;

grant select on public.auftraege_counts to authenticated;
