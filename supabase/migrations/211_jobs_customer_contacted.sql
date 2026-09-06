-- Follow-up-Kontakt-Tracking pro Auftrag.
-- Team-Member markiert: "Kunde wurde bereits kontaktiert" (Rueckfrage, Klaerung, etc.)
-- damit niemand doppelt anruft. Timestamp+User fuer Audit.
alter table public.jobs
  add column if not exists customer_contacted_at timestamptz,
  add column if not exists customer_contacted_by uuid references public.profiles(id) on delete set null;

create index if not exists jobs_customer_contacted_idx
  on public.jobs(customer_contacted_at) where customer_contacted_at is not null;

comment on column public.jobs.customer_contacted_at is
  'Zeitpunkt an dem ein Team-Member markiert hat dass der Kunde kontaktiert wurde. NULL = noch nicht.';
