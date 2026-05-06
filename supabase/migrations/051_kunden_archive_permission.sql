-- kunden:archive ist eine separate Permission (vorher Teil von kunden:edit).
-- Ein Admin kann jetzt einer Rolle z.B. nur "Archivieren" geben ohne
-- generelles Edit-Recht. Admin bekommt sie automatisch zugewiesen.
update public.roles
  set permissions = permissions || '["kunden:archive"]'::jsonb
  where slug = 'admin' and not (permissions ? 'kunden:archive');
