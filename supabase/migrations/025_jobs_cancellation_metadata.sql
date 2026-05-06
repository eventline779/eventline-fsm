-- Speichert beim Stornieren wer / wann / warum, damit das Archiv den
-- Storno-Kontext auch nach Tagen noch zeigen kann.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

CREATE INDEX IF NOT EXISTS jobs_cancelled_by_idx ON public.jobs(cancelled_by) WHERE cancelled_by IS NOT NULL;
