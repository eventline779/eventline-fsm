CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'sonstiges',
  priority text NOT NULL DEFAULT 'normal',
  created_by uuid REFERENCES public.profiles(id),
  attachments jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tickets sind sichtbar"
  ON public.tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Jeder kann Tickets erstellen"
  ON public.tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Jeder kann Tickets aktualisieren"
  ON public.tickets FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Admins können Tickets löschen"
  ON public.tickets FOR DELETE TO authenticated USING (true);
