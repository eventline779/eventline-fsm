-- Markiert Stornierungen, die in der Anfrage-Phase passiert sind.
-- Solche Jobs sollen nicht im Auftrags-Archiv erscheinen — zu dem Zeitpunkt
-- waren sie ja noch keine Auftraege.
--
-- Storniert ein konvertierter Auftrag (was_anfrage=true, aber die Anfrage
-- wurde vorher in entwurf/offen umgewandelt und erst dann storniert), dann
-- bleibt cancelled_as_anfrage = false und der Job erscheint normal im
-- Auftrags-Archiv.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS cancelled_as_anfrage boolean NOT NULL DEFAULT false;

-- Backfill: alle bisherigen storniert + was_anfrage Jobs gelten als
-- "in der Anfrage-Phase storniert" — vor dieser Migration gab es keinen
-- Mechanismus, einen aus einer Anfrage konvertierten Auftrag zu stornieren
-- ohne was_anfrage zu verlieren. Trifft insbesondere die aus rental_requests
-- migrierten 'abgelehnt'-Faelle.
UPDATE public.jobs
   SET cancelled_as_anfrage = true
 WHERE status = 'storniert' AND was_anfrage = true;

CREATE INDEX IF NOT EXISTS jobs_cancelled_as_anfrage_idx ON public.jobs(cancelled_as_anfrage)
  WHERE cancelled_as_anfrage = true;

COMMENT ON COLUMN public.jobs.cancelled_as_anfrage IS 'TRUE wenn der Job waehrend der Anfrage-Phase storniert wurde — gehoert dann nicht ins Auftrags-Archiv.';
