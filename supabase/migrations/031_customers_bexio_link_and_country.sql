-- #8/#9 Bexio-Integration:
--
-- bexio_contact_id: Verknuepfung zu einem existierenden Bexio-Kontakt.
-- Gesetzt nach erfolgreichem Anlegen ODER nach manuellem Verknuepfen mit
-- existierendem Bexio-Kontakt (Match-Flow). UI zeigt dann "In Bexio oeffnen"
-- statt "anlegen".
--
-- Land-Feld existiert bereits als address_country (string, default 'CH').
-- Wir nutzen das vorhandene Feld weiter — die fruehere Annahme dass es nicht
-- existiert war falsch. country_id-Mapping passiert in src/lib/bexio.ts via
-- BEXIO_COUNTRY_ID auf Basis des ISO-2-Codes.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS bexio_contact_id text;

-- Falls die fehlerhafte 'country'-Spalte aus einer frueheren Migration-Variante
-- existiert, jetzt sauber wieder droppen — sonst haetten wir das Land doppelt.
ALTER TABLE public.customers
  DROP COLUMN IF EXISTS country;

CREATE INDEX IF NOT EXISTS customers_bexio_contact_id_idx
  ON public.customers(bexio_contact_id)
  WHERE bexio_contact_id IS NOT NULL;

COMMENT ON COLUMN public.customers.bexio_contact_id IS 'Bexio-Kontakt-ID (numerisch) wenn dieser Kunde mit Bexio verknuepft ist.';
