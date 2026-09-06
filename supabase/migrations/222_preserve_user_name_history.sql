-- Migration 222: Preserve user full_name in history when profile is deleted
--
-- Leo-Anforderung: Wenn ein User geloescht wird, sollen alle Historien-
-- Referenzen (SET NULL FKs auf profiles.id) den vollen Namen des Users
-- in einer <col>_name-Freitext-Column bewahren, damit in der UI weiter
-- sichtbar ist, wer diesen Datensatz z.B. erstellt/zugewiesen/genehmigt hat.
--
-- Idempotent: alle ADD COLUMN mit IF NOT EXISTS, Trigger + Function werden
-- vor Neuanlage gedroppt.

BEGIN;

-- 1) Freitext-Columns fuer preserved names --------------------------------

ALTER TABLE public.bexio_connection            ADD COLUMN IF NOT EXISTS connected_by_name        text;
ALTER TABLE public.calendar_events             ADD COLUMN IF NOT EXISTS created_by_name          text;
ALTER TABLE public.calendar_events             ADD COLUMN IF NOT EXISTS profile_id_name          text;
ALTER TABLE public.company_settings            ADD COLUMN IF NOT EXISTS updated_by_name          text;
ALTER TABLE public.documents                   ADD COLUMN IF NOT EXISTS uploaded_by_name         text;
ALTER TABLE public.employee_compensation       ADD COLUMN IF NOT EXISTS created_by_name          text;
ALTER TABLE public.job_appointments            ADD COLUMN IF NOT EXISTS assigned_to_name         text;
ALTER TABLE public.job_draft_notes             ADD COLUMN IF NOT EXISTS author_id_name           text;
ALTER TABLE public.job_drafts                  ADD COLUMN IF NOT EXISTS created_by_name          text;
ALTER TABLE public.job_drafts                  ADD COLUMN IF NOT EXISTS owner_id_name            text;
ALTER TABLE public.jobs                        ADD COLUMN IF NOT EXISTS accepted_by_name         text;
ALTER TABLE public.jobs                        ADD COLUMN IF NOT EXISTS cancelled_by_name        text;
ALTER TABLE public.jobs                        ADD COLUMN IF NOT EXISTS created_by_name          text;
ALTER TABLE public.jobs                        ADD COLUMN IF NOT EXISTS customer_contacted_by_name text;
ALTER TABLE public.jobs                        ADD COLUMN IF NOT EXISTS invoice_skipped_by_name  text;
ALTER TABLE public.jobs                        ADD COLUMN IF NOT EXISTS invoiced_by_name         text;
ALTER TABLE public.jobs                        ADD COLUMN IF NOT EXISTS project_lead_id_name     text;
ALTER TABLE public.jobs                        ADD COLUMN IF NOT EXISTS rejected_by_name         text;
ALTER TABLE public.jobs                        ADD COLUMN IF NOT EXISTS submitted_by_name        text;
ALTER TABLE public.maintenance_tasks           ADD COLUMN IF NOT EXISTS created_by_name          text;
ALTER TABLE public.partner_form_template       ADD COLUMN IF NOT EXISTS draft_updated_by_name    text;
ALTER TABLE public.partner_form_template       ADD COLUMN IF NOT EXISTS live_published_by_name   text;
ALTER TABLE public.payroll_defaults            ADD COLUMN IF NOT EXISTS created_by_name          text;
ALTER TABLE public.permission_audit_log        ADD COLUMN IF NOT EXISTS actor_profile_id_name    text;
ALTER TABLE public.permission_audit_log        ADD COLUMN IF NOT EXISTS target_profile_id_name   text;
ALTER TABLE public.profiles                    ADD COLUMN IF NOT EXISTS team_lead_id_name        text;
ALTER TABLE public.project_appointment_notes   ADD COLUMN IF NOT EXISTS created_by_name          text;
ALTER TABLE public.project_appointments        ADD COLUMN IF NOT EXISTS assigned_to_name         text;
ALTER TABLE public.project_audit               ADD COLUMN IF NOT EXISTS changed_by_name          text;
ALTER TABLE public.projects                    ADD COLUMN IF NOT EXISTS approved_by_name         text;
ALTER TABLE public.rental_requests             ADD COLUMN IF NOT EXISTS created_by_name          text;
ALTER TABLE public.service_reports             ADD COLUMN IF NOT EXISTS created_by_name          text;
ALTER TABLE public.ticket_attachments          ADD COLUMN IF NOT EXISTS uploaded_by_name         text;
ALTER TABLE public.tickets                     ADD COLUMN IF NOT EXISTS assigned_to_name         text;
ALTER TABLE public.tickets                     ADD COLUMN IF NOT EXISTS created_by_name          text;
ALTER TABLE public.tickets                     ADD COLUMN IF NOT EXISTS filed_by_name            text;
ALTER TABLE public.tickets                     ADD COLUMN IF NOT EXISTS resolved_by_name         text;
ALTER TABLE public.time_entries                ADD COLUMN IF NOT EXISTS user_id_name             text;
ALTER TABLE public.time_off                    ADD COLUMN IF NOT EXISTS approved_by_name         text;
ALTER TABLE public.todo_attachments            ADD COLUMN IF NOT EXISTS uploaded_by_name         text;
ALTER TABLE public.todos                       ADD COLUMN IF NOT EXISTS assigned_to_name         text;
ALTER TABLE public.todos                       ADD COLUMN IF NOT EXISTS created_by_name          text;
ALTER TABLE public.todos                       ADD COLUMN IF NOT EXISTS deleted_by_name          text;
ALTER TABLE public.vertrieb_contacts           ADD COLUMN IF NOT EXISTS assigned_to_name         text;
ALTER TABLE public.vertrieb_team_goal          ADD COLUMN IF NOT EXISTS created_by_name          text;
ALTER TABLE public.wage_documents              ADD COLUMN IF NOT EXISTS uploaded_by_name         text;

