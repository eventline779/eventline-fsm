-- Marker, ob ein Job urspruenglich als Mietanfrage entstanden ist.
-- Bleibt bei TRUE wenn die Anfrage in einen Auftrag konvertiert oder storniert wird,
-- damit die Mietanfragen-Uebersicht den Lifecycle-Outcome zeigen kann
-- (Offen / Auftrag erstellt / Storniert) — nicht nur die aktuell offenen Anfragen.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS was_anfrage boolean NOT NULL DEFAULT false;

-- Backfill:
--  1. Alle aktuell offenen Anfragen
UPDATE public.jobs SET was_anfrage = true WHERE status = 'anfrage';

--  2. Alle Jobs, die aus rental_requests migriert wurden (gleiche UUID).
--     Erfasst auch konvertierte ('offen') und abgelehnte ('storniert') Faelle.
UPDATE public.jobs j
   SET was_anfrage = true
  FROM public.rental_requests rr
 WHERE j.id = rr.id;

CREATE INDEX IF NOT EXISTS jobs_was_anfrage_idx ON public.jobs(was_anfrage) WHERE was_anfrage = true;

COMMENT ON COLUMN public.jobs.was_anfrage IS 'TRUE wenn der Job als Mietanfrage entstand. Bleibt TRUE auch nach Konvertierung/Stornierung.';
