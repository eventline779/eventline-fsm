-- Migration 213: apply_ticket + get_all_time_entries mit project_id-Support.
--
-- Hintergrund: Seit Migration 212 traegt time_entries eine optionale
-- project_id. Damit koennen Projekt-Stempel jetzt in der zentralen
-- Zeiterfassungs-Tabelle liegen und muessen nicht mehr manuell in die
-- Legacy-Tabelle project_time_entries eingetragen werden.
--
-- Diese Migration passt zwei RPCs an, damit Projekt-Kontext durchgehend
-- unterstuetzt ist:
--
--   1) apply_ticket  — kann bei stempel_aenderung-Tickets mit
--      data.context='projekt' die project_id in die time_entries-Row
--      schreiben (Update bestehender Eintrag ODER Neu-Anlage bei
--      "Vergessen einzustempeln"). Admins koennen die Projekt-Wahl
--      des Mitarbeiters via neuem Parameter p_corrected_project_id
--      noch vor der Genehmigung korrigieren (analog zu
--      p_corrected_job_id aus Migration 107).
--        NULL     → keine Projekt-Korrektur (Ticket-Daten bleiben massgeblich)
--        'CLEAR'  → project_id explizit auf NULL setzen
--        <uuid>   → project_id ueberschreiben
--
--   2) get_all_time_entries — liefert jetzt zusaetzlich project_id,
--      project_number und project_title (LEFT JOIN public.projects).
--      Signaturaenderung (RETURNS TABLE ist Teil der Function-Signatur
--      bei Postgres) → DROP + CREATE. is_admin()-Gate bleibt.
--
-- Was bleibt unangetastet:
--   - hours_audit / monthly_payroll_stats (Migrationen 121/127/129/155/157/
--     173/174) filtern NICHT auf project_id — Projekt-Zeit wandert damit
--     bewusst in die Lohn-/Payroll-Sicht (deshalb ja die Budget-Genehmigung
--     via projects.budget_hours).
--   - get_job_hours_audit (Migration 060) filtert bereits ueber job_id →
--     Projekt-Zeit (project_id gesetzt, job_id NULL) taucht dort nicht auf,
--     also keine Aenderung noetig.
--   - Die Legacy-Tabelle project_time_entries bleibt vorlaeufig als
--     read-only-Backup bestehen (siehe Migration 212 Kommentar).

