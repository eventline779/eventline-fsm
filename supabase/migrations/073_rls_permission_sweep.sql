-- RLS-Sweep auf Permission-System (basierend auf Audit 2026-05-04).
--
-- Vorher waren drei Tabellen-Familien noch im "admin-Hardcheck"-Pattern
-- der Single-User-Phase:
--   - partners        (admin = INSERT/UPDATE/DELETE; SELECT war using(true))
--   - calendar_events (admin = INSERT/UPDATE/DELETE; SELECT bereits 069 sauber)
--   - job_appointments (admin = INSERT/UPDATE/DELETE; SELECT war using(true))
-- Effekt: die `partner:*` und `kalender:*`-Toggles in der Rollen-Matrix
-- waren tot. Custom-Rolle wie "Sales" mit `partner:create` klickte den
-- Anlegen-Button, RLS lehnte stille mit "row-level security policy" ab.
--
-- Jetzt: alle drei Familien auf has_permission() umgestellt — die
-- Matrix-Toggles haben dadurch echte Wirkung.

-- =====================================================================
-- 1. partners
-- =====================================================================
DROP POLICY IF EXISTS "Authenticated users can view partners" ON public.partners;
DROP POLICY IF EXISTS "Admins können Partner erstellen" ON public.partners;
DROP POLICY IF EXISTS "Admins können Partner bearbeiten" ON public.partners;
DROP POLICY IF EXISTS "Admins können Partner löschen" ON public.partners;

CREATE POLICY "Partner sehen"
  ON public.partners FOR SELECT TO authenticated
  USING (public.has_permission('partner:view'));
CREATE POLICY "Partner anlegen"
  ON public.partners FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('partner:create'));
CREATE POLICY "Partner bearbeiten"
  ON public.partners FOR UPDATE TO authenticated
  USING (public.has_permission('partner:edit'))
  WITH CHECK (public.has_permission('partner:edit'));
CREATE POLICY "Partner löschen"
  ON public.partners FOR DELETE TO authenticated
  USING (public.has_permission('partner:delete'));

-- =====================================================================
-- 2. calendar_events
-- SELECT-Policy aus Migration 069 (eigene/created_by/admin) bleibt wie
-- sie ist — die deckt den Use-Case sauber ab. Nur die Mutations werden
-- auf has_permission() umgehoben.
-- =====================================================================
DROP POLICY IF EXISTS "Admins können Kalendereinträge erstellen" ON public.calendar_events;
DROP POLICY IF EXISTS "Admins können Kalendereinträge bearbeiten" ON public.calendar_events;
DROP POLICY IF EXISTS "Admins können Kalendereinträge löschen" ON public.calendar_events;

CREATE POLICY "Kalendereinträge anlegen"
  ON public.calendar_events FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('kalender:create'));
CREATE POLICY "Kalendereinträge bearbeiten"
  ON public.calendar_events FOR UPDATE TO authenticated
  USING (public.has_permission('kalender:edit'))
  WITH CHECK (public.has_permission('kalender:edit'));
CREATE POLICY "Kalendereinträge löschen"
  ON public.calendar_events FOR DELETE TO authenticated
  USING (public.has_permission('kalender:delete'));

-- =====================================================================
-- 3. job_appointments
-- SELECT war vorher using(true) — alle sahen alle Termine. Jetzt:
-- kalender:view ODER zugewiesen ODER admin. Dadurch wird ein Termin
-- der einem Mitarbeiter zugewiesen ist auch ohne kalender:view sichtbar
-- (z.B. fuer Auftrag-Detail-Seite die Termine nur laed wenn man den
-- Auftrag eh sehen darf). Mit kalender:view sieht der User den vollen
-- Kalender — analog zur SELECT-Logik in calendar_events.
-- =====================================================================
DROP POLICY IF EXISTS "Job-Termine sind sichtbar" ON public.job_appointments;
DROP POLICY IF EXISTS "Admins können Termine erstellen" ON public.job_appointments;
DROP POLICY IF EXISTS "Admins können Termine bearbeiten" ON public.job_appointments;
DROP POLICY IF EXISTS "Admins können Termine löschen" ON public.job_appointments;

CREATE POLICY "Termine sehen"
  ON public.job_appointments FOR SELECT TO authenticated
  USING (
    public.has_permission('kalender:view')
    OR assigned_to = auth.uid()
    OR public.is_admin()
  );
CREATE POLICY "Termine anlegen"
  ON public.job_appointments FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('kalender:create'));
CREATE POLICY "Termine bearbeiten"
  ON public.job_appointments FOR UPDATE TO authenticated
  USING (public.has_permission('kalender:edit'))
  WITH CHECK (public.has_permission('kalender:edit'));
CREATE POLICY "Termine löschen"
  ON public.job_appointments FOR DELETE TO authenticated
  USING (public.has_permission('kalender:delete'));

-- =====================================================================
-- 4. Migration der bestehenden Rollen — admin braucht keine Aenderungen
-- (has_permission() special-cased admin), techniker hat aktuell nur
-- *:view-Permissions. Wer ihm vorher kein kalender:create gegeben hat,
-- konnte eh keine Termine anlegen (admin-Hardcheck im RLS) — also kein
-- regressions-Risiko durch die Umstellung.
-- =====================================================================
