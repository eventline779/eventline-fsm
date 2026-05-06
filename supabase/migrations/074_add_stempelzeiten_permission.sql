-- Stempelzeiten als eigenes Permission-Modul ausgegliedert (war vorher
-- unter dem hr-Umbrella). Backwards-Compat: jede Rolle die hr:view hatte
-- bekommt jetzt auch stempelzeiten:view damit /stempelzeiten weiterhin
-- erreichbar ist.

UPDATE public.roles
SET permissions = permissions || '["stempelzeiten:view"]'::jsonb
WHERE permissions @> '["hr:view"]'::jsonb
  AND NOT (permissions @> '["stempelzeiten:view"]'::jsonb);