-- === 1. get_all_time_entries ===
-- Signatur-Aenderung (neue Spalten in RETURNS TABLE) → hart droppen.
DROP FUNCTION IF EXISTS public.get_all_time_entries(uuid, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_all_time_entries(
  filter_user_id uuid DEFAULT NULL,
  filter_from timestamptz DEFAULT NULL,
  filter_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  user_name text,
  job_id uuid,
  job_number int,
  job_title text,
  project_id uuid,
  project_number int,
  project_title text,
  clock_in timestamptz,
  clock_out timestamptz,
  description text,
  notes text,
  duration_minutes int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden: nur fuer Administratoren';
  END IF;
  RETURN QUERY
    SELECT
      t.id,
      t.user_id,
      p.full_name AS user_name,
      t.job_id,
      j.job_number,
      j.title AS job_title,
      t.project_id,
      pr.project_number,
      pr.title AS project_title,
      t.clock_in,
      t.clock_out,
      t.description,
      t.notes,
      CASE
        WHEN t.clock_out IS NULL THEN NULL
        ELSE (extract(epoch FROM (t.clock_out - t.clock_in)) / 60)::int
      END AS duration_minutes
    FROM public.time_entries t
    JOIN public.profiles p ON p.id = t.user_id
    LEFT JOIN public.jobs j ON j.id = t.job_id
    LEFT JOIN public.projects pr ON pr.id = t.project_id
    WHERE (filter_user_id IS NULL OR t.user_id = filter_user_id)
      AND (filter_from IS NULL OR t.clock_in >= filter_from)
      AND (filter_to IS NULL OR t.clock_in < filter_to)
    ORDER BY t.clock_in DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_time_entries(uuid, timestamptz, timestamptz) TO authenticated;

-- === 2. apply_ticket — neue Signatur mit p_corrected_project_id ===
-- Wie Migration 107: DROP + CREATE, weil ein neuer Parameter dazukommt.
-- Alle bekannten Vorgaenger-Signaturen wegraeumen, damit keine Overload-
-- Ambiguitaet entsteht (3-arg von 061, 4-arg von 107, 5-arg von hier).
DROP FUNCTION IF EXISTS public.apply_ticket(uuid, ticket_status, text);
DROP FUNCTION IF EXISTS public.apply_ticket(uuid, ticket_status, text, text);
DROP FUNCTION IF EXISTS public.apply_ticket(uuid, ticket_status, text, text, text);

CREATE OR REPLACE FUNCTION public.apply_ticket(
  p_ticket_id uuid,
  p_new_status ticket_status,
  p_resolution_note text,
  p_corrected_job_id text DEFAULT NULL,
  p_corrected_project_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.tickets%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_data jsonb;
  v_corrected_job_id uuid;
  v_corrected_project_id uuid;
  v_has_job_correction boolean := p_corrected_job_id IS NOT NULL;
  v_has_project_correction boolean := p_corrected_project_id IS NOT NULL;
  v_context text;
  v_data_job_id uuid;
  v_data_project_id uuid;
BEGIN
  -- Permission-Check: nur Admin/Manager.
  IF NOT (public.is_admin() OR public.has_permission('tickets:manage')) THEN
    RAISE EXCEPTION 'forbidden: nur fuer tickets:manage';
  END IF;

  -- Ticket laden + locken.
  SELECT * INTO t FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket not found';
  END IF;

  IF p_new_status NOT IN ('erledigt', 'abgelehnt') THEN
    RAISE EXCEPTION 'invalid target status: %', p_new_status;
  END IF;

  -- corrected_job_id parsen. Sentinel 'ANDERE_ARBEIT' → NULL, sonst UUID.
  IF v_has_job_correction AND p_corrected_job_id <> 'ANDERE_ARBEIT' AND p_corrected_job_id <> '' THEN
    v_corrected_job_id := p_corrected_job_id::uuid;
  ELSE
    v_corrected_job_id := NULL;
  END IF;

  -- corrected_project_id parsen. Sentinel 'CLEAR' → project_id auf NULL
  -- setzen (Admin will die Projekt-Zuordnung explizit entfernen). UUID →
  -- setzen. Leerer String zaehlt wie NULL (keine Korrektur).
  IF v_has_project_correction AND p_corrected_project_id = '' THEN
    v_has_project_correction := false;
  END IF;
  IF v_has_project_correction AND p_corrected_project_id <> 'CLEAR' THEN
    v_corrected_project_id := p_corrected_project_id::uuid;
  ELSE
    v_corrected_project_id := NULL;
  END IF;

  -- Spezial-Logik: bei stempel_aenderung + erledigt → time_entries updaten.
  IF t.type = 'stempel_aenderung' AND p_new_status = 'erledigt' THEN
    v_data := t.data;
    v_context := v_data->>'context';
    v_data_job_id := NULLIF(v_data->>'job_id', '')::uuid;
    v_data_project_id := NULLIF(v_data->>'project_id', '')::uuid;

    IF v_data ? 'time_entry_id' AND COALESCE(v_data->>'time_entry_id', '') <> '' THEN
      -- Korrektur eines existierenden Eintrags. Bei v_has_job_correction bzw.
      -- v_has_project_correction werden die entsprechenden Felder ueberschrieben;
      -- sonst bleiben sie unangetastet. Der bisherige Auftrag/Projekt-Bezug
      -- bleibt also erhalten, wenn der Admin ihn nicht explizit aendert.
      UPDATE public.time_entries
      SET clock_in  = COALESCE((v_data->>'neu_start')::timestamptz, clock_in),
          clock_out = COALESCE((v_data->>'neu_end')::timestamptz, clock_out),
          job_id     = CASE WHEN v_has_job_correction     THEN v_corrected_job_id     ELSE job_id     END,
          project_id = CASE WHEN v_has_project_correction THEN v_corrected_project_id ELSE project_id END,
          notes = CONCAT_WS(E'\n', notes, '[Korrektur via Ticket #' || p_ticket_id || ']')
      WHERE id = (v_data->>'time_entry_id')::uuid;
    ELSE
      -- Neuer Eintrag (Mitarbeiter hat vergessen einzustempeln). Kontext-
      -- abhaengig aus data:
      --   context='auftrag'       → job_id  aus data (oder Admin-Korrektur)
      --   context='projekt'       → project_id aus data (oder Admin-Korrektur),
      --                             job_id bleibt NULL
      --   context='andere_arbeit' → beide NULL, beschreibung als description
      -- Der CHECK-Constraint time_entries_job_or_project_or_description
      -- (Migration 212) verlangt mindestens EINES aus {job_id, project_id,
      -- description not null}. Modal-Validierung stellt das sicher.
      INSERT INTO public.time_entries (user_id, job_id, project_id, clock_in, clock_out, description, notes)
      VALUES (
        t.created_by,
        CASE
          WHEN v_has_job_correction THEN v_corrected_job_id
          WHEN v_context = 'projekt' THEN NULL
          WHEN v_context = 'andere_arbeit' THEN NULL
          ELSE v_data_job_id
        END,
        CASE
          WHEN v_has_project_correction THEN v_corrected_project_id
          WHEN v_context = 'projekt' THEN v_data_project_id
          ELSE NULL
        END,
        (v_data->>'neu_start')::timestamptz,
        (v_data->>'neu_end')::timestamptz,
        v_data->>'beschreibung',
        '[Nachtraeglich erfasst via Ticket #' || p_ticket_id || ']'
      );
    END IF;
  END IF;

  -- Status-Update.
  UPDATE public.tickets
  SET status = p_new_status,
      resolved_at = now(),
      resolved_by = v_user_id,
      resolution_note = p_resolution_note
  WHERE id = p_ticket_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_ticket(uuid, ticket_status, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.apply_ticket(uuid, ticket_status, text, text, text) IS
  'Wendet einen Ticket-Statuswechsel an. Bei stempel_aenderung + erledigt: schreibt/updated eine time_entries-Row entsprechend data.context (auftrag/projekt/andere_arbeit). Admins koennen job_id bzw. project_id ueber die corrected_*-Parameter noch vor dem Approve korrigieren (Sentinel ANDERE_ARBEIT bzw. CLEAR).';
