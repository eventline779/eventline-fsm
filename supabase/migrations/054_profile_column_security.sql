-- VERSUCH: Profile-Privacy via Column-Level Grants. ZURÜCKGEROLLT — funktioniert
-- in Postgres nicht mit den Code-Patterns die diese App nutzt.
--
-- Hintergrund: ich wollte email + phone vor normalen authenticated Usern
-- verbergen indem ich die Tabellen-SELECT entzog und nur Spalten-Grants auf
-- die nicht-sensitiven Columns gab. Postgres-Verhalten:
--
--   * SELECT col1, col2 FROM profiles  → funktioniert wenn col1+col2 granted
--   * SELECT * FROM profiles            → ERROR: permission denied for table
--
-- Die App nutzt an mehreren Stellen .from("profiles").select("*") — das
-- bricht damit komplett. Restauration: GRANT SELECT zurueck auf table-level.
--
-- Falls Privacy in Zukunft wirklich gebraucht wird:
--   Variante A) Alle .select("*") auf explizite Spaltenlisten umstellen
--               + column-level Grants wieder entziehen.
--   Variante B) public_profiles-VIEW (id, full_name, role, is_active,
--               avatar_url) anlegen und ueberall verwenden, profiles selbst
--               admin-only halten.
-- Beides groessere Refactor-Pakete. Aktuell bewusst nicht prioritaer.
--
-- Diese Migration ist daher ein No-Op + Doku, plus die nuetzlichen Helper
-- (get_all_profiles_admin) die wir trotzdem behalten — sie schaden nicht
-- und sind die Bausteine fuer Variante B falls Bedarf entsteht.

-- Sicherstellen dass table-level SELECT wieder da ist (auch falls die
-- "kaputte" Variante schon gelaufen ist).
grant select on public.profiles to authenticated;
grant select on public.profiles to anon;

-- Admin-Funktion bleibt: liefert Vollzugriff inkl. email/phone NUR an Admins.
-- Aktuell von team-tab.tsx genutzt.
create or replace function public.get_all_profiles_admin()
returns setof public.profiles
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden: nicht autorisiert';
  end if;
  return query select * from public.profiles order by full_name;
end;
$$;
grant execute on function public.get_all_profiles_admin() to authenticated;
