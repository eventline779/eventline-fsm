-- Profile-RLS verschaerfen + public_profiles-Funktion fuer Assignee-Dropdowns.
--
-- Vorher: profiles SELECT using(true) — jeder authenticated User sah ALLES
-- inkl. Email + Telefon der Kollegen.
--
-- Jetzt:
--   - profiles SELECT: eigenes Profil ODER admin (volle Daten)
--   - get_assignable_users(): SECURITY DEFINER-Funktion liefert nur die
--     "oeffentlichen" Felder (id, full_name, role, is_active, avatar_url)
--     fuer Dropdowns. Bypasst RLS damit Auftrags-/Termin-/Todo-Zuweisung
--     weiterhin laeuft, aber Email/Telefon bleiben verborgen.
--
-- Code-Effekt: alle assignee-Dropdowns rufen jetzt supabase.rpc(
-- "get_assignable_users") statt .from("profiles").select(). Eigene Profile
-- (Layout, use-permissions, api-auth, vertrieb, dashboard) lesen weiter
-- direkt aus profiles — passt durch die "id = auth.uid()"-Bedingung.

-- === 1. is_admin()-Helper (vermeidet Rekursion in der Policy) ===
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;
grant execute on function public.is_admin() to authenticated;

-- === 2. Public-Profile-Funktion fuer Dropdowns ===
create or replace function public.get_assignable_users()
returns table (
  id uuid,
  full_name text,
  role text,
  is_active boolean,
  avatar_url text
)
language sql
security definer
set search_path = public
stable
as $$
  select id, full_name, role, is_active, avatar_url
  from public.profiles
  where is_active = true
  order by full_name;
$$;
grant execute on function public.get_assignable_users() to authenticated;

-- === 3. SELECT-Policy verschaerfen ===
drop policy if exists "p1" on public.profiles;
drop policy if exists "Profile lesen" on public.profiles;
drop policy if exists "Profile sind sichtbar" on public.profiles;
drop policy if exists "Profile: eigenes oder admin" on public.profiles;

create policy "Profile: eigenes oder admin"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
