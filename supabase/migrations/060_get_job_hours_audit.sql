-- get_job_hours_audit(p_job_id) — Stundenkontrolle pro Auftrag fuer Admins.
--
-- Liefert pro Mitarbeiter, der entweder gestempelt ODER im Rapport
-- gelistet ist:
--   - stempel_minutes : Summe aller geschlossenen time_entries auf diesem
--                       Auftrag (clock_out NOT NULL)
--   - rapport_minutes : Summe aller Einsatz-Ranges in service_reports
--                       (time_ranges JSONB), gefiltert auf seinen
--                       technician_id, abzueglich Pause-Minuten
--   - diff_minutes    : rapport - stempel
--                       negativ = Mitarbeiter hat weniger im Rapport
--                                 angegeben als gestempelt
--                       positiv = Rapport > Stempel
--
-- SECURITY DEFINER + is_admin()-Check, weil die Funktion Daten ueber
-- alle Mitarbeiter zurueckgibt (ueber RLS sieht ein normaler User nur
-- seine eigenen).

CREATE OR REPLACE FUNCTION public.get_job_hours_audit(p_job_id uuid)
RETURNS TABLE(
  user_id uuid,
  user_name text,
  stempel_minutes int,
  rapport_minutes int,
  diff_minutes int
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden: nur fuer Administratoren';
  END IF;

  RETURN QUERY
  WITH stempel AS (
    SELECT
      t.user_id,
      SUM(GREATEST(0, EXTRACT(EPOCH FROM (t.clock_out - t.clock_in)) / 60))::int AS minutes
    FROM public.time_entries t
    WHERE t.job_id = p_job_id
      AND t.clock_out IS NOT NULL
    GROUP BY t.user_id
  ),
  rapport AS (
    SELECT
      (range->>'technician_id')::uuid AS user_id,
      SUM(
        GREATEST(
          0,
          EXTRACT(EPOCH FROM ((range->>'end')::time - (range->>'start')::time))::int / 60
            - COALESCE(NULLIF(range->>'pause', '')::int, 0)
        )
      )::int AS minutes
    FROM public.service_reports r
    CROSS JOIN LATERAL jsonb_array_elements(r.time_ranges) AS range
    WHERE r.job_id = p_job_id
      AND COALESCE(range->>'technician_id', '') <> ''
      AND COALESCE(range->>'start', '') <> ''
      AND COALESCE(range->>'end', '') <> ''
    GROUP BY (range->>'technician_id')::uuid
  ),
  all_users AS (
    SELECT s.user_id FROM stempel s
    UNION
    SELECT r.user_id FROM rapport r
  )
  SELECT
    u.user_id,
    COALESCE(p.full_name, '—') AS user_name,
    COALESCE(s.minutes, 0) AS stempel_minutes,
    COALESCE(r.minutes, 0) AS rapport_minutes,
    COALESCE(r.minutes, 0) - COALESCE(s.minutes, 0) AS diff_minutes
  FROM all_users u
  LEFT JOIN public.profiles p ON p.id = u.user_id
  LEFT JOIN stempel s ON s.user_id = u.user_id
  LEFT JOIN rapport r ON r.user_id = u.user_id
  ORDER BY COALESCE(p.full_name, '—');
END;
$$;
