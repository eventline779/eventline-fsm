-- Drei-Zustand-Modell fuer Kunden:
--   archived_at IS NULL  + is_active=true  -> Aktiv (Standard, in Liste sichtbar)
--   archived_at IS NOT NULL                -> Archiviert (versteckt, Historie bleibt)
--   Hard-Delete                            -> nur moeglich wenn keine FK-Verknuepfungen
--
-- Auto-Archiv: Kunden die mindestens einen Auftrag hatten, aber seit ueber einem
-- Jahr keinen neuen — werden via /api/customers/auto-archive ins Archiv verschoben.
-- Verwaltungs-Customers (locations.customer_id) sind ausgenommen, weil sie
-- auch ohne direkten Auftrag operativ aktiv sein koennen.
--
-- is_active bleibt bestehen — wird weiter als generischer "deaktiviert"-Flag
-- verwendet (z.B. Soft-Delete fuer Privatpersonen). Listen-Filter:
-- archived_at IS NULL AND is_active = true.

alter table public.customers
  add column archived_at timestamptz null;

comment on column public.customers.archived_at is 'Wenn gesetzt: Kunde ist im Archiv (versteckt aus Standardlisten, Historie bleibt). Auto-archiviert nach 1 Jahr ohne neuen Auftrag.';

create index if not exists customers_archived_at_idx on public.customers(archived_at) where archived_at is null;
