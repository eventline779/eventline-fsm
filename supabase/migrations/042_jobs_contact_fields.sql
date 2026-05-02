-- Veranstalter-Kontakt: Ansprechperson + Tel + Mail pro Auftrag.
-- Bisher gab's nur den Customer (juristisch/Rechnungs-Adressat). Auf
-- Veranstaltungen muss man oft jemand anderes erreichen — Tontechniker,
-- Hausmeister, Eventleitung. Pro-Auftrag-Felder weil's pro Job variieren
-- kann (selbe Customer kann fuer 2 verschiedene Events 2 verschiedene
-- Kontakte haben).
--
-- Person + Telefon werden in der UI als Pflicht erzwungen, in der DB
-- bleiben sie nullable damit Alt-Daten nicht brechen und der Optionalitaet
-- bei API-Imports etc. nicht im Weg steht.

-- IF NOT EXISTS damit der File auf bereits-gepushten DBs idempotent ist
-- (DEV + PROD wurden direkt via Management-API gepushed, der Migrations-
-- Tracker via `supabase db push` weiss nichts davon — bei Re-Run waere
-- das ein Konflikt ohne IF NOT EXISTS).
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS contact_phone  text,
  ADD COLUMN IF NOT EXISTS contact_email  text;
