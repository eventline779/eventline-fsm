-- Partner-Portal: eigener Permission-Namespace `partner:*`.
--
-- HINTERGRUND
-- Bisher hatte die 'partner'-Rolle die dashed Slugs `partner-anfragen:*` und
-- `partner-belegungsplan:*` (Migration 099). Die Partner-RLS auf jobs /
-- job_appointments / documents gated indes NICHT ueber has_permission(),
-- sondern direkt ueber `profiles.role = 'partner' AND partner_location_id`
-- (Migrationen 096/102/104). D.h. die dashed Permissions waren reine UI-
-- Marker ohne echte Wirkung.
--
-- Ziel dieser Migration:
--   1. Sauberer `partner:<modul>:<action>`-Namespace, sodass Partner-Sub-
--      Rollen (Partner-Admin vs Partner-Mitarbeiter, siehe
--      MEMORY.project_partner_role_hierarchy) Subsets vergeben koennen ohne
--      dass die App zwei Slug-Familien pflegen muss.
--   2. RLS auf Partner-relevanten Tabellen zusaetzlich per has_permission()
--      gaten — Vorbereitung fuer die geplante Sub-Rollen-Trennung. Die
--      Location-Scope-Klausel (partner_location_id = jobs.location_id)
--      bleibt unveraendert und ist weiterhin die Autoritaet dafuer, WELCHE
--      Zeilen ein Partner sieht.
--   3. `is_partner()`-Helper etablieren (parallel zu is_admin(),
--      is_admin_or_lead()), damit die Policies nicht 5x inline
--      dasselbe SELECT auf profiles machen.
--
-- GRACE-PERIOD (reversibel)
-- Die Partner-Rolle behaelt in dieser Migration BEIDE Slug-Familien
-- (alt: partner-anfragen:*, partner-belegungsplan:*  neu: partner:*).
-- Die RLS-Policies pruefen per OR-Kette beide Familien —
--   has_permission('partner:auftraege:view')
--     OR has_permission('partner-belegungsplan:view')   -- grace
-- Wenn nach Verify (Partner-Flow durchklicken) alles laeuft, entfernt eine
-- Folgemigration:
--   - die alten dashed Slugs aus den Rollen
--   - die OR-Grace-Klauseln aus den RLS-Policies
--   - PARTNER_PERMISSION_MODULES-Eintraege fuer die alten Slugs
-- Rollback dieser Migration = alten Zustand wiederherstellen: neue Slugs
-- aus der Rolle nehmen (idempotent), Policies droppen und aus Migration
-- 104 neu anlegen. Da die neuen has_permission()-Checks ADDITIV per AND
-- an die bestehende role+location-Klausel gehaengt werden UND die
-- Partner-Rolle in derselben Transaktion die neuen Slugs bekommt, gibt
-- es kein Fenster in dem legitime Partner-User Zugriff verlieren.
--
-- IDEMPOTENT: Alle Statements sind rerun-safe. Slug-Insert dedup via
-- jsonb_agg(DISTINCT ...), Policies via DROP IF EXISTS + CREATE.

-- ============================================================
-- 1) is_partner()-Helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_partner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'partner'
      AND is_active = true
  );
$func$;

GRANT EXECUTE ON FUNCTION public.is_partner() TO authenticated;

-- ============================================================
-- 2) Partner-Rolle: neue Slugs additiv aufnehmen
--    (alte dashed Slugs bleiben fuer Grace-Period)
-- ============================================================
UPDATE public.roles
SET permissions = (
  SELECT jsonb_agg(DISTINCT perm)
  FROM jsonb_array_elements_text(
    COALESCE(permissions, '[]'::jsonb) || jsonb_build_array(
      -- Anfragen: Liste + CRUD auf eigene Entwuerfe + Antworten
      -- (respond = auf Rueckfragen / Ablehnungen der EVENTLINE-Admins
      --  im Anfrage-Thread reagieren, spaeter fuer Messaging).
      'partner:anfragen:view',
      'partner:anfragen:create',
      'partner:anfragen:edit',
      'partner:anfragen:delete',
      'partner:anfragen:respond',
      -- Belegungsplan (Kalender-Ansicht der eigenen Location)
      'partner:belegungsplan:view',
      -- Auftraege (bestaetigte Anfragen — read-only fuer Partner,
      -- Scoping auf partner_location_id passiert in RLS)
      'partner:auftraege:view'
    )
  ) AS perm
)
WHERE slug = 'partner';

-- ============================================================
-- 3) RLS-Policies: has_permission()-Gate zusaetzlich zur bestehenden
--    role+location-Klausel. Grace-OR mit alten dashed Slugs.
--
-- WICHTIG: Die Location-Scope-Klausel (partner_location_id) bleibt
-- IMMER erforderlich — has_permission() alleine darf niemals einem
-- Partner Zugang zu fremden Locations geben.
-- ============================================================

-- --- 3a) jobs SELECT: Partner-Zweig um Permission-Gate erweitern ---
-- Behalten alle bisherigen Zweige (admin/lead, project_lead_id,
-- job_appointments) unveraendert. job_assignments wurde in Migration 164
-- entfernt und ist hier bewusst nicht mehr referenziert.
DROP POLICY IF EXISTS "jobs_select" ON public.jobs;
CREATE POLICY "jobs_select" ON public.jobs
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_lead()
    OR project_lead_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.job_appointments WHERE job_id = jobs.id AND assigned_to = auth.uid())
    OR (
      public.is_partner()
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
          AND profiles.partner_location_id IS NOT NULL
          AND profiles.partner_location_id = jobs.location_id
      )
      AND (
        public.has_permission('partner:auftraege:view')
        OR public.has_permission('partner:belegungsplan:view')
        -- Grace: alte dashed Slugs aus Migration 099
        OR public.has_permission('partner-anfragen:view')
        OR public.has_permission('partner-belegungsplan:view')
      )
    )
  );

