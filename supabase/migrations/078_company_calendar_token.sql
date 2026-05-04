-- app_settings: Singleton-Tabelle fuer firmenweite Konfiguration.
--
-- Erste Verwendung: company_calendar_token. Vorher hatte Einstellungen →
-- Integrationen den persoenlichen Admin-Token als "Kalender der Firma"
-- abgekuerzt — strukturell falsch:
--   - wenn der Admin deaktiviert wird, bricht der Firma-Feed
--   - wenn der Admin sein Token rotiert, brechen alle abonnierten Calendar-
--     Apps (Sekretariat, Geschaeftsleitung, etc.)
--   - der Token ist direkt mit einer Person verknuepft → Leak = Komplett-
--     Sicht-Leak fuer immer (oder bis Admin manuell rotiert)
--
-- Mit dieser Tabelle:
--   - der Token gehoert der Firma, nicht einer Person
--   - jeder Admin kann ihn rotieren ohne dass persoenliche Feeds betroffen sind
--   - personliche Feeds (profiles.calendar_feed_token) sind weiterhin pro User

CREATE TABLE IF NOT EXISTS public.app_settings (
  -- Singleton: nur eine Row erlaubt. Der Check enforced das beim INSERT.
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_calendar_token uuid NOT NULL DEFAULT gen_random_uuid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Initiale Row mit auto-generiertem Token. ON CONFLICT DO NOTHING damit
-- Re-Run der Migration nicht das Token rotiert.
INSERT INTO public.app_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- updated_at automatisch pflegen
CREATE OR REPLACE FUNCTION public.app_settings_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_settings_touch ON public.app_settings;
CREATE TRIGGER app_settings_touch
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.app_settings_touch_updated_at();

-- RLS: nur Admins duerfen lesen + updaten. Mitarbeiter sehen den Token
-- nicht (sonst koennten sie die Firma-Sicht abonnieren). Server-seitige
-- Calendar-Endpoint-Aufloesung laeuft via createAdminClient(), umgeht RLS.
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins lesen app_settings" ON public.app_settings;
CREATE POLICY "Admins lesen app_settings"
  ON public.app_settings FOR SELECT TO authenticated
  USING (public.has_permission('admin:settings'));

DROP POLICY IF EXISTS "Admins updaten app_settings" ON public.app_settings;
CREATE POLICY "Admins updaten app_settings"
  ON public.app_settings FOR UPDATE TO authenticated
  USING (public.has_permission('admin:settings'))
  WITH CHECK (public.has_permission('admin:settings'));

-- Kein INSERT/DELETE — die Tabelle ist Singleton, gepflegt nur ueber
-- die initiale Seed-Row. Falls jemand das je braucht, separat policy.
