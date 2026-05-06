-- RLS-Audit-Findings (Item 10):
-- 1. partners hatte alle 4 CRUD fuer authenticated USING true → jeder
--    authentifizierte User konnte Partner loeschen/erstellen/aendern.
-- 2. tickets DELETE war USING true → jeder konnte Tickets loeschen.
-- Beides admin-only setzen.

-- Partners: nur Admins duerfen Partner pflegen.
drop policy if exists "Authenticated users can insert partners" on public.partners;
drop policy if exists "Authenticated users can update partners" on public.partners;
drop policy if exists "Authenticated users can delete partners" on public.partners;

create policy "Admins können Partner erstellen"
  on public.partners for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "Admins können Partner bearbeiten"
  on public.partners for update to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "Admins können Partner löschen"
  on public.partners for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');
-- SELECT bleibt auf authenticated true — alle MA duerfen Partner sehen.

-- Tickets: DELETE auf admin-only einschraenken. INSERT bleibt offen
-- (Techniker erstellen Tickets), UPDATE bleibt offen (Workflow-Aenderungen).
drop policy if exists "Admins können Tickets löschen" on public.tickets;

create policy "Admins können Tickets löschen"
  on public.tickets for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');
