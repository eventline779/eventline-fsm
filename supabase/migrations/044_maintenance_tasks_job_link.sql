-- Verknuepft Instandhaltung mit dem ggf. erstellten Auftrag.
-- Wenn der Auftrag abgeschlossen wird, gilt die Instandhaltung als erledigt
-- (UI leitet den Status aus der Verknuepfung ab, kein manueller Toggle mehr).
-- ON DELETE SET NULL: Wird der Auftrag geloescht (is_deleted), bleibt die
-- Instandhaltung bestehen und gilt wieder als offen.
alter table public.maintenance_tasks
  add column if not exists job_id uuid references public.jobs(id) on delete set null;

create index if not exists idx_maintenance_tasks_job_id on public.maintenance_tasks(job_id);
