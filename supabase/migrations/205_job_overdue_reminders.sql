-- Audit-Trail fuer Ueberfaelligkeits-Erinnerungen an Auftraegen.
--
-- Der Cron /api/cron/auftrag-overdue laeuft taeglich und schickt fuer jeden
-- ueberfaelligen Auftrag (end_date < heute, Status weder abgeschlossen noch
-- storniert) an alle zugewiesenen Mitarbeiter:
--   - Tag +1 nach Enddatum: in-app Notification ("kind = 'notification'")
--   - Tag +3 nach Enddatum: Email via Resend         ("kind = 'mail'")
--
-- Damit derselbe Reminder nicht bei jedem Cron-Lauf erneut verschickt wird,
-- merken wir uns hier pro (job_id, kind) genau EINEN Eintrag. Alternative
-- waeren Spalten in jobs (overdue_notified_at, overdue_mailed_at) — hier
-- entschieden fuer eigene Tabelle:
--   - Audit-tauglich: wer wurde wann benachrichtigt (sent_to_user_ids).
--   - Erlaubt spaeter zusaetzliche Reminder-Types (z.B. 'escalation_admin'
--     an Tag +7) ohne DDL-Aenderung an jobs.
--   - Reine Append-Only-Semantik, kein UPDATE noetig.
--
-- Idempotenz-Kontrakt: UNIQUE(job_id, kind). Der Cron macht INSERT nach
-- erfolgreichem Versand — falls die Row bereits existiert, wird der Aufruf
-- geskippt. Retry ist trivial (Row loeschen, Cron neu triggern).

CREATE TABLE IF NOT EXISTS public.job_overdue_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('notification', 'mail')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_to_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  UNIQUE (job_id, kind)
);

CREATE INDEX IF NOT EXISTS job_overdue_reminders_job_idx
  ON public.job_overdue_reminders (job_id);

COMMENT ON TABLE public.job_overdue_reminders IS
  'Audit-Trail: welche Ueberfaelligkeits-Erinnerung (Notification/Mail) wurde fuer welchen Auftrag wann verschickt.';

ALTER TABLE public.job_overdue_reminders ENABLE ROW LEVEL SECURITY;

-- Nur Admins duerfen den Audit-Trail einsehen. Insert/Update/Delete
-- passiert ausschliesslich vom Cron (Service-Role) — es gibt bewusst
-- KEINE authenticated-Insert-Policy.
DROP POLICY IF EXISTS "job_overdue_reminders_select_admin"
  ON public.job_overdue_reminders;
CREATE POLICY "job_overdue_reminders_select_admin"
  ON public.job_overdue_reminders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND role = 'admin'
    )
  );
