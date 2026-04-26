-- Status 'in_arbeit' entfernen — der "Starten"-Übergang macht im Eventline-
-- Workflow keinen Sinn (Aufträge sind entweder bevorstehend, abgeschlossen
-- oder storniert; "in arbeit" wäre der Event-Tag selbst und nicht manuell
-- setzbar).

UPDATE public.jobs SET status = 'offen' WHERE status = 'in_arbeit';

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN (
    'entwurf', 'offen', 'abgeschlossen', 'storniert'
  ));
