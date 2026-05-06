-- Todos + Anhaenge: Admin-Bypass ergaenzen.
--
-- App-weite Eventline-Regel: Admin sieht alle personenspezifischen Daten
-- aller Mitarbeiter, alle anderen Rollen sehen nur ihre eigenen.
--
-- Vorher: Admin sah bei todos NUR eigene + ihm zugewiesene — wie alle
-- anderen. Jetzt erlaubt is_admin() Vollzugriff. Mitarbeiter-Sicht
-- bleibt unveraendert (created_by ODER assigned_to).
--
-- Andere personenspezifische Tabellen (time_entries, tickets,
-- ticket_attachments) hatten den Admin-Bypass bereits eingebaut.
-- notifications bleibt own-only (jeder kriegt eh nur seine eigenen).

DROP POLICY IF EXISTS "Eigene Todos sichtbar" ON public.todos;
CREATE POLICY "Eigene Todos sichtbar" ON public.todos
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Eigene Todos bearbeiten" ON public.todos;
CREATE POLICY "Eigene Todos bearbeiten" ON public.todos
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Eigene Todos loeschen" ON public.todos;
CREATE POLICY "Eigene Todos loeschen" ON public.todos
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Eigene Todo-Anhaenge sichtbar" ON public.todo_attachments;
CREATE POLICY "Eigene Todo-Anhaenge sichtbar" ON public.todo_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.todos t
      WHERE t.id = todo_attachments.todo_id
        AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "Eigene Todo-Anhaenge loeschen" ON public.todo_attachments;
CREATE POLICY "Eigene Todo-Anhaenge loeschen" ON public.todo_attachments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.todos t
      WHERE t.id = todo_attachments.todo_id
        AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid() OR public.is_admin())
    )
  );
