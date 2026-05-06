-- profiles.calendar_feed_token — pro User ein eindeutiger Token fuer
-- den persoenlichen iCal-Feed.
--
-- Vorher war /api/calendar.ics ein OEFFENTLICHER Endpoint der nur ueber
-- den globalen CALENDAR_FEED_TOKEN aus der env geschuetzt war — wer
-- die URL hatte, sah ALLE Aufträge + Termine der ganzen Firma.
-- Jetzt: jeder User hat seinen eigenen Token in der URL, der Endpoint
-- mappt Token → User und filtert die Daten auf "was er sehen darf"
-- (eigene Job-Assignments, eigene Termine).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS calendar_feed_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_calendar_feed_token_idx ON public.profiles(calendar_feed_token);

-- Bestehende Profile bekommen ihren Default automatisch — ALTER TABLE ADD
-- COLUMN ... DEFAULT setzt fuer alle existierenden Rows die Default-Funktion
-- (gen_random_uuid()) auf, also kriegt jeder User seinen eigenen Token
-- direkt nach der Migration.
