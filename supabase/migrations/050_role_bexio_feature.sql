-- bexio:use als Feature-Permission ergaenzen.
-- Bexio-Buttons (Kunden+Auftrag-Detail) checken jetzt die bexio:use-Permission.
-- Admin bekommt sie per Default; techniker gibt's per Default kein bexio.
update public.roles
  set permissions = permissions || '["bexio:use"]'::jsonb
  where slug = 'admin' and not (permissions ? 'bexio:use');
