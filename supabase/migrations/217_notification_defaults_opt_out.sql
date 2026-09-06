-- Notification-Defaults: opt-out statt opt-in.
--
-- Vorher: user_notification_settings.channels defaulten auf '{}'::jsonb;
-- der Server/Client hat fuer fehlende Eintraege in_app=true / push=false /
-- email=isPartner angenommen. Ergebnis: neue Mitarbeiter mussten Mail und
-- Push erst aktiv einschalten, obwohl die Erwartung ist "alles an, ich
-- schalte bei Bedarf einzelne Kanaele ab".
--
-- Neu (opt-out):
--   1) Trigger auf profiles-INSERT legt automatisch eine Settings-Row an
--      mit allen bekannten Event-Typen auf in_app=true, email=true,
--      push=true.
--   2) Backfill fuer alle bestehenden Profile ohne Settings-Row auf denselben
--      Default. Bereits individualisierte Zeilen (mit eigener channels-jsonb)
--      werden NICHT ueberschrieben — der Nutzer hat ja bewusst gewaehlt.
--
-- Client-Fallback (siehe notification-service.lookupChannels /
-- benachrichtigungen-tab.effectiveChannel): wenn wider Erwarten keine Row
-- existiert oder ein neuer NotificationType noch nicht im Blob steht, gilt
-- weiterhin "alles aktiv". Damit ist diese Migration nicht kritisch — sie
-- bringt die DB nur in Sync mit dem UI-Versprechen.

-- Default-Blob mit allen aktuell existierenden NotificationTypes.
-- Bei einem neuen Type (siehe src/types/index.ts NotificationType) hier
-- ergaenzen — der Client-Fallback deckt es sonst nur bis zum naechsten
-- Setzen ab.
create or replace function public.notification_settings_default_channels()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'ticket_new',                 jsonb_build_object('in_app', true, 'email', true, 'push', true),
    'ticket_done',                jsonb_build_object('in_app', true, 'email', true, 'push', true),
    'ticket_rejected',            jsonb_build_object('in_app', true, 'email', true, 'push', true),
    'job_assigned',               jsonb_build_object('in_app', true, 'email', true, 'push', true),
    'job_overdue',                jsonb_build_object('in_app', true, 'email', true, 'push', true),
    'appointment_new',            jsonb_build_object('in_app', true, 'email', true, 'push', true),
    'todo_assigned',              jsonb_build_object('in_app', true, 'email', true, 'push', true),
    'todo_overdue',               jsonb_build_object('in_app', true, 'email', true, 'push', true),
    'stempel_reminder',           jsonb_build_object('in_app', true, 'email', true, 'push', true),
    'vertrieb_wiedervorlage',     jsonb_build_object('in_app', true, 'email', true, 'push', true),
    'system',                     jsonb_build_object('in_app', true, 'email', true, 'push', true),
    'partner_anfrage_bestaetigt', jsonb_build_object('in_app', true, 'email', true, 'push', true),
    'partner_anfrage_abgelehnt',  jsonb_build_object('in_app', true, 'email', true, 'push', true),
    'partner_termin_zugewiesen',  jsonb_build_object('in_app', true, 'email', true, 'push', true)
  );
$$;

-- Trigger-Funktion: neuer Profile-Insert -> Settings-Row anlegen.
-- SECURITY DEFINER damit die RLS-Policy "uns_insert_own" uns nicht blockiert
-- (der Insert laeuft im Kontext des handle_new_user()-Fluss ohne dass
-- auth.uid() zwingend schon der neue User ist). ON CONFLICT DO NOTHING
-- schuetzt gegen den Fall dass eine Settings-Row schon existiert (Sync,
-- Wiederherstellung, Race).
create or replace function public.handle_new_profile_notification_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_notification_settings (user_id, channels)
  values (new.id, public.notification_settings_default_channels())
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_notification_defaults_trg on public.profiles;
create trigger profiles_notification_defaults_trg
  after insert on public.profiles
  for each row execute function public.handle_new_profile_notification_defaults();

-- Backfill: alle Profile ohne Settings-Row auf opt-out-Defaults setzen.
-- Bewusst KEIN Overwrite fuer bereits vorhandene Zeilen — dort hat der
-- Nutzer schon selbst gewaehlt.
insert into public.user_notification_settings (user_id, channels)
select p.id, public.notification_settings_default_channels()
from public.profiles p
where not exists (
  select 1
  from public.user_notification_settings uns
  where uns.user_id = p.id
)
on conflict (user_id) do nothing;
