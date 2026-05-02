-- Geocoded Adressen fuer locations und rooms damit die Karte echte Punkte
-- statt Stadt-Center-Cluster anzeigt. Wird per API beim Insert gefuellt
-- (Nominatim) und durch /api/geocode/backfill nachgezogen.
alter table public.locations
  add column if not exists latitude numeric,
  add column if not exists longitude numeric;

alter table public.rooms
  add column if not exists latitude numeric,
  add column if not exists longitude numeric;
