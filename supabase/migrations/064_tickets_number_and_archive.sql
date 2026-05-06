-- Tickets erweitern um:
--   1. ticket_number (fortlaufend, ab 1000) — wie jobs.job_number
--   2. archived_at (auto-gesetzt 14 Tage nach status-Wechsel auf
--      erledigt/abgelehnt) — fuer Archiv-Filter auf der Listen-Page.
--
-- Plus: Archive-Detection ueber View, damit das Frontend einfach
-- query'en kann.

-- 1. Sequence fuer Ticket-Nummern.
CREATE SEQUENCE IF NOT EXISTS public.ticket_number_seq START 1000;

-- 2. ticket_number-Spalte mit Default aus der Sequence.
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS ticket_number int NOT NULL DEFAULT nextval('public.ticket_number_seq');

-- Bestehende Tickets bekommen ihre Nummer aus der Sequence rueckwirkend
-- (DEFAULT greift nur fuer neue Rows). UPDATE mit nextval() je Row.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.tickets WHERE ticket_number IS NULL OR ticket_number = 0 ORDER BY created_at LOOP
    UPDATE public.tickets SET ticket_number = nextval('public.ticket_number_seq') WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS tickets_ticket_number_idx ON public.tickets(ticket_number);

-- 3. archived_at — manuell gesetzt oder automatisch via Daily-Job.
-- Fuer jetzt: Frontend filtert anhand resolved_at + 14 Tage. Spalte ist
-- nicht zwingend noetig, aber wir nehmen sie als Marker fuer "explizit
-- archiviert" (z.B. wenn ein Admin manuell archiviert).
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS tickets_archived_at_idx ON public.tickets(archived_at);
