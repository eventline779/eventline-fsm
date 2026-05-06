-- Status 'geplant' entfernen — redundant mit der Termin-Anzeige (orange Streifen
-- links auf der Auftragskarte zeigt schon ob ein Termin da ist oder nicht).
-- Bestehende 'geplant'-Aufträge werden zu 'offen'.

UPDATE public.jobs SET status = 'offen' WHERE status = 'geplant';

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN (
    'entwurf', 'offen', 'in_arbeit', 'abgeschlossen', 'storniert'
  ));
