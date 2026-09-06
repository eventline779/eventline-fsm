-- 218_job_drafts_location_name.sql
-- ============================================================
-- Freitext-Fallback fuer Location auf job_drafts (Leo 2026-09-06):
--   Analog zu customer_name (Migration 206): der Nutzer kann beim
--   Anlegen/Editieren eines Entwurfs einen Location-Namen eintippen,
--   ohne dass daraus ein `locations`-Datensatz wird.
--
--   Verhalten bei Umwandlung in Auftrag (convert-Route):
--     - customer_name (ohne customer_id)  -> neuer Kunde in customers
--     - location_name (ohne location_id)  -> jobs.external_address
--       (KEINE Location wird angelegt — bewusst.)
--
-- Idempotent via IF NOT EXISTS.
-- ============================================================

alter table public.job_drafts
  add column if not exists location_name text;

comment on column public.job_drafts.location_name is
  'Freitext-Fallback wenn location_id NULL. Bei Umwandlung landet der Wert in jobs.external_address; es wird NIE eine locations-Row angelegt.';
