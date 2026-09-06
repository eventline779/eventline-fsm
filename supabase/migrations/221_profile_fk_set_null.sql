-- Migration 221: alle "actor/owner"-FKs auf profiles.id auf ON DELETE SET NULL
--
-- Problem: viele FKs zeigen auf profiles(id) mit ON DELETE NO ACTION, was
-- den Delete eines Profils blockiert sobald irgendeine dieser Tabellen
-- noch eine Row referenziert. Der Delete-Endpoint fing den Fehler bisher
-- nicht sauber ab → Frontend zeigte 'gelöscht', DB hatte Row noch. Und
-- die UI verspricht dem Admin ausdruecklich "Anfragen bleiben bestehen
-- (Ersteller wird auf —)" — das setzt SET NULL voraus.
--
-- Aktion: alle FKs deren Semantik 'wer war das mal' ist → SET NULL.
-- Row bleibt fuer Audit/Historie, Reference-Column wird NULL.

alter table public.jobs
  drop constraint if exists jobs_created_by_fkey,
  add constraint jobs_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.rental_requests
  drop constraint if exists rental_requests_created_by_fkey,
  add constraint rental_requests_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.calendar_events
  drop constraint if exists calendar_events_profile_id_fkey,
  add constraint calendar_events_profile_id_fkey
    foreign key (profile_id) references public.profiles(id) on delete set null;

alter table public.calendar_events
  drop constraint if exists calendar_events_created_by_fkey,
  add constraint calendar_events_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.company_settings
  drop constraint if exists company_settings_updated_by_fkey,
  add constraint company_settings_updated_by_fkey
    foreign key (updated_by) references public.profiles(id) on delete set null;

alter table public.documents
  drop constraint if exists documents_uploaded_by_fkey,
  add constraint documents_uploaded_by_fkey
    foreign key (uploaded_by) references public.profiles(id) on delete set null;

alter table public.maintenance_tasks
  drop constraint if exists maintenance_tasks_created_by_fkey,
  add constraint maintenance_tasks_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.partner_form_template
  drop constraint if exists partner_form_template_live_published_by_fkey,
  add constraint partner_form_template_live_published_by_fkey
    foreign key (live_published_by) references public.profiles(id) on delete set null;

alter table public.partner_form_template
  drop constraint if exists partner_form_template_draft_updated_by_fkey,
  add constraint partner_form_template_draft_updated_by_fkey
    foreign key (draft_updated_by) references public.profiles(id) on delete set null;

alter table public.service_reports
  drop constraint if exists service_reports_created_by_fkey,
  add constraint service_reports_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.time_entries
  drop constraint if exists time_entries_profile_id_fkey,
  add constraint time_entries_profile_id_fkey
    foreign key (user_id) references public.profiles(id) on delete set null;

alter table public.todo_attachments
  drop constraint if exists todo_attachments_uploaded_by_fkey,
  add constraint todo_attachments_uploaded_by_fkey
    foreign key (uploaded_by) references public.profiles(id) on delete set null;

alter table public.todos
  drop constraint if exists todos_created_by_fkey,
  add constraint todos_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.todos
  drop constraint if exists todos_assigned_to_fkey,
  add constraint todos_assigned_to_fkey
    foreign key (assigned_to) references public.profiles(id) on delete set null;

alter table public.wage_documents
  drop constraint if exists wage_documents_uploaded_by_fkey,
  add constraint wage_documents_uploaded_by_fkey
    foreign key (uploaded_by) references public.profiles(id) on delete set null;
