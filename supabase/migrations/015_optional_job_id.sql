-- Allow appointments without a job (e.g. Büro, Home Office)
ALTER TABLE public.job_appointments ALTER COLUMN job_id DROP NOT NULL;
