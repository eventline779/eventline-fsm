-- handle_new_user: ON CONFLICT DO NOTHING fuer den Sync-Fall.
--
-- Vorher: plain INSERT. Hat Probleme gemacht beim Anlegen eines auth.users
-- fuer eine schon bestehende profiles-Reihe (z.B. nach Daten-Sync zwischen
-- Projekten — profile.id existiert, aber kein auth.users-Eintrag dazu).
-- Die Funktion lief, der Trigger versuchte den profile-Insert, knallte mit
-- duplicate-key und der ganze auth.users-Create-Call rollback'te.
--
-- Mit ON CONFLICT (id) DO NOTHING ist der Trigger idempotent: erstellt nur
-- wenn noch nicht vorhanden, sonst still. Aenderung am Profile-Inhalt fuer
-- bestehende Reihen nicht — die hatten schon ihre Daten.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'techniker')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$func$;
