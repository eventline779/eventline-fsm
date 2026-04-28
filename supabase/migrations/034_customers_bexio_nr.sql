-- Bexio-Kundennummer (menschenlesbare 'nr' aus Bexio's Contact-API).
-- Bisher haben wir nur die interne bexio_contact_id gespeichert; die nr ist
-- aber das was Mitarbeiter und Kunden auf Rechnungen sehen, deshalb soll sie
-- im FSM ebenfalls sichtbar sein und mit Bexio uebereinstimmen.

alter table public.customers
  add column bexio_nr text;

comment on column public.customers.bexio_nr is 'Menschenlesbare Bexio-Kundennummer (z.B. "21001"). Wird bei Anlegen oder Verknuepfung mit Bexio gefuellt.';

-- Optional Index — Kundennummer ist nicht UNIQUE in der DB (ein Kunde koennte
-- theoretisch nicht synchronisiert sein, oder wir haben einen Datenstand
-- bevor Bexio aufgeraeumt wurde), aber Suche danach ist haeufig.
create index if not exists customers_bexio_nr_idx on public.customers(bexio_nr) where bexio_nr is not null;
