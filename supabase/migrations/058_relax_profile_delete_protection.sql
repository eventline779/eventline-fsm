-- prevent_profile_delete-Trigger lockern.
--
-- Vorher: Trigger blockierte JEDES Hard-Delete eines Profils — auch
-- deaktivierte und verwaiste Profile. Im Effekt war "DELETE FROM profiles"
-- ein Soft-Delete (Trigger setzte is_active=false und gab NULL zurueck),
-- was 1) den Self-Healing-Pfad im /api/admin/users/[id]/reset-password
-- (orphan-Repair: Profil loeschen, Auth-User neu anlegen) blockiert hat
-- und 2) den DELETE /api/admin/users/[id]-Endpoint (Hard-Delete deaktivierter
-- User) wirkungslos gemacht hat.
--
-- Jetzt: Trigger blockiert nur noch echte Gefahr — den letzten AKTIVEN
-- Account davor versehentlich hart zu loeschen. Deaktivierte Profile
-- duerfen weg, Cascade-Deletes via auth.users-Loeschung laufen sauber durch.
CREATE OR REPLACE FUNCTION public.prevent_profile_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_active = true AND
     (SELECT count(*) FROM public.profiles WHERE is_active = true) <= 1 THEN
    RAISE EXCEPTION 'Cannot delete the last active profile';
  END IF;
  RETURN OLD;
END;
$$;
