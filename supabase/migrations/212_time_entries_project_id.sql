-- time_entries.project_id: konsolidiert Projekt-Stempel in die zentrale
-- Zeiterfassungs-Tabelle. Bisher lief Projekt-Zeit auf einer separaten
-- Tabelle (project_time_entries, Migration 186/188). Damit die Zeit-Views
-- (Payroll, Rapport, Admin-Uebersicht) einen einzigen Datenstamm haben,
-- bekommt time_entries jetzt eine optionale project_id-Spalte.
--
-- Semantik nach der Migration:
--   job_id gesetzt      => Auftrags-Stempel
--   project_id gesetzt  => Projekt-Stempel
--   beide NULL          => "Andere Arbeit" (description Pflicht)
--   beide gesetzt       => bewusst NICHT verboten (falls ein Projekt auf
--                          einem Auftrag laeuft; kein XOR-Constraint)
--
-- Rollback-Freundlich: project_time_entries wird NICHT gedroppt in dieser
-- Migration. Sie bleibt vorlaeufig als read-only-Backup fuer den Fall dass
-- die neue Konsolidierung Probleme macht. Der Drop kommt in einer spaeteren
-- "deprecate"-Migration wenn der neue Weg stabil laeuft.
--
-- Idempotent: mehrfach ausfuehrbar. Backfill via NOT EXISTS-Guard auf
-- (user_id, project_id, created_at)-Tupel — der eindeutigste stabile
-- Marker fuer identische Eintraege ohne zusaetzliche Marker-Spalte.

-- === 1. Spalte + Index ===
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS time_entries_project_idx
  ON public.time_entries(project_id) WHERE project_id IS NOT NULL;

COMMENT ON COLUMN public.time_entries.project_id IS
  'Referenz auf Projekt wenn User auf ein Projekt statt Auftrag gestempelt hat. Ersetzt die vormals separate project_time_entries-Tabelle. NULL = Auftrags-Stempel (job_id) oder Andere-Arbeit (nur description).';

-- === 2. CHECK-Constraint auf 3-Wege erweitern ===
-- Migration 055 hatte: (job_id NOT NULL OR description NOT NULL).
-- Jetzt: mindestens EINES aus {job_id, project_id, description} muss gesetzt sein.
-- KEIN XOR — beide Fremdschluessel gleichzeitig ist erlaubt (Projekt auf einem Auftrag).
ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_job_or_description;
ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_job_or_project_or_description;
ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_job_or_project_or_description
  CHECK (
    job_id IS NOT NULL
    OR project_id IS NOT NULL
    OR (description IS NOT NULL AND length(trim(description)) > 0)
  );

-- === 3. Backfill aus project_time_entries ===
-- Konvertierung entry_date+minutes -> clock_in/clock_out:
--   - Modern (clock_in gesetzt): 1:1 uebernehmen. Offener Stempel bleibt offen.
--   - Legacy (nur entry_date+minutes): synthetischer Start = entry_date 09:00 Europe/Zurich
--     (typischer Arbeitsbeginn; haelt Rows unter 15h tagesstabil).
-- Idempotenz: NOT EXISTS auf (user_id, project_id, created_at) — created_at aus
-- pte wird 1:1 uebernommen und ist praktisch immer eindeutig pro User/Projekt.
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'project_time_entries'
  ) THEN
    INSERT INTO public.time_entries (user_id, project_id, clock_in, clock_out, description, notes, created_at)
    SELECT
      pte.user_id,
      pte.project_id,
      COALESCE(
        pte.clock_in,
        ((pte.entry_date::text || ' 09:00:00')::timestamp AT TIME ZONE 'Europe/Zurich')
      ) AS clock_in,
      CASE
        WHEN pte.clock_out IS NOT NULL THEN pte.clock_out
        WHEN pte.clock_in IS NOT NULL AND pte.minutes IS NULL THEN NULL  -- offener Stempel bleibt offen
        WHEN pte.clock_in IS NOT NULL THEN pte.clock_in + (pte.minutes || ' minutes')::interval
        WHEN pte.minutes IS NOT NULL THEN
          ((pte.entry_date::text || ' 09:00:00')::timestamp AT TIME ZONE 'Europe/Zurich')
          + (pte.minutes || ' minutes')::interval
        ELSE NULL
      END AS clock_out,
      COALESCE(pte.description, 'Projekt-Zeit (aus project_time_entries migriert)') AS description,
      CASE
        WHEN pte.clock_in IS NULL THEN '[Legacy Projekt-Zeit — Startzeit synthetisch 09:00 ZRH]'
        ELSE NULL
      END AS notes,
      pte.created_at
    FROM public.project_time_entries pte
    WHERE NOT EXISTS (
      SELECT 1 FROM public.time_entries te
      WHERE te.user_id = pte.user_id
        AND te.project_id = pte.project_id
        AND te.created_at = pte.created_at
    );
  END IF;
END
$mig$;

-- Hinweis: DROP TABLE public.project_time_entries CASCADE bewusst NICHT hier.
-- Kommt in einer eigenen "deprecate"-Migration nachdem die neue Konsolidierung
-- in Reader/Writer umgestellt und beobachtet wurde.
