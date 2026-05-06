-- Permission-Modell-Erweiterung: HR wurde in Hub + separate Module aufgesplittet.
--
-- Vorher: hr:view deckte /hr, /todos, /schulungen, /stempelzeiten ab — Admin
-- konnte im Rollen-Tab nur "HR sehen" toggeln, kein granulares "Todos
-- anlegen", "Termin erstellen" etc.
--
-- Jetzt:
--   - todos: eigenes Modul mit view/create/edit/delete
--   - hr: nur noch Hub-Seite + Schulungen-Platzhalter + Stempelzeiten (own)
--   - kalender: jetzt mit create/edit/delete fuer Termine (Kalender-Modal)
--   - vertrieb: jetzt mit create/edit/delete fuer Leads
--
-- Backwards-Compat: jede Rolle die vorher hr:view hatte, kriegt jetzt auch
-- todos:view damit /todos weiter erreichbar ist. Admin bypassed Permissions
-- ohnehin — der gilt als allmaechtig.

-- permissions ist jsonb (Array von Strings) — also via JSON-Operationen
-- erweitern, nicht via array_agg. Wir filtern auf Rollen die hr:view
-- haben aber todos:view noch nicht, und appenden todos:view ans Array.
UPDATE public.roles
SET permissions = permissions || '["todos:view"]'::jsonb
WHERE permissions @> '["hr:view"]'::jsonb
  AND NOT (permissions @> '["todos:view"]'::jsonb);
