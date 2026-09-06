-- Migration 215: apply_ticket enforcen den Abrechnungs-Lock aus Migration 214.
--
-- Hintergrund:
--   Migration 214 hat time_entries per RLS ab dem 5. des Folgemonats
--   gesperrt (is_time_entry_locked()). Die RPC public.apply_ticket
--   (Migration 213) laeuft aber SECURITY DEFINER — RLS-Policies greifen
--   in ihrem Body NICHT. Ohne expliziten Check koennte ein Admin/Manager
--   per Ticket-Approval einen bereits abgerechneten Zeitraum aendern
--   oder eine neue Row in ein gesperrtes Fenster schreiben. Genau das
--   soll 214 verhindern.
--
-- Was diese Migration macht:
--   - Definiert public.apply_ticket(uuid, ticket_status, text, text, text)
--     NEU (Signatur bleibt exakt gleich wie in 213). Body ist identisch
--     bis auf die zusaetzlichen Lock-Checks VOR den UPDATE/INSERT auf
--     public.time_entries:
--
--     Fall A) Korrektur eines existierenden Eintrags
--             (data.time_entry_id ist gesetzt):
--               a) aktuellen clock_in der Row lesen (SELECT ... FOR UPDATE)
--               b) is_time_entry_locked(alter clock_in) → abort
--               c) neuen clock_in bestimmen (data.neu_start ODER alter)
--               d) is_time_entry_locked(neuer clock_in) → abort
--             So faellt (b) den Fall "Row liegt in gesperrtem Monat",
--             und (d) den Fall "Ticket wuerde Row in einen gesperrten
--             Monat schieben".
--
--     Fall B) Neu-Anlage (kein data.time_entry_id, "vergessen einzustempeln"):
--               is_time_entry_locked(data.neu_start) → abort
--
--   - Fehlermeldung fuer Nutzer:
--     'Ticket kann nicht angewendet werden: Zeitraum bereits abgerechnet.'
--     (Klartext auf Deutsch, wird im Ticket-UI als Toast angezeigt.)
--
-- Was NICHT gebraucht wird:
--   - Es gibt aktuell keine weiteren RPCs, die public.time_entries mutieren:
--     grep ueber supabase/migrations/**.sql zeigt nur die drei apply_ticket-
--     Varianten (061 → 107 → 213, jeweils vollstaendig ersetzt) sowie die
--     einmaligen Backfills (055 rename, 134 entry_number, 212 project_id
--     Data-Move) — Backfills sind Migrationen, kein Runtime-Pfad. Fuer
--     Client-Direktzugriff (Supabase-JS INSERT/UPDATE/DELETE) sorgt bereits
--     die RLS aus 214.
--   - Sollten spaeter create_time_entry / update_time_entry / delete_time_entry
--     als RPC dazukommen, muessen sie den gleichen Check tragen.
--
-- Nachtragen im Notfall:
--   Wer nach der Deadline noch korrigieren muss, macht das bewusst per
--   direktem SQL (Leo-Vorgabe: "sonst stimmt die Auszahlung nicht").

-- Vorgaenger-Signaturen wegraeumen (idempotent). Nur die 5-arg-Version
-- aus 213 sollte existieren; die 3-/4-arg-Varianten sind seit 213 weg,
-- aber wir droppen defensiv, falls jemand out-of-order applied hat.
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
  v_target_id uuid;
  v_existing_clock_in timestamptz;
  v_new_clock_in timestamptz;
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
      -- === LOCK-CHECK vor UPDATE (Fall A) ===
      v_target_id := (v_data->>'time_entry_id')::uuid;

      -- Existierende Row laden + locken.
      SELECT clock_in INTO v_existing_clock_in
      FROM public.time_entries
      WHERE id = v_target_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'time_entry not found: %', v_target_id;
      END IF;

      -- (b) Alter Zeitraum bereits gesperrt?
      IF public.is_time_entry_locked(v_existing_clock_in) THEN
        RAISE EXCEPTION 'Ticket kann nicht angewendet werden: Zeitraum bereits abgerechnet.';
      END IF;

      -- (c/d) Neuer clock_in (falls Ticket ihn aendert) in gesperrtem Fenster?
      v_new_clock_in := COALESCE((v_data->>'neu_start')::timestamptz, v_existing_clock_in);
      IF public.is_time_entry_locked(v_new_clock_in) THEN
        RAISE EXCEPTION 'Ticket kann nicht angewendet werden: Zeitraum bereits abgerechnet.';
      END IF;

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
      WHERE id = v_target_id;
    ELSE
      -- === LOCK-CHECK vor INSERT (Fall B) ===
      v_new_clock_in := (v_data->>'neu_start')::timestamptz;
      IF public.is_time_entry_locked(v_new_clock_in) THEN
        RAISE EXCEPTION 'Ticket kann nicht angewendet werden: Zeitraum bereits abgerechnet.';
      END IF;

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
        v_new_clock_in,
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
  'Wendet einen Ticket-Statuswechsel an. Bei stempel_aenderung + erledigt: schreibt/updated eine time_entries-Row entsprechend data.context (auftrag/projekt/andere_arbeit). Admins koennen job_id bzw. project_id ueber die corrected_*-Parameter noch vor dem Approve korrigieren (Sentinel ANDERE_ARBEIT bzw. CLEAR). Prueft VOR jedem UPDATE/INSERT den Abrechnungs-Lock aus Migration 214: gesperrte Zeitraeume (5. des Folgemonats erreicht) werden mit klarer Fehlermeldung abgelehnt.';
