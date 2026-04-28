-- Bewertungs-Feld auf partners entfernt — Eventline nutzt keine Sterne-Bewertung
-- fuer Partner. UI ist auch raus.
alter table public.partners drop column if exists rating;
