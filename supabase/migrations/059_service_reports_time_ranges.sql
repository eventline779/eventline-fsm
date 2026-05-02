-- Fehlende Spalten auf service_reports nachziehen.
--
-- Im Frontend (rapport-form-modal.tsx, time-ranges-section.tsx) werden
-- service_reports.time_ranges (JSONB) und service_reports.technician_name
-- bereits gelesen + beschrieben — aber die DB-Spalten waren nie angelegt.
-- Resultat: jeder Rapport-Submit haette mit "column does not exist" gefailt.
-- Ist bisher nur niemand aufgefallen weil noch kein Rapport in der dev-DB
-- existiert (0 Rows). Wird relevant fuer die kommende Stundenkontrolle-
-- Card auf der Auftrag-Detail-Seite, die genau diese time_ranges braucht
-- um Rapport-Stunden vs Stempel-Stunden zu vergleichen.
--
-- Schema:
--   time_ranges  : jsonb[] mit { date, start, end, pause, technician_id }
--                  Default leeres Array damit alte Rows nicht NULL haben.
--   technician_name : Snapshot des Techniker-Namens im Rapport (auch wenn
--                     der profile-Eintrag spaeter umbenannt wird).

ALTER TABLE public.service_reports
  ADD COLUMN IF NOT EXISTS time_ranges jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS technician_name text;
