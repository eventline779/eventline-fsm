-- Permission-Change-Audit-Log.
--
-- Bisher gab es keine Spur wer wann was an Rollen oder
-- User-Rollen-Zuweisungen geaendert hat. Bei 100+ Mitarbeitenden
-- compliance-relevant — und einfach falls jemand sich fragt 'wann
-- hat XYZ Admin-Rechte bekommen?'.
--
-- Tabelle wird ueber API-Routes (admin/roles + admin/users) befuellt.
-- Reads: admin-only (sensible Info).

-- Append-Only-Audit-Log — `occurred_at` ist die einzige Zeitspalte
-- (dient als created_at). Kein updated_at, weil Zeilen nach dem Insert
-- niemals veraendert werden (keine UPDATE-Policy). Konvention aus README.
create table if not exists public.permission_audit_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  -- Wer hat geaendert
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_label text,                -- denormalisiert (full_name) damit Log
                                   -- nach User-Loeschung lesbar bleibt
  -- Welche Art von Aenderung
  action text not null check (action in (
    'role.created', 'role.updated', 'role.deleted',
    'user.role_changed', 'user.permissions_changed'
  )),
  -- Worauf (eines der beiden je nach action)
  target_role_slug text,
  target_profile_id uuid references public.profiles(id) on delete set null,
  target_profile_label text,       -- ebenso denormalisiert
  -- Detail-Payload (vorher/nachher), generisch
  details jsonb not null default '{}'::jsonb
);

create index if not exists permission_audit_log_occurred_idx
  on public.permission_audit_log (occurred_at desc);

create index if not exists permission_audit_log_actor_idx
  on public.permission_audit_log (actor_profile_id);

create index if not exists permission_audit_log_target_role_idx
  on public.permission_audit_log (target_role_slug);

alter table public.permission_audit_log enable row level security;

-- Nur Admins lesen den Audit-Log. Inserts laufen via API/Service-Role
-- (kein Client schreibt direkt), daher keine authenticated-Insert-Policy
-- noetig. Der 4-Verben-Regel folgen wir mit explizit-verbotenen Policies
-- fuer INSERT/UPDATE/DELETE, damit die Absicht sichtbar ist.
drop policy if exists "permission_audit_select_admin" on public.permission_audit_log;
create policy "permission_audit_select_admin"
  on public.permission_audit_log
  for select to authenticated
  using (is_admin());

drop policy if exists "permission_audit_insert_none" on public.permission_audit_log;
create policy "permission_audit_insert_none"
  on public.permission_audit_log
  for insert to authenticated
  with check (false);

drop policy if exists "permission_audit_update_none" on public.permission_audit_log;
create policy "permission_audit_update_none"
  on public.permission_audit_log
  for update to authenticated
  using (false)
  with check (false);

drop policy if exists "permission_audit_delete_none" on public.permission_audit_log;
create policy "permission_audit_delete_none"
  on public.permission_audit_log
  for delete to authenticated
  using (false);

comment on table public.permission_audit_log is
  'Append-Only-Audit-Log. Zeitspalte ist occurred_at (kein created_at/updated_at). Schreiben ausschliesslich via Service-Role — INSERT/UPDATE/DELETE fuer authenticated bewusst verboten.';
