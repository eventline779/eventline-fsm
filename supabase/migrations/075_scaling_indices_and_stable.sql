-- Scaling-Migration aus dem Round-2-Audit (2026-05-04).
--
-- 1. has_permission() als STABLE markieren.
-- 2. Trigram-Indices fuer ilike-Suchen auf den hot-path Tabellen.
-- 3. Composite-Index fuer das stempel-reminder-RPC LATERAL-JOIN.
-- 4. View customer_country_counts fuer die World-Map (vermeidet
--    "alle Customers laden + clientseitig aggregieren").
-- 5. roles-Policy auf is_admin() umheben (Konsistenz).

-- =====================================================================
-- 1. has_permission() als STABLE
-- Pro Row-Eval refeuert die Function ohne dieses Attribut. Postgres
-- darf jetzt das Result innerhalb desselben Statements cachen.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.has_permission(perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.roles r ON r.slug = p.role
    WHERE p.id = auth.uid()
      AND (r.slug = 'admin' OR r.permissions ? perm)
  );
$$;

-- =====================================================================
-- 2. Trigram-Extension + Indices fuer ilike-Suche
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS customers_name_trgm_idx
  ON public.customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_email_trgm_idx
  ON public.customers USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_bexio_nr_trgm_idx
  ON public.customers USING gin (bexio_nr gin_trgm_ops);

CREATE INDEX IF NOT EXISTS tickets_title_trgm_idx
  ON public.tickets USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS tickets_description_trgm_idx
  ON public.tickets USING gin (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS todos_title_trgm_idx
  ON public.todos USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS todos_description_trgm_idx
  ON public.todos USING gin (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS jobs_title_trgm_idx
  ON public.jobs USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS partners_name_trgm_idx
  ON public.partners USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS vertrieb_contacts_firma_trgm_idx
  ON public.vertrieb_contacts USING gin (firma gin_trgm_ops);

-- =====================================================================
-- 3. Composite-Index fuer Stempel-Reminder-RPC
-- get_stempel_reminder_candidates() macht LATERAL JOIN auf
--   WHERE job_id = ... AND end_time IS NOT NULL ORDER BY end_time DESC.
-- Composite-Index beschleunigt das massiv.
-- =====================================================================
CREATE INDEX IF NOT EXISTS job_appointments_job_end_idx
  ON public.job_appointments (job_id, end_time DESC)
  WHERE end_time IS NOT NULL;

-- =====================================================================
-- 4. customer_country_counts View
-- World-Map-Komponente lud sonst ALLE customers nur fuer address_country-
-- Counts. Bei 5-10k Kunden = MB-Bereich pro /kunden-Mount.
-- =====================================================================
CREATE OR REPLACE VIEW public.customer_country_counts
WITH (security_invoker = on) AS
SELECT
  COALESCE(NULLIF(address_country, ''), 'CH')::text AS country,
  COUNT(*)::int                                     AS count
FROM public.customers
WHERE archived_at IS NULL
  AND is_active = true
GROUP BY country;

GRANT SELECT ON public.customer_country_counts TO authenticated;

-- =====================================================================
-- 5. roles-Policies auf is_admin()-Helper umheben (Konsistenz)
-- Vorher inline `(SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'`.
-- =====================================================================
DROP POLICY IF EXISTS "Admins koennen Rollen sehen" ON public.roles;
DROP POLICY IF EXISTS "Admins koennen Rollen erstellen" ON public.roles;
DROP POLICY IF EXISTS "Admins koennen Rollen bearbeiten" ON public.roles;
DROP POLICY IF EXISTS "Admins koennen Rollen loeschen" ON public.roles;

CREATE POLICY "Rollen sehen" ON public.roles
  FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY "Rollen anlegen" ON public.roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
CREATE POLICY "Rollen bearbeiten" ON public.roles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
CREATE POLICY "Rollen loeschen" ON public.roles
  FOR DELETE TO authenticated
  USING (public.is_admin());
