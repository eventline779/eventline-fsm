-- service_reports.technician_signature_url — Techniker-Unterschrift als
-- separater Storage-Pfad neben der Kunden-Unterschrift (signature_url).
--
-- Hintergrund: prod hatte die Spalte schon laenger (manuell angelegt, nie
-- als Migration committed). Dev wurde 2026-05-05 frisch dupliziert, ohne
-- diese Spalte. Code in rapport-form-modal + reports/[id]/pdf +
-- reports/[id]/send-invoice referenziert sie — Insert/Update schlugen mit
-- "Could not find column in schema cache" fehl.
--
-- IF NOT EXISTS damit prod's schon existierende Spalte nicht kollidiert.

ALTER TABLE public.service_reports
  ADD COLUMN IF NOT EXISTS technician_signature_url text;
