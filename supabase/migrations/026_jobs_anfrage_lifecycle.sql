-- Vermietungsanfragen werden Teil des Auftrags-Lifecycles.
-- Eine Anfrage ist ein Job mit status='anfrage' und request_step 1..5.
-- Wenn die Anfrage konvertiert wird, wechselt sie auf status='offen' (oder 'entwurf'),
-- request_step wird NULL, und der Job laeuft normal weiter.

-- 1. Status-Check erweitern
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('anfrage', 'entwurf', 'offen', 'abgeschlossen', 'storniert'));

-- 2. Neue Spalten fuer Anfrage-Phase
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS request_step smallint
    CHECK (request_step IS NULL OR (request_step BETWEEN 1 AND 5)),
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS guest_count integer,
  ADD COLUMN IF NOT EXISTS extended_services text;

-- Konsistenz: request_step nur befuellt wenn status='anfrage'
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_request_step_only_in_anfrage
  CHECK (
    (status = 'anfrage' AND request_step IS NOT NULL) OR
    (status <> 'anfrage' AND request_step IS NULL)
  );

CREATE INDEX IF NOT EXISTS jobs_anfrage_step_idx ON public.jobs(request_step) WHERE status = 'anfrage';

COMMENT ON COLUMN public.jobs.request_step IS 'Pipeline-Position 1..5 waehrend Status anfrage. NULL sobald in Auftrag konvertiert.';
COMMENT ON COLUMN public.jobs.event_type IS 'z.B. Konzert, Theater, Hochzeit — Anfrage-Phase Info';
COMMENT ON COLUMN public.jobs.guest_count IS 'Erwartete Personenzahl';
COMMENT ON COLUMN public.jobs.extended_services IS 'Freitext fuer erweiterte Dienstleistungen / Anmerkungen aus der Anfrage';
