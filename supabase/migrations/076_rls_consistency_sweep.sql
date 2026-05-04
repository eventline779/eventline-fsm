-- Konsistenz-Sweep: 4 Tabellen die noch im alten Pattern (using(true) +
-- admin-Hardcheck) waren auf das has_permission()-Modell umheben.
-- Aus Round-2-Audit:
--   - maintenance_tasks
--   - location_contacts (SELECT)
--   - room_contacts (SELECT)
--   - room_prices (SELECT)

-- =====================================================================
-- maintenance_tasks
-- =====================================================================
DROP POLICY IF EXISTS "Wartungsaufgaben sichtbar" ON public.maintenance_tasks;
DROP POLICY IF EXISTS "Admins können Wartungsaufgaben anlegen" ON public.maintenance_tasks;
DROP POLICY IF EXISTS "Admins können Wartungsaufgaben bearbeiten" ON public.maintenance_tasks;
DROP POLICY IF EXISTS "Admins können Wartungsaufgaben löschen" ON public.maintenance_tasks;

CREATE POLICY "Wartung sehen"
  ON public.maintenance_tasks FOR SELECT TO authenticated
  USING (public.has_permission('locations:view'));
CREATE POLICY "Wartung anlegen"
  ON public.maintenance_tasks FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('locations:edit'));
CREATE POLICY "Wartung bearbeiten"
  ON public.maintenance_tasks FOR UPDATE TO authenticated
  USING (public.has_permission('locations:edit'))
  WITH CHECK (public.has_permission('locations:edit'));
CREATE POLICY "Wartung loeschen"
  ON public.maintenance_tasks FOR DELETE TO authenticated
  USING (public.has_permission('locations:delete'));

-- =====================================================================
-- location_contacts SELECT
-- =====================================================================
DROP POLICY IF EXISTS "Kontakte sind sichtbar" ON public.location_contacts;

CREATE POLICY "Standort-Kontakte sehen"
  ON public.location_contacts FOR SELECT TO authenticated
  USING (public.has_permission('locations:view'));

-- =====================================================================
-- room_contacts SELECT
-- =====================================================================
DROP POLICY IF EXISTS "Raum-Kontakte sichtbar" ON public.room_contacts;

CREATE POLICY "Raum-Kontakte sehen"
  ON public.room_contacts FOR SELECT TO authenticated
  USING (public.has_permission('locations:view'));

-- =====================================================================
-- room_prices SELECT
-- =====================================================================
DROP POLICY IF EXISTS "Raum-Preise sichtbar" ON public.room_prices;

CREATE POLICY "Raum-Preise sehen"
  ON public.room_prices FOR SELECT TO authenticated
  USING (public.has_permission('locations:view'));
