-- Rollen-System fuer dynamische User-Rollen + Berechtigungen.
--
-- Vorher: Profile.role war hardcoded auf 'admin' oder 'techniker'.
-- Jetzt: roles-Tabelle erlaubt eigene Rollen ('Vertrieb', 'Buchhaltung' etc.)
-- mit pro-Rolle konfigurierbaren Modul-Sichtbarkeiten.
--
-- 'admin' bleibt eine Spezial-Rolle (is_system=true, alle Berechtigungen,
-- in der UI nicht editierbar) — sonst koennte sich der einzige Admin
-- selbst aussperren. Alle anderen Rollen (inkl. techniker) sind editier-
-- und loeschbar.
--
-- profile.role bleibt ein text-Feld ohne FK — damit Migration einfach
-- bleibt; Validierung passiert in der Anwendungs-Logik.

create table if not exists public.roles (
  slug text primary key,
  label text not null,
  -- Liste der erlaubten Top-Level-Module (z.B. ["kalender","auftraege","kunden"]).
  -- Dashboard ist immer erlaubt, nicht in dieser Liste.
  permissions jsonb not null default '[]'::jsonb,
  is_system boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger roles_updated_at
  before update on public.roles
  for each row execute function public.update_updated_at();

alter table public.roles enable row level security;

-- Lesen: alle authenticated User (Sidebar muss die Rolle ihres Users laden).
create policy "Rollen sind sichtbar"
  on public.roles for select to authenticated using (true);

-- Schreiben: nur Admins (Insert/Update/Delete via API mit requireAdmin).
-- Direkter DB-Zugriff via anon-Key ist damit blockiert.
create policy "Admins koennen Rollen erstellen"
  on public.roles for insert to authenticated
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "Admins koennen Rollen bearbeiten"
  on public.roles for update to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "Admins koennen Rollen loeschen"
  on public.roles for delete to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- Seed: zwei System-Rollen.
-- admin: alle Module, is_system=true (wird in UI nicht editier-/loeschbar
--   angezeigt; API blockt zusaetzlich Aenderungen daran).
-- techniker: Standard-Subset ohne Einstellungen, editierbar damit Admin
--   Default-Berechtigungen anpassen kann.
insert into public.roles (slug, label, permissions, is_system) values
  ('admin', 'Admin',
   '["kalender","auftraege","vertrieb","locations","kunden","partner","hr","einstellungen"]'::jsonb,
   true),
  ('techniker', 'Techniker',
   '["kalender","auftraege","locations","kunden","partner","hr"]'::jsonb,
   true)
on conflict (slug) do nothing;
