-- vertrieb_counts View — analog zu auftraege_counts (Migration 040).
-- Vorher wurden alle Counts in der UI client-seitig berechnet aus dem
-- contacts-State. Das skaliert nur solange ALLES geladen wird; sobald
-- Pagination kommt oder die Liste >1k Leads wird, sind die Donut-Counts
-- falsch / ueberraschend leer.
--
-- security_invoker=on damit RLS-Policies aus 070 (vertrieb:view) greifen.

CREATE OR REPLACE VIEW public.vertrieb_counts
WITH (security_invoker = on) AS
SELECT
  count(*)::int                                                             AS total,
  count(*) FILTER (WHERE status = 'offen')::int                             AS offen,
  count(*) FILTER (WHERE status = 'kontaktiert')::int                       AS kontaktiert,
  count(*) FILTER (WHERE status = 'gespraech')::int                         AS gespraech,
  count(*) FILTER (WHERE status = 'gewonnen')::int                          AS gewonnen,
  count(*) FILTER (WHERE status = 'abgesagt')::int                          AS abgesagt,
  -- Schritt-1..4 (nur die nicht-finalen, fuer das Donut-Diagramm)
  count(*) FILTER (
    WHERE coalesce(step, 1) = 1 AND status NOT IN ('gewonnen', 'abgesagt')
  )::int AS step_1,
  count(*) FILTER (
    WHERE coalesce(step, 1) = 2 AND status NOT IN ('gewonnen', 'abgesagt')
  )::int AS step_2,
  count(*) FILTER (
    WHERE coalesce(step, 1) = 3 AND status NOT IN ('gewonnen', 'abgesagt')
  )::int AS step_3,
  count(*) FILTER (
    WHERE coalesce(step, 1) = 4 AND status NOT IN ('gewonnen', 'abgesagt')
  )::int AS step_4
FROM public.vertrieb_contacts;

GRANT SELECT ON public.vertrieb_counts TO authenticated;
