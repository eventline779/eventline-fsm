-- get_stempel_reminder_candidates() — RPC fuer den Stempel-Reminder-Cron.
--
-- Vorher lief der Cron mit einem N+1-Loop:
--   1. SELECT alle offenen time_entries
--   2. PER ENTRY: SELECT ob notifications-Reminder schon existiert
--   3. PER ENTRY: SELECT letzter job_appointment.end_time
--   4. PER ENTRY: SELECT job_number, title
-- Bei 100 Mitarbeitern × ~50 offene Stempel × 48 Cron-Runs/Tag = >20k
-- Queries/Tag nur fuer den Cron, mit Vercel-Function-Timeout-Risiko.
--
-- Jetzt: ein SQL-Statement das alle Joins inline macht und nur die
-- relevanten Kandidaten zurueckgibt — der Cron muss dann nur noch
-- einen Bulk-INSERT machen.

CREATE OR REPLACE FUNCTION public.get_stempel_reminder_candidates(
  cutoff timestamptz
)
RETURNS TABLE (
  entry_id uuid,
  user_id uuid,
  job_id uuid,
  latest_end timestamptz,
  job_number int,
  job_title text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    te.id            AS entry_id,
    te.user_id       AS user_id,
    te.job_id        AS job_id,
    appt.end_time    AS latest_end,
    j.job_number     AS job_number,
    j.title          AS job_title
  FROM public.time_entries te
  -- LATERAL: nur den juengsten Termin pro Job mit end_time joinen.
  CROSS JOIN LATERAL (
    SELECT a.end_time
    FROM public.job_appointments a
    WHERE a.job_id = te.job_id
      AND a.end_time IS NOT NULL
    ORDER BY a.end_time DESC
    LIMIT 1
  ) appt
  JOIN public.jobs j ON j.id = te.job_id
  -- Schon einen Reminder fuer diesen Eintrag? Dann skip.
  LEFT JOIN public.notifications n
    ON n.resource_type = 'time_entry'
    AND n.resource_id = te.id
    AND n.type = 'stempel_reminder'
  WHERE te.clock_out IS NULL
    AND te.job_id IS NOT NULL
    AND appt.end_time < cutoff       -- Termin > 2h vorbei
    AND n.id IS NULL;                -- noch nicht erinnert
$$;

-- Nur Service-Role + Admin-API soll's aufrufen koennen — der Endpoint
-- check't das Cron-Secret ohnehin.
REVOKE ALL ON FUNCTION public.get_stempel_reminder_candidates(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_stempel_reminder_candidates(timestamptz) TO service_role;
