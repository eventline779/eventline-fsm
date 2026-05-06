-- Priority auf nur 'normal' / 'dringend' reduziert — 'niedrig' und 'hoch'
-- werden nie verwendet, der einzige relevante Hinweis ist "ist das jetzt
-- dringend oder nicht".

UPDATE public.jobs SET priority = 'normal' WHERE priority IN ('niedrig', 'hoch');

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_priority_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_priority_check
  CHECK (priority IN ('normal', 'dringend'));
