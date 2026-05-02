-- todos.job_id war nie genutzt (kein Code hat die Spalte gelesen oder
-- geschrieben). Job-Verknuepfung wurde bewusst verworfen — Todos bleiben
-- persoenliche/team-uebergreifende Aufgaben, fuer Standort-bezogene
-- Wartung gibt's maintenance_tasks (mit eigenem job_id-Link).
alter table public.todos drop column if exists job_id;
