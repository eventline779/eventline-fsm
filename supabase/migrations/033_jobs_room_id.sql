-- Aufträge können einen externen Raum (rooms) referenzieren statt freier Adresse.
-- Bei job_type='extern' ist entweder room_id oder external_address gesetzt
-- (oder beide — Sub-Adresse innerhalb eines Raums; aktuell nur eins erwartet).
-- Bei job_type='location' ist room_id immer NULL (Standort-Auftrag nutzt location_id).

alter table public.jobs
  add column room_id uuid references public.rooms(id) on delete set null;

create index if not exists jobs_room_id_idx on public.jobs(room_id);

comment on column public.jobs.room_id is 'Optional: externer Veranstaltungsraum aus rooms-Tabelle. Nur bei job_type=extern relevant.';
