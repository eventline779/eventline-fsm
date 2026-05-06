-- Tickets-System (von Grund auf neu).
--
-- Vier Typen: it, beleg, stempel_aenderung, material. Eine zentrale
-- Tabelle mit type-ENUM und data-jsonb fuer typ-spezifische Felder.
-- Workflow: offen → erledigt | abgelehnt (keine Zwischenstufe).
--
-- Anhaenge in separater Tabelle (sauberer beim DELETE-Cleanup,
-- mehrere Files pro Ticket moeglich). Files leben im storage-Bucket
-- "documents" unter prefix "tickets/{ticket_id}/{filename}".
--
-- Spezial-Workflow Stempel-Aenderung: RPC apply_ticket() updatet
-- bei type='stempel_aenderung' + new_status='erledigt' atomisch
-- den entsprechenden time_entries-Row (oder legt einen neuen an).
--
-- RLS: Mitarbeiter sehen + erstellen eigene; Admin (oder Permission
-- 'tickets:manage') sieht alle und kann assignen + entscheiden.

-- 1. Alte tickets-Tabelle weg (Migration 012 hatte ein zu schwaches Schema).
DROP TABLE IF EXISTS public.tickets CASCADE;

-- 2. ENUMs.
DO $$ BEGIN
  CREATE TYPE public.ticket_type AS ENUM ('it', 'beleg', 'stempel_aenderung', 'material');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ticket_status AS ENUM ('offen', 'erledigt', 'abgelehnt');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Tickets-Tabelle.
CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.ticket_type NOT NULL,
  status public.ticket_status NOT NULL DEFAULT 'offen',
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('niedrig', 'normal', 'hoch', 'dringend')),
  title text NOT NULL,
  description text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution_note text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX tickets_created_by_idx ON public.tickets(created_by);
CREATE INDEX tickets_assigned_to_idx ON public.tickets(assigned_to);
CREATE INDEX tickets_status_idx ON public.tickets(status);
CREATE INDEX tickets_type_idx ON public.tickets(type);
CREATE INDEX tickets_created_at_idx ON public.tickets(created_at DESC);

-- Auto-update updated_at on UPDATE.
CREATE TRIGGER tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 4. Attachments-Tabelle.
CREATE TABLE public.ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  filename text NOT NULL,
  mime_type text,
  size_bytes int,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ticket_attachments_ticket_id_idx ON public.ticket_attachments(ticket_id);

-- 5. RLS aktivieren.
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;

-- 6. RLS-Policies tickets.
-- SELECT: eigene Tickets ODER admin/manage-permission.
CREATE POLICY "tickets_select_own_or_admin" ON public.tickets
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR public.is_admin()
    OR public.has_permission('tickets:manage')
  );

-- INSERT: jeder authentifizierte User kann Tickets erstellen, created_by muss er selbst sein.
CREATE POLICY "tickets_insert_self" ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- UPDATE: Admin/manager kann immer; Ersteller nur waehrend status='offen'.
CREATE POLICY "tickets_update_admin" ON public.tickets
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.has_permission('tickets:manage'));

CREATE POLICY "tickets_update_own_open" ON public.tickets
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND status = 'offen')
  WITH CHECK (created_by = auth.uid() AND status = 'offen');

-- DELETE: nur Admin (Mitarbeiter koennen nicht loeschen sondern nur abgelehnt-status).
CREATE POLICY "tickets_delete_admin" ON public.tickets
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- 7. RLS-Policies ticket_attachments — folgen dem Parent-Ticket.
CREATE POLICY "ticket_attachments_select" ON public.ticket_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
        AND (
          t.created_by = auth.uid()
          OR t.assigned_to = auth.uid()
          OR public.is_admin()
          OR public.has_permission('tickets:manage')
        )
    )
  );

CREATE POLICY "ticket_attachments_insert" ON public.ticket_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
        AND (t.created_by = auth.uid() OR public.is_admin() OR public.has_permission('tickets:manage'))
    )
  );

CREATE POLICY "ticket_attachments_delete" ON public.ticket_attachments
  FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR public.is_admin()
    OR public.has_permission('tickets:manage')
  );

-- 8. RPC: apply_ticket — Status-Wechsel ausfuehren, plus Spezial-Logik
-- bei stempel_aenderung (time_entries-Update). Atomisch in einer TX.
--
-- Nur fuer Admin oder Permission 'tickets:manage'.
CREATE OR REPLACE FUNCTION public.apply_ticket(
  p_ticket_id uuid,
  p_new_status public.ticket_status,
  p_resolution_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  t public.tickets%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_data jsonb;
BEGIN
  -- Permission-Check: nur Admin/Manager.
  IF NOT (public.is_admin() OR public.has_permission('tickets:manage')) THEN
    RAISE EXCEPTION 'forbidden: nur fuer tickets:manage';
  END IF;

  -- Ticket laden + locken.
  SELECT * INTO t FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket not found';
  END IF;

  IF p_new_status NOT IN ('erledigt', 'abgelehnt') THEN
    RAISE EXCEPTION 'invalid target status: %', p_new_status;
  END IF;

  -- Spezial-Logik: bei stempel_aenderung + erledigt → time_entries updaten.
  IF t.type = 'stempel_aenderung' AND p_new_status = 'erledigt' THEN
    v_data := t.data;

    IF v_data ? 'time_entry_id' AND COALESCE(v_data->>'time_entry_id', '') <> '' THEN
      -- Korrektur eines existierenden Eintrags.
      UPDATE public.time_entries
      SET clock_in = COALESCE((v_data->>'neu_start')::timestamptz, clock_in),
          clock_out = COALESCE((v_data->>'neu_end')::timestamptz, clock_out),
          notes = CONCAT_WS(E'\n', notes, '[Korrektur via Ticket #' || p_ticket_id || ']')
      WHERE id = (v_data->>'time_entry_id')::uuid;
    ELSE
      -- Neuer Eintrag (Mitarbeiter hat vergessen einzustempeln).
      INSERT INTO public.time_entries (user_id, job_id, clock_in, clock_out, description, notes)
      VALUES (
        t.created_by,
        NULLIF(v_data->>'job_id', '')::uuid,
        (v_data->>'neu_start')::timestamptz,
        (v_data->>'neu_end')::timestamptz,
        v_data->>'beschreibung',
        '[Nachtraeglich erfasst via Ticket #' || p_ticket_id || ']'
      );
    END IF;
  END IF;

  -- Status-Update.
  UPDATE public.tickets
  SET status = p_new_status,
      resolved_at = now(),
      resolved_by = v_user_id,
      resolution_note = p_resolution_note
  WHERE id = p_ticket_id;
END;
$$;

-- 9. Permission-Slug "tickets:manage" + "tickets:view_all" registrieren
-- in der modules-Tabelle (falls vorhanden — sonst ueberspringen).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='modules') THEN
    INSERT INTO public.modules (slug, label, paths, actions)
    VALUES ('tickets', 'Tickets', ARRAY['/tickets'], ARRAY['view', 'create', 'manage'])
    ON CONFLICT (slug) DO UPDATE
      SET label = EXCLUDED.label,
          paths = EXCLUDED.paths,
          actions = EXCLUDED.actions;
  END IF;
END $$;
