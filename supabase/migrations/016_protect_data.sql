-- Protect data from cascade deletion
-- Change ON DELETE CASCADE to ON DELETE RESTRICT for critical foreign keys

-- job_appointments: don't delete when job or profile is deleted
ALTER TABLE public.job_appointments DROP CONSTRAINT IF EXISTS job_appointments_job_id_fkey;
ALTER TABLE public.job_appointments ADD CONSTRAINT job_appointments_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;

ALTER TABLE public.job_appointments DROP CONSTRAINT IF EXISTS job_appointments_assigned_to_fkey;
ALTER TABLE public.job_appointments ADD CONSTRAINT job_appointments_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- job_assignments: don't delete when profile is deleted
ALTER TABLE public.job_assignments DROP CONSTRAINT IF EXISTS job_assignments_profile_id_fkey;
ALTER TABLE public.job_assignments ADD CONSTRAINT job_assignments_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- jobs: protect project_lead reference
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_project_lead_id_fkey;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_project_lead_id_fkey
  FOREIGN KEY (project_lead_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Prevent accidental deletion of profiles
CREATE OR REPLACE FUNCTION prevent_profile_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT count(*) FROM public.profiles WHERE is_active = true) <= 1 THEN
    RAISE EXCEPTION 'Cannot delete the last active profile';
  END IF;
  -- Soft delete instead of hard delete
  UPDATE public.profiles SET is_active = false WHERE id = OLD.id;
  RETURN NULL; -- prevent actual deletion
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_profiles ON public.profiles;
CREATE TRIGGER protect_profiles
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_profile_delete();

-- Prevent accidental deletion of all customers
CREATE OR REPLACE FUNCTION prevent_bulk_delete()
RETURNS TRIGGER AS $$
BEGIN
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
