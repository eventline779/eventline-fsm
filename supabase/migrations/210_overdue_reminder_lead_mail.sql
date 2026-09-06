-- Erweitert das Reminder-Kind-Set fuer job_overdue_reminders um 'mail_lead'.
--
-- Vorher (Migration 205):
--   Tag +1 nach Enddatum → 'notification' an alle zugewiesenen MA
--   Tag +3 nach Enddatum → 'mail'         an alle zugewiesenen MA
--
-- Jetzt (Leos neue Regel):
--   Tag +1 → 'notification' + 'mail' an alle zugewiesenen MA (im gleichen Cron-Lauf)
--   Tag +3 → 'mail_lead'    an die Team-Leader jedes zugewiesenen MA
--            (profiles.team_lead_id aus Migration 208). Ein MA ohne
--            Team-Leader wird geskippt; mehrere MA mit demselben
--            Team-Leader → nur EINE Mail pro Leader pro Auftrag.
--
-- Idempotenz-Kontrakt bleibt identisch: UNIQUE(job_id, kind).
-- 'mail_lead' zaehlt als eigenes kind, kann also parallel zu 'mail'
-- (Tag +1) existieren, ohne die Unique-Constraint zu verletzen.
--
-- Diese Migration ist idempotent — der neue CHECK wird per DROP + ADD
-- ersetzt (der 205er Constraint-Name wird ueber `if exists` abgeraeumt).

alter table public.job_overdue_reminders
  drop constraint if exists job_overdue_reminders_kind_check;

alter table public.job_overdue_reminders
  add constraint job_overdue_reminders_kind_check
  check (kind in ('notification', 'mail', 'mail_lead'));

comment on table public.job_overdue_reminders is
  'Audit-Trail: welche Ueberfaelligkeits-Erinnerung wurde fuer welchen '
  'Auftrag wann verschickt. Kinds: '
  '"notification" (Tag +1, in-app an MA), '
  '"mail" (Tag +1, Email an MA), '
  '"mail_lead" (Tag +3, Email an Team-Leader jedes zugewiesenen MA).';
