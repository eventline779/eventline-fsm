# Supabase Migrations — Konventionen

Nummerierte SQL-Migrations. Neu = grösste vorhandene Nummer +1. Supabase
CLI führt sie in aufsteigender Reihenfolge aus.

## Idempotenz (Pflicht)

Jede Migration muss re-runnable sein — CI wendet sie auf frische DBs an,
Dev-Setups replayen sie regelmässig, und im Prod-Restore-Fall werden alle
noch mal durchlaufen. Konkret:

- `create table if not exists`
- `create index if not exists`
- `create or replace function`
- `drop policy if exists` **vor** `create policy` (Policies haben kein `if not exists`)
- `drop trigger if exists` **vor** `create trigger`
- `alter table ... add column if not exists`

## RLS (§5 der Grundregeln)

- Admins dürfen immer alles. Kein neuer Permission-Slug darf Admin separat
  verlangen — Zugriffs-Checks laufen **immer** über `public.has_permission()`
  bzw. den `public.is_admin()`-Helper (Migration 053), niemals über
  hard-coded `role = 'admin'` in RLS-Policies/RPCs.
- Bei neuen Tabellen mit RLS: **alle vier Verben** explizit policyen
  (`select`/`insert`/`update`/`delete`). Wenn ein Verb bewusst niemand darf,
  eine `using (false)` / `with check (false)`-Policy setzen und per
  `comment on table` dokumentieren.

## Timestamps

Standard-Schema für inhaltliche Tabellen:
`created_at timestamptz not null default now()`
`updated_at timestamptz not null default now()`
plus BEFORE-UPDATE-Trigger `public.update_updated_at()` (Migration 001).

Ausnahme: Reine Append-Only-Audit-Log-Tabellen mit fach-spezifischem
Zeitstempel (`occurred_at`, `sent_at`) — dann diesen als Timestamp führen
und im Tabellen-Kommentar begründen.

## Nummern-Lücken

Aktuelle Lücken sind alle **Budget-Feature-Rückbauten** (Commit `e1c4f15`,
Juni 2026). Nummern nicht wiederverwenden, damit Migrations-History über
Repos vergleichbar bleibt:

- 109 — `budget.sql`
- 111 — `budget_v2_structures.sql`
- 112 — `budget_auto_source.sql`
- 113 — `budget_lohn_to_personal.sql`
- 116 — `budget_categories_from_bexio.sql`
- 118 — `budget_income_lines.sql`
- 119 — `budget_bexio_sync.sql`
- 120 — `budget_access_log.sql`
