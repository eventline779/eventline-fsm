-- Status 'entwurf' nachtragen — der UI-Code (constants.ts JOB_STATUS) kennt
-- diesen Wert seit längerem, aber der CHECK-Constraint nicht.
-- "Als Entwurf speichern" warf jobs_status_check-Verletzung.

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN (
    'entwurf', 'offen', 'geplant', 'in_arbeit', 'abgeschlossen', 'storniert'
  ));
