-- Round-5-Audit-Fix: Self-Approval-Bypass in time_off-Policy schliessen.
--
-- Migration 082 hatte:
--   USING (user_id = auth.uid() AND status = 'beantragt')
--   WITH CHECK (user_id = auth.uid())
--
-- USING filtert die Rows die der User updaten DARF (nur eigene + beantragt).
-- WITH CHECK validiert das Ergebnis NACH dem Update — und prueft hier nur
-- user_id. Das laesst zu, dass der User per direktem Client-Update den
-- status seines eigenen beantragten Antrags auf 'genehmigt' setzt
-- ("Self-Approval"). Die RLS-Policy "Eigene Ferien aendern wenn beantragt"
-- erlaubt das, weil der Eingangs-State noch 'beantragt' war (USING ok)
-- und der Output-State user_id-match hat (WITH CHECK ok).
--
-- Fix: WITH CHECK muss garantieren dass nach dem Update KEINE Approval-
-- Felder gesetzt werden und der Status weiter 'beantragt' bleibt — sonst
-- soll nur die Genehmiger-Policy (has_permission('ferien:approve')) das
-- duerfen.

DROP POLICY IF EXISTS "Eigene Ferien aendern wenn beantragt" ON public.time_off;
CREATE POLICY "Eigene Ferien aendern wenn beantragt"
  ON public.time_off FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'beantragt')
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'beantragt'
    AND approved_by IS NULL
    AND approved_at IS NULL
    AND decision_note IS NULL
  );
