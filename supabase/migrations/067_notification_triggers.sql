-- DB-Trigger fuer In-App-Notifications.
--
-- Ergaenzt das bestehende Ticket-Notification-System (das per /api/tickets/
-- notify lief) um drei automatische Notifications die direkt aus der DB
-- via AFTER-INSERT-Triggern feuern:
--
--   1. job_assigned       — bei INSERT in job_assignments
--   2. appointment_new    — bei INSERT in job_appointments
--   3. todo_assigned      — bei INSERT in todos mit assigned_to gesetzt
--                            ODER UPDATE wenn assigned_to neu/geaendert
--
-- Stempel-Reminder ist keiner DB-Trigger sondern ein Cron-Job (siehe
-- /api/cron/stempel-reminder) — der prueft nach Termin-Ende + 2h ob noch
-- ausgestempelt werden muss.
--
-- Alle Trigger sind SECURITY DEFINER damit der INSERT in notifications
-- unabhaengig von RLS-Policies funktioniert. Sie schliessen Self-
-- Notifications aus (wer den Auftrag/Todo selbst ausloest, bekommt
-- keine Notification fuer sich selbst).

-- =====================================================================
-- 1. Job-Assignment
-- =====================================================================
CREATE OR REPLACE FUNCTION public.notify_job_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job_number int;
  v_job_title text;
  v_creator_name text;
BEGIN
  -- Skip wenn der User sich selber zuweist.
  IF NEW.profile_id IS NULL OR NEW.profile_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  SELECT job_number, title INTO v_job_number, v_job_title
  FROM public.jobs WHERE id = NEW.job_id;

  SELECT full_name INTO v_creator_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.notifications (user_id, type, title, message, link, resource_type, resource_id)
  VALUES (
    NEW.profile_id,
    'job_assigned',
    'Auftrag zugewiesen: INT-' || COALESCE(v_job_number::text, '?'),
    COALESCE(v_creator_name, 'Admin') || ': ' || COALESCE(v_job_title, 'Auftrag'),
    '/auftraege/' || NEW.job_id,
    'job',
    NEW.job_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS job_assignments_notify ON public.job_assignments;
CREATE TRIGGER job_assignments_notify
  AFTER INSERT ON public.job_assignments
  FOR EACH ROW EXECUTE FUNCTION public.notify_job_assigned();

-- =====================================================================
-- 2. Termin-Erstellung
-- =====================================================================
CREATE OR REPLACE FUNCTION public.notify_appointment_new()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job_number int;
  v_job_title text;
  v_creator_name text;
  v_when text;
BEGIN
  -- Nur Termine mit assigned_to triggern eine Notification — sonst gibt
  -- es keinen klaren Empfaenger.
  IF NEW.assigned_to IS NULL OR NEW.assigned_to = auth.uid() THEN
    RETURN NEW;
  END IF;

  SELECT job_number, title INTO v_job_number, v_job_title
  FROM public.jobs WHERE id = NEW.job_id;

  SELECT full_name INTO v_creator_name FROM public.profiles WHERE id = auth.uid();

  v_when := to_char(NEW.start_time AT TIME ZONE 'Europe/Zurich', 'DD.MM.YYYY HH24:MI');

  INSERT INTO public.notifications (user_id, type, title, message, link, resource_type, resource_id)
  VALUES (
    NEW.assigned_to,
    'appointment_new',
    'Neuer Termin: ' || COALESCE(NEW.title, 'Termin'),
    COALESCE(v_when, 'unbekannt') ||
      CASE WHEN v_job_number IS NOT NULL THEN ' · INT-' || v_job_number ELSE '' END ||
      CASE WHEN v_creator_name IS NOT NULL THEN ' · von ' || v_creator_name ELSE '' END,
    '/auftraege/' || NEW.job_id,
    'appointment',
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS job_appointments_notify ON public.job_appointments;
CREATE TRIGGER job_appointments_notify
  AFTER INSERT ON public.job_appointments
  FOR EACH ROW EXECUTE FUNCTION public.notify_appointment_new();

-- =====================================================================
-- 3. Todo-Zuweisung
-- =====================================================================
CREATE OR REPLACE FUNCTION public.notify_todo_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_creator_name text;
BEGIN
  -- Skip wenn assigned_to leer oder der User sich selbst zuweist.
  IF NEW.assigned_to IS NULL OR NEW.assigned_to = auth.uid() THEN
    RETURN NEW;
  END IF;

  -- Bei UPDATE: nur feuern wenn assigned_to sich tatsaechlich aendert
  -- (sonst wuerde jeder Status-Wechsel noch eine Notification senden).
  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_creator_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.notifications (user_id, type, title, message, link, resource_type, resource_id)
  VALUES (
    NEW.assigned_to,
    'todo_assigned',
    CASE WHEN NEW.priority = 'dringend'
         THEN '🚨 Dringendes Todo: ' || COALESCE(NEW.title, '')
         ELSE 'Neues Todo: ' || COALESCE(NEW.title, '')
    END,
    COALESCE(v_creator_name, 'Admin') ||
      CASE WHEN NEW.due_date IS NOT NULL
           THEN ' · Fällig: ' || to_char(NEW.due_date, 'DD.MM.YYYY')
           ELSE ''
      END,
    '/todos',
    'todo',
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS todos_notify_assigned ON public.todos;
CREATE TRIGGER todos_notify_assigned
  AFTER INSERT OR UPDATE OF assigned_to ON public.todos
  FOR EACH ROW EXECUTE FUNCTION public.notify_todo_assigned();