-- 2) Trigger-Function: beim DELETE eines profiles alle preserved-Name-
--    Columns mit OLD.full_name befuellen, wo derzeit der User referenziert wird.
--    SECURITY DEFINER, damit die Function ueber alle Tabellen updaten darf
--    (auch wenn der loeschende Admin per RLS nicht ueberall UPDATE haette).

DROP TRIGGER IF EXISTS preserve_user_name_history_trigger ON public.profiles;
DROP FUNCTION IF EXISTS public.preserve_user_name_history();

CREATE OR REPLACE FUNCTION public.preserve_user_name_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := COALESCE(OLD.full_name, '');
BEGIN
  IF v_name = '' THEN
    -- Nichts zu spiegeln (User hatte keinen Namen); Delete unveraendert durchlassen.
    RETURN OLD;
  END IF;

  UPDATE public.bexio_connection          SET connected_by_name          = v_name WHERE connected_by          = OLD.id;
  UPDATE public.calendar_events           SET created_by_name            = v_name WHERE created_by            = OLD.id;
  UPDATE public.calendar_events           SET profile_id_name            = v_name WHERE profile_id            = OLD.id;
  UPDATE public.company_settings          SET updated_by_name            = v_name WHERE updated_by            = OLD.id;
  UPDATE public.documents                 SET uploaded_by_name           = v_name WHERE uploaded_by           = OLD.id;
  UPDATE public.employee_compensation     SET created_by_name            = v_name WHERE created_by            = OLD.id;
  UPDATE public.job_appointments          SET assigned_to_name           = v_name WHERE assigned_to           = OLD.id;
  UPDATE public.job_draft_notes           SET author_id_name             = v_name WHERE author_id             = OLD.id;
  UPDATE public.job_drafts                SET created_by_name            = v_name WHERE created_by            = OLD.id;
  UPDATE public.job_drafts                SET owner_id_name              = v_name WHERE owner_id              = OLD.id;
  UPDATE public.jobs                      SET accepted_by_name           = v_name WHERE accepted_by           = OLD.id;
  UPDATE public.jobs                      SET cancelled_by_name          = v_name WHERE cancelled_by          = OLD.id;
  UPDATE public.jobs                      SET created_by_name            = v_name WHERE created_by            = OLD.id;
  UPDATE public.jobs                      SET customer_contacted_by_name = v_name WHERE customer_contacted_by = OLD.id;
  UPDATE public.jobs                      SET invoice_skipped_by_name    = v_name WHERE invoice_skipped_by    = OLD.id;
  UPDATE public.jobs                      SET invoiced_by_name           = v_name WHERE invoiced_by           = OLD.id;
  UPDATE public.jobs                      SET project_lead_id_name       = v_name WHERE project_lead_id       = OLD.id;
  UPDATE public.jobs                      SET rejected_by_name           = v_name WHERE rejected_by           = OLD.id;
  UPDATE public.jobs                      SET submitted_by_name          = v_name WHERE submitted_by          = OLD.id;
  UPDATE public.maintenance_tasks         SET created_by_name            = v_name WHERE created_by            = OLD.id;
  UPDATE public.partner_form_template     SET draft_updated_by_name      = v_name WHERE draft_updated_by      = OLD.id;
  UPDATE public.partner_form_template     SET live_published_by_name     = v_name WHERE live_published_by     = OLD.id;
  UPDATE public.payroll_defaults          SET created_by_name            = v_name WHERE created_by            = OLD.id;
  UPDATE public.permission_audit_log      SET actor_profile_id_name      = v_name WHERE actor_profile_id      = OLD.id;
  UPDATE public.permission_audit_log      SET target_profile_id_name     = v_name WHERE target_profile_id     = OLD.id;
  UPDATE public.profiles                  SET team_lead_id_name          = v_name WHERE team_lead_id          = OLD.id;
  UPDATE public.project_appointment_notes SET created_by_name            = v_name WHERE created_by            = OLD.id;
  UPDATE public.project_appointments      SET assigned_to_name           = v_name WHERE assigned_to           = OLD.id;
  UPDATE public.project_audit             SET changed_by_name            = v_name WHERE changed_by            = OLD.id;
  UPDATE public.projects                  SET approved_by_name           = v_name WHERE approved_by           = OLD.id;
  UPDATE public.rental_requests           SET created_by_name            = v_name WHERE created_by            = OLD.id;
  UPDATE public.service_reports           SET created_by_name            = v_name WHERE created_by            = OLD.id;
  UPDATE public.ticket_attachments        SET uploaded_by_name           = v_name WHERE uploaded_by           = OLD.id;
  UPDATE public.tickets                   SET assigned_to_name           = v_name WHERE assigned_to           = OLD.id;
  UPDATE public.tickets                   SET created_by_name            = v_name WHERE created_by            = OLD.id;
  UPDATE public.tickets                   SET filed_by_name              = v_name WHERE filed_by              = OLD.id;
  UPDATE public.tickets                   SET resolved_by_name           = v_name WHERE resolved_by           = OLD.id;
  UPDATE public.time_entries              SET user_id_name               = v_name WHERE user_id               = OLD.id;
  UPDATE public.time_off                  SET approved_by_name           = v_name WHERE approved_by           = OLD.id;
  UPDATE public.todo_attachments          SET uploaded_by_name           = v_name WHERE uploaded_by           = OLD.id;
  UPDATE public.todos                     SET assigned_to_name           = v_name WHERE assigned_to           = OLD.id;
  UPDATE public.todos                     SET created_by_name            = v_name WHERE created_by            = OLD.id;
  UPDATE public.todos                     SET deleted_by_name            = v_name WHERE deleted_by            = OLD.id;
  UPDATE public.vertrieb_contacts         SET assigned_to_name           = v_name WHERE assigned_to           = OLD.id;
  UPDATE public.vertrieb_team_goal        SET created_by_name            = v_name WHERE created_by            = OLD.id;
  UPDATE public.wage_documents            SET uploaded_by_name           = v_name WHERE uploaded_by           = OLD.id;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.preserve_user_name_history() IS
  'BEFORE DELETE ON profiles: spiegelt OLD.full_name in alle <col>_name-Freitext-Columns, damit in Historien (jobs, tickets, todos, service_reports, vertrieb, audit, ...) sichtbar bleibt, wer den Datensatz erstellt/zugewiesen/genehmigt/hochgeladen hat, auch nachdem der User geloescht wurde. Leo-Anforderung: keine anonymen Historien-Zeilen nach User-Delete.';

CREATE TRIGGER preserve_user_name_history_trigger
BEFORE DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.preserve_user_name_history();

COMMENT ON TRIGGER preserve_user_name_history_trigger ON public.profiles IS
  'Sichert User-Namen in Historien-Tabellen bevor der Profile-Record geloescht und die FKs (SET NULL) genullt werden. Muss BEFORE DELETE sein, damit OLD.full_name noch existiert.';

-- Reviewer S2: Function ist SECURITY DEFINER — nur ueber den Trigger
-- ausfuehrbar sein lassen, nicht ad-hoc per RPC von PUBLIC.
REVOKE EXECUTE ON FUNCTION public.preserve_user_name_history() FROM PUBLIC;

COMMIT;
