-- Ferien / Abwesenheits-Tracking.
--
-- Mitarbeiter beantragen Ferien (oder Krankheit, Komp-Tag, Frei-Tag),
-- Admin genehmigt oder lehnt ab. Pro Antrag ein Datum-Bereich (start
-- bis end), nicht einzelne Tage — vereinfacht UI und Storage.
--
-- Workflow:
--   1. Mitarbeiter erstellt -> status='beantragt'
--   2. Admin: status='genehmigt' (mit decision_note optional) ODER
--             status='abgelehnt' (decision_note mit Begruendung)
--   3. Mitarbeiter darf eigene Antraege nur loeschen/aendern wenn
--      noch 'beantragt' (RLS regelt).

CREATE TABLE IF NOT EXISTS public.time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  type text NOT NULL CHECK (type IN ('ferien', 'krank', 'kompensation', 'frei')),
  status text NOT NULL DEFAULT 'beantragt' CHECK (status IN ('beantragt', 'genehmigt', 'abgelehnt')),
  note text NULL,
  approved_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz NULL,
  decision_note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_off_dates_check CHECK (end_date >= start_date)
);

-- Pro User chronologisch — fuer "meine Antraege" + Team-Liste.
CREATE INDEX IF NOT EXISTS time_off_user_idx
  ON public.time_off (user_id, start_date DESC);

-- Status-basierte Queries: "wer ist gerade abwesend", "offene Antraege".
CREATE INDEX IF NOT EXISTS time_off_status_dates_idx
  ON public.time_off (status, start_date, end_date);

-- updated_at automatisch pflegen
CREATE OR REPLACE FUNCTION public.time_off_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS time_off_touch ON public.time_off;
CREATE TRIGGER time_off_touch
  BEFORE UPDATE ON public.time_off
  FOR EACH ROW EXECUTE FUNCTION public.time_off_touch_updated_at();

ALTER TABLE public.time_off ENABLE ROW LEVEL SECURITY;

-- Eigene sehen
DROP POLICY IF EXISTS "Eigene Ferien sehen" ON public.time_off;
CREATE POLICY "Eigene Ferien sehen"
  ON public.time_off FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Eigene anlegen
DROP POLICY IF EXISTS "Eigene Ferien anlegen" ON public.time_off;
CREATE POLICY "Eigene Ferien anlegen"
  ON public.time_off FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Eigene aendern wenn noch nicht entschieden
DROP POLICY IF EXISTS "Eigene Ferien aendern wenn beantragt" ON public.time_off;
CREATE POLICY "Eigene Ferien aendern wenn beantragt"
  ON public.time_off FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'beantragt')
  WITH CHECK (user_id = auth.uid());

-- Eigene loeschen wenn noch nicht entschieden
DROP POLICY IF EXISTS "Eigene Ferien loeschen wenn beantragt" ON public.time_off;
CREATE POLICY "Eigene Ferien loeschen wenn beantragt"
  ON public.time_off FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'beantragt');

-- Admin/Genehmiger sieht alle + entscheidet
DROP POLICY IF EXISTS "Genehmiger sieht alle Ferien" ON public.time_off;
CREATE POLICY "Genehmiger sieht alle Ferien"
  ON public.time_off FOR SELECT TO authenticated
  USING (public.has_permission('ferien:approve'));

DROP POLICY IF EXISTS "Genehmiger entscheidet" ON public.time_off;
CREATE POLICY "Genehmiger entscheidet"
  ON public.time_off FOR UPDATE TO authenticated
  USING (public.has_permission('ferien:approve'))
  WITH CHECK (public.has_permission('ferien:approve'));
