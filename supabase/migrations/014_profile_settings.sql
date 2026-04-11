ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}';
