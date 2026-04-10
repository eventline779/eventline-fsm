-- =============================================
-- 1. Fortlaufende Auftragsnummer ab 26200
-- =============================================
create sequence if not exists public.job_number_seq start with 26200;

alter table public.jobs add column if not exists job_number integer unique default nextval('public.job_number_seq');

-- Existierende Jobs ohne Nummer bekommen eine
update public.jobs set job_number = nextval('public.job_number_seq') where job_number is null;

-- =============================================
-- 2. Jobs: Soft-Delete statt hartes Löschen
-- =============================================
alter table public.jobs add column if not exists is_deleted boolean default false;
