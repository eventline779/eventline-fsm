-- Aufträge können jetzt zwei Typen haben:
--  'location' = Auftrag findet in einer unserer Locations statt
--               (kein expliziter Customer — die Location IST der Bezug)
--  'extern'   = Auftrag bei externem Kunden (Firma oder Privat)
--               (Customer ist Pflicht, dazu freier Ort-Text)

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS job_type text NOT NULL DEFAULT 'extern'
    CHECK (job_type IN ('location', 'extern')),
  ADD COLUMN IF NOT EXISTS external_address text;

-- customer_id war NOT NULL — bei Location-Aufträgen brauchen wir keinen externen Customer.
ALTER TABLE public.jobs ALTER COLUMN customer_id DROP NOT NULL;

-- Bestehende Daten: Aufträge ohne customer_id, aber mit location_id, sind Location-Aufträge.
-- Alle anderen bleiben 'extern' (Default).
UPDATE public.jobs
  SET job_type = 'location'
  WHERE customer_id IS NULL AND location_id IS NOT NULL;
