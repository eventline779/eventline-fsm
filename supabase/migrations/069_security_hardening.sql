-- Security-Hardening basierend auf Audit-Findings (2026-05-03).
--
-- Ziel: RLS-Policies die im Single-User-Phase noch `using(true)` waren
-- auf realistische Owner-/Admin-Checks verschaerfen, BEVOR die App auf
-- 100+ Mitarbeiter skaliert.
--
-- Inhalt:
--   1. calendar_events SELECT auf eigene/admin
--   2. documents SELECT auf uploader/admin
--   3. service_reports + report_photos SELECT auf creator/admin
--   4. notifications INSERT auf eigene-Empfaenger oder admin (Phishing-Vector zu)
--   5. UPDATE-Policies fuer location_contacts, room_contacts, room_prices ergaenzt
--      (waren komplett missing → stille RLS-Denials beim Editieren)
--
-- Admins kommen ueberall durch ueber is_admin(). Admin-Bypass ist
-- absichtlich da damit Stundenkontrolle, Reports-Review etc. moeglich
-- bleibt.

-- =====================================================================
-- 1. calendar_events: nur eigene oder Admin sehen
-- =====================================================================
DROP POLICY IF EXISTS "Kalendereinträge sind sichtbar" ON public.calendar_events;
CREATE POLICY "Kalendereinträge sind sichtbar" ON public.calendar_events
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR created_by = auth.uid() OR public.is_admin());

-- =====================================================================
-- 2. documents: nur eigene Uploads oder Admin sehen
-- (Long-term besser: via job/customer/location-Membership joinen, aber
--  dafuer brauchen documents direkte Owner-Spalten ueber uploaded_by hinaus
--  — das ist ein groesserer Refactor und nicht security-blocking)
-- =====================================================================
DROP POLICY IF EXISTS "Dokumente sind sichtbar" ON public.documents;
CREATE POLICY "Dokumente sind sichtbar" ON public.documents
  FOR SELECT TO authenticated
  USING (uploaded_by = auth.uid() OR public.is_admin());

-- =====================================================================
-- 3. service_reports + report_photos
-- =====================================================================
DROP POLICY IF EXISTS "Rapporte sind sichtbar" ON public.service_reports;
CREATE POLICY "Rapporte sind sichtbar" ON public.service_reports
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Fotos sind sichtbar" ON public.report_photos;
CREATE POLICY "Fotos sind sichtbar" ON public.report_photos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.service_reports r
    WHERE r.id = report_photos.report_id
    AND (r.created_by = auth.uid() OR public.is_admin())
  ));

-- INSERT-Policy fuer report_photos: nur wenn der User den zugehoerigen
-- service_report selbst erstellt hat (oder Admin).
DROP POLICY IF EXISTS "Benutzer können Fotos hochladen" ON public.report_photos;
CREATE POLICY "Benutzer können Fotos hochladen" ON public.report_photos
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.service_reports r
    WHERE r.id = report_photos.report_id
    AND (r.created_by = auth.uid() OR public.is_admin())
  ));

-- =====================================================================
-- 4. notifications INSERT: nur fuer eigene user_id (oder Admin)
-- Schliesst den Phishing-Vector: ohne diesen Check kann jeder
-- authentifizierte User Notifications mit beliebigem Title/Link an
-- jeden anderen User schreiben.
-- =====================================================================
DROP POLICY IF EXISTS "Notifications erstellen" ON public.notifications;
CREATE POLICY "Notifications erstellen" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- =====================================================================
-- 5. UPDATE-Policies wo bisher fehlend
-- =====================================================================
DROP POLICY IF EXISTS "Admins können Kontakte bearbeiten" ON public.location_contacts;
CREATE POLICY "Admins können Kontakte bearbeiten" ON public.location_contacts
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins können Raum-Kontakte bearbeiten" ON public.room_contacts;
CREATE POLICY "Admins können Raum-Kontakte bearbeiten" ON public.room_contacts
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins können Raum-Preise bearbeiten" ON public.room_prices;
CREATE POLICY "Admins können Raum-Preise bearbeiten" ON public.room_prices
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
