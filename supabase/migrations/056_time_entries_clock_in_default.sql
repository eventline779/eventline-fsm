-- Hotfix: clock_in-Default war auf der Legacy-time_entries-Tabelle nicht
-- gesetzt. Migration 055 hatte CREATE TABLE IF NOT EXISTS — beim
-- existierenden Schema kam der "default now()" deshalb nicht durch.
-- Ohne Default wirft jeder INSERT der das Feld nicht explizit setzt
-- "null value in column clock_in violates not-null constraint".
alter table public.time_entries alter column clock_in set default now();
