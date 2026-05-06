-- job_appointments.is_done entfernen.
--
-- Die UI-Checkbox auf der Auftrags-Detailseite (jeder Termin hatte einen
-- Abhaek-Kasten links) war nicht mehr gewollt — Termine werden nicht mehr
-- als 'erledigt' markiert; Sichtbarkeit ergibt sich aus Datum und
-- Auftragsstatus. Auch die "Offene Termine"-Warnung beim Auftrag-
-- Abschliessen entfaellt.
--
-- IF EXISTS damit prod (wo die Spalte existiert) und ein hypothetisch
-- frisch aufgesetztes Schema (wo sie nie da war) gleich behandelt werden.

ALTER TABLE public.job_appointments
  DROP COLUMN IF EXISTS is_done;
