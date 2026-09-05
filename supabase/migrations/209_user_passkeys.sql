-- ============================================================
-- Passkeys (WebAuthn) — biometrische / passwortlose Anmeldung
-- ============================================================
-- Ermöglicht Login via Face-ID / Touch-ID / Fingerprint auf iOS/Android
-- und Windows-Hello / Passkey auf Desktop. Passwort-Login bleibt als
-- Fallback weiter aktiv — Passkey ist zusätzlich.
--
-- Zwei Tabellen:
--   1) user_passkeys              — die dauerhaft registrierten Credentials
--   2) user_passkey_challenges    — kurzlebige Challenges (WebAuthn-Nonces)
--
-- RLS: jeder User verwaltet nur seine eigenen Passkeys. Auth-Challenges
-- werden vom Server (service_role) über den Admin-Client verwaltet — RLS
-- an, aber ohne policies für authenticated → nur service_role kommt ran.
-- ============================================================

create table if not exists public.user_passkeys (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  credential_id  text not null unique,          -- Base64URL des credential id
  public_key     text not null,                 -- Base64URL des öffentlichen Schlüssels
  counter        bigint not null default 0,     -- Signature-Counter, replay-attack-Schutz
  device_type    text not null default 'singleDevice',   -- 'singleDevice' | 'multiDevice'
  backed_up      boolean not null default false,
  transports     text[],                        -- 'internal'|'hybrid'|'usb'|'nfc'|'ble'
  nickname       text,                          -- User-Label, z.B. "iPhone von Mischa"
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz
);

create index if not exists user_passkeys_user_idx on public.user_passkeys(user_id);
create index if not exists user_passkeys_cred_idx on public.user_passkeys(credential_id);

alter table public.user_passkeys enable row level security;

drop policy if exists passkeys_select_own on public.user_passkeys;
create policy passkeys_select_own on public.user_passkeys
  for select using (user_id = auth.uid());

drop policy if exists passkeys_insert_own on public.user_passkeys;
create policy passkeys_insert_own on public.user_passkeys
  for insert with check (user_id = auth.uid());

drop policy if exists passkeys_update_own on public.user_passkeys;
create policy passkeys_update_own on public.user_passkeys
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists passkeys_delete_own on public.user_passkeys;
create policy passkeys_delete_own on public.user_passkeys
  for delete using (user_id = auth.uid());


-- Challenges: kurzlebige, einmal verwendbare Zufallswerte, die der
-- Authenticator signieren muss. Gespeichert weil der Server beim Verify
-- die exakte Challenge kennen muss, die er ausgegeben hat.
--
-- Wir speichern challenges auch für den passwortlosen Login (user_id
-- ist dann null, weil wir den User erst nach dem Verify aus dem
-- credential_id auflösen).
create table if not exists public.user_passkey_challenges (
  id           uuid primary key default gen_random_uuid(),
  challenge    text not null,                   -- Base64URL
  user_id      uuid references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('register','auth')),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '5 minutes')
);

create index if not exists user_passkey_challenges_challenge_idx on public.user_passkey_challenges(challenge);
create index if not exists user_passkey_challenges_expires_idx on public.user_passkey_challenges(expires_at);

alter table public.user_passkey_challenges enable row level security;
-- Bewusst KEINE policies für authenticated: nur service_role (Admin-
-- Client aus den API-Routen) darf lesen/schreiben. So kann kein User
-- die Challenge eines anderen abgreifen.

-- Aufräum-Helfer: alte Challenges löschen (der Server ruft die vor jedem
-- register/auth einmal auf — kein separater Cron nötig).
create or replace function public.cleanup_expired_passkey_challenges()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.user_passkey_challenges where expires_at < now();
$$;

grant execute on function public.cleanup_expired_passkey_challenges() to service_role;