-- --- 3b) jobs INSERT (Partner legt Entwurf/Anfrage an) ---
DROP POLICY IF EXISTS "jobs_insert_partner" ON public.jobs;
CREATE POLICY "jobs_insert_partner" ON public.jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_lead()
    OR (
      status IN ('partner_anfrage', 'partner_entwurf')
      AND created_by = auth.uid()
      AND public.is_partner()
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND partner_location_id IS NOT NULL
          AND partner_location_id = jobs.location_id
      )
      AND (
        public.has_permission('partner:anfragen:create')
        -- Grace
        OR public.has_permission('partner-anfragen:create')
      )
    )
  );

-- --- 3c) jobs UPDATE (Partner editiert Entwurf/Anfrage) ---
DROP POLICY IF EXISTS "jobs_update_partner" ON public.jobs;
CREATE POLICY "jobs_update_partner" ON public.jobs
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_or_lead()
    OR (
      status IN ('partner_anfrage', 'partner_entwurf')
      AND public.is_partner()
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND partner_location_id IS NOT NULL
          AND partner_location_id = jobs.location_id
      )
      AND (
        public.has_permission('partner:anfragen:edit')
        OR public.has_permission('partner-anfragen:edit')
      )
    )
  )
  WITH CHECK (
    public.is_admin_or_lead()
    OR (
      status IN ('partner_anfrage', 'partner_entwurf')
      AND public.is_partner()
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND partner_location_id IS NOT NULL
          AND partner_location_id = jobs.location_id
      )
      AND (
        public.has_permission('partner:anfragen:edit')
        OR public.has_permission('partner-anfragen:edit')
      )
    )
  );

-- --- 3d) job_appointments INSERT (Termin fuer eigene Anfrage) ---
DROP POLICY IF EXISTS "appointments_insert_partner" ON public.job_appointments;
CREATE POLICY "appointments_insert_partner" ON public.job_appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_lead()
    OR (
      job_id IS NOT NULL
      AND public.is_partner()
      AND EXISTS (
        SELECT 1
        FROM public.jobs j
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE j.id = job_appointments.job_id
          AND j.status IN ('partner_anfrage', 'partner_entwurf')
          AND p.partner_location_id IS NOT NULL
          AND p.partner_location_id = j.location_id
      )
      AND (
        public.has_permission('partner:anfragen:edit')
        OR public.has_permission('partner-anfragen:edit')
      )
    )
  );

-- --- 3e) job_appointments DELETE (Termin loeschen — Trigger
--    protect_last_termin_trg macht zusaetzlich Last-Termin-Check) ---
DROP POLICY IF EXISTS "appointments_delete_partner" ON public.job_appointments;
CREATE POLICY "appointments_delete_partner" ON public.job_appointments
  FOR DELETE TO authenticated
  USING (
    public.is_admin_or_lead()
    OR (
      job_id IS NOT NULL
      AND public.is_partner()
      AND EXISTS (
        SELECT 1
        FROM public.jobs j
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE j.id = job_appointments.job_id
          AND j.status IN ('partner_anfrage', 'partner_entwurf')
          AND p.partner_location_id IS NOT NULL
          AND p.partner_location_id = j.location_id
      )
      AND (
        public.has_permission('partner:anfragen:edit')
        OR public.has_permission('partner-anfragen:edit')
      )
    )
  );

-- --- 3f) documents INSERT (Anhang zu Anfrage) ---
DROP POLICY IF EXISTS "documents_insert_partner" ON public.documents;
CREATE POLICY "documents_insert_partner" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_lead()
    OR (
      uploaded_by = auth.uid()
      AND public.is_partner()
      AND EXISTS (
        SELECT 1
        FROM public.jobs j
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE j.id = documents.job_id
          AND j.status IN ('partner_anfrage', 'partner_entwurf', 'offen')
          AND p.partner_location_id IS NOT NULL
          AND p.partner_location_id = j.location_id
      )
      AND (
        public.has_permission('partner:anfragen:edit')
        OR public.has_permission('partner-anfragen:edit')
      )
    )
  );

-- --- 3g) documents DELETE (eigenen Anhang loeschen, Pre-Accept) ---
DROP POLICY IF EXISTS "documents_delete_partner" ON public.documents;
CREATE POLICY "documents_delete_partner" ON public.documents
  FOR DELETE TO authenticated
  USING (
    public.is_admin_or_lead()
    OR (
      uploaded_by = auth.uid()
      AND public.is_partner()
      AND EXISTS (
        SELECT 1
        FROM public.jobs j
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE j.id = documents.job_id
          AND j.status IN ('partner_anfrage', 'partner_entwurf')
          AND p.partner_location_id IS NOT NULL
          AND p.partner_location_id = j.location_id
      )
      AND (
        public.has_permission('partner:anfragen:delete')
        OR public.has_permission('partner-anfragen:delete')
      )
    )
  );

-- ============================================================
-- 4) Notiz fuer Phase 2 (nach Verify): dann Migration NNN mit
--      UPDATE public.roles
--         SET permissions = (
--           SELECT jsonb_agg(perm)
--           FROM jsonb_array_elements_text(permissions) AS perm
--           WHERE perm NOT LIKE 'partner-%'
--         )
--         WHERE slug = 'partner';
--    plus Policies neu anlegen ohne die "OR partner-..."-Zweige.
--    In dieser Migration NICHT — sonst kein Grace-Rollback moeglich.
-- ============================================================
