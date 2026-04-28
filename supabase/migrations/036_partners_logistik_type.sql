-- Partner-Type "logistik" hinzufuegen — fuer Transport- und Lieferdienste
-- (z.B. CARGOWIN). Bisher wurde so was unter "sonstiges" einsortiert,
-- was dem Partner-Filter die Praezision nimmt.

alter table public.partners drop constraint if exists partners_type_check;
alter table public.partners add constraint partners_type_check
  check (type in ('catering', 'technik', 'av', 'mobiliar', 'reinigung', 'security', 'logistik', 'sonstiges'));
