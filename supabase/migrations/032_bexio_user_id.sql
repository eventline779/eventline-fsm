-- Bexio braucht beim Kontakt-Anlegen user_id + owner_id (beides Pflicht).
-- Holen wir per /3.0/users/me beim OAuth-Callback und cachen hier in der
-- bexio_connection-Singleton-Reihe. Bei Bedarf nachfetcht createContact ihn.

ALTER TABLE public.bexio_connection
  ADD COLUMN IF NOT EXISTS bexio_user_id integer;

COMMENT ON COLUMN public.bexio_connection.bexio_user_id IS 'Numerische Bexio-User-ID des verbundenen Accounts. Wird als user_id + owner_id beim Kontakt-Anlegen gesendet.';
