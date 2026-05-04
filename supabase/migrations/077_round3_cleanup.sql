-- Round-3-Audit Cleanup (2026-05-04).
--
-- 1. maintenance_tasks: alte "Instandhaltung..."-Policies aus 010 droppen
--    (Migration 076 hatte falsche Policy-Namen "Wartungsaufgaben..."
--    gedroppt → die alten lebten weiter neben den neuen, OR-kombiniert
--    mit using(true) → JEDER User sah alle Wartungsaufgaben).
-- 2. customer_country_counts: is_active-Filter raus (Doku in der View
--    sagte "auch archivierte fuer historische Sicht", Code filterte
--    aber `is_active=true AND archived_at IS NULL` — Doku-Code-Mismatch).
-- 3. Tickets: Composite-Index (status, resolved_at) fuer Archive-Query.

-- =====================================================================
-- 1. maintenance_tasks: alte 4 Policies wirklich raus
-- =====================================================================
DROP POLICY IF EXISTS "Instandhaltung ist sichtbar" ON public.maintenance_tasks;
DROP POLICY IF EXISTS "Admins können Instandhaltung erstellen" ON public.maintenance_tasks;
DROP POLICY IF EXISTS "Admins können Instandhaltung bearbeiten" ON public.maintenance_tasks;
DROP POLICY IF EXISTS "Admins können Instandhaltung löschen" ON public.maintenance_tasks;

-- =====================================================================
-- 2. customer_country_counts View — Filter korrigieren
-- World-Map zeigt absichtlich auch archivierte Kunden (historische
-- Sicht "wo hatten wir je Kunden"). Aber der Counts soll mit der
-- /kunden-Liste konsistent sein, die nur archived_at IS NULL filtert.
-- Daher: is_active raus, archived_at bleibt.
-- =====================================================================
CREATE OR REPLACE VIEW public.customer_country_counts
WITH (security_invoker = on) AS
SELECT
  COALESCE(NULLIF(address_country, ''), 'CH')::text AS country,
  COUNT(*)::int                                     AS count
FROM public.customers
WHERE archived_at IS NULL
GROUP BY country;

GRANT SELECT ON public.customer_country_counts TO authenticated;

-- =====================================================================
-- 3. Tickets-Archive-Query Composite-Index
-- /tickets im Archiv-Modus: in("status", ["erledigt","abgelehnt"]) +
-- lt("resolved_at", cutoff) — vorher nur tickets_created_at_idx, partial
-- effizient. Composite beschleunigt die Archive-Query merklich.
-- =====================================================================
CREATE INDEX IF NOT EXISTS tickets_status_resolved_at_idx
  ON public.tickets (status, resolved_at DESC)
  WHERE resolved_at IS NOT NULL;
