-- Migration 220: Developer Mode / View-As Feature
--
-- Erlaubt Admins in ihren eigenen Einstellungen den 'Developer Mode' zu
-- aktivieren. Ist er aktiv, erscheint ein schwebendes Overlay in der App
-- mit dem sie die Ansicht anderer Mitarbeiter simulieren koennen — OHNE
-- dass tatsaechliche Aenderungen in der DB passieren (Writes werden
-- serverseitig geblockt solange die Impersonation aktiv ist).
--
-- Zwei Aspekte:
--   1) Feature-Flag pro Admin (developer_mode_enabled).
--   2) Impersonations-State (aktuell aktiver 'als Wer'-User) — leben im
--      HTTP-Cookie, nicht in der DB. Kein persistenter Zustand noetig,
--      da der Admin per Klick den Ziel-User waehlt.
--
-- Sicherheit: nur User mit role='admin' UND developer_mode_enabled=true
-- werden serverseitig als impersonierend akzeptiert. RequireUser()/
-- Middleware validieren das bei jedem Request.

alter table public.profiles
  add column if not exists developer_mode_enabled boolean not null default false;

comment on column public.profiles.developer_mode_enabled is
  'Nur Admins koennen dieses Flag setzen (UI in /mein-konto). Ist es true, erscheint das View-As-Overlay und der User kann die Ansicht anderer Mitarbeiter simulieren. Writes werden waehrend aktiver Impersonation geblockt.';
