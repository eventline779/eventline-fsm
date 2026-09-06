-- 216_job_drafts_auto_archive.sql
-- ============================================================
-- Auto-Archiv fuer job_drafts nach 30 Tagen Inaktivitaet.
--
-- Motivation:
--   Soft-geloeschte Drafts (is_deleted = true) sollen nicht ewig in
--   der Live-Tabelle liegen. Nach 30 Tagen ohne Aenderung werden sie
--   mit einem Archiv-Zeitstempel markiert (Soft-Archive, KEIN Purge).
--   Dadurch koennen Live-Queries sie sauber ausblenden, ohne dass
--   Daten verloren gehen.
--
-- pg_cron-Setup fuer den Aufruf der Function ist bewusst NICHT
-- Teil dieser Migration — der Cron-Endpoint kommt in der Backend-Phase.
-- ============================================================

-- 1) Archiv-Zeitstempel
alter table public.job_drafts
  add column if not exists archived_at timestamptz;

-- 2) Partial-Index fuer schnelle Archiv-Filter
create index if not exists job_drafts_archived_idx
  on public.job_drafts(archived_at)
  where archived_at is not null;

-- 3) Cron-Function: geloeschte Drafts nach 30 Tagen Inaktivitaet archivieren
create or replace function public.archive_stale_job_drafts()
returns integer
language plpgsql
as $$
declare
  archived_count integer;
begin
  update public.job_drafts
     set archived_at = now()
   where archived_at is null
     and is_deleted = true
     and updated_at < (now() - interval '30 days')
   returning 1;
  get diagnostics archived_count = row_count;
  return archived_count;
end;
$$;

comment on function public.archive_stale_job_drafts() is
  'Verschiebt geloeschte Drafts in Archiv nach 30 Tagen Inaktivitaet.';
