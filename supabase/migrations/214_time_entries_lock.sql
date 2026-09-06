-- Migration 214: Lock von time_entries nach dem 5. des Folgemonats.
--
-- Hintergrund / Regel (Leo, Abrechnungs-Deadline):
--   Ein time_entry ist GESPERRT, sobald in Europe/Zurich der 5. des Monats
--   NACH dem clock_in-Monat erreicht ist. Ab diesem Zeitpunkt darf niemand
--   den Eintrag mehr aendern oder loeschen — auch Admins nicht (Leo-Vorgabe:
--   "sonst stimmt die Auszahlung nicht"). Wer nach Deadline nachbessern
--   muss, muss das bewusst per direktem SQL machen.
--
-- Beispiele (alles in Europe/Zurich):
--   clock_in 01.09.2026 → gesperrt ab 05.10.2026 00:00
--   clock_in 30.09.2026 → gesperrt ab 05.10.2026 00:00
--   clock_in 01.10.2026 → gesperrt ab 05.11.2026 00:00
--
-- Umsetzung:
--   1) Helper-Function public.is_time_entry_locked(timestamptz) → boolean
--   2) RLS-Policies fuer INSERT / UPDATE / DELETE um die Lock-Bedingung
--      erweitert (kein Admin-Bypass, hart gegen alle Rollen).
--   3) Zusaetzliches WITH CHECK auf UPDATE, damit ein noch nicht gesperrter
--      Eintrag nicht per clock_in-Aenderung in ein gesperrtes Fenster
--      geschoben werden kann.

-- === 1. Helper-Function ===
create or replace function public.is_time_entry_locked(p_clock_in timestamptz)
returns boolean
language sql
stable
as $$
  -- Deadline = 5. des Folgemonats um 00:00 Europe/Zurich.
  -- date_trunc('month', clock_in_zurich) → 1. des clock_in-Monats
  --   + interval '1 month' → 1. des Folgemonats
  --   + interval '4 days'  → 5. des Folgemonats
  -- Gesperrt = heute (Zurich) >= diese Deadline.
  select (now() at time zone 'Europe/Zurich')::date
    >= (
         date_trunc('month', (p_clock_in at time zone 'Europe/Zurich'))
         + interval '1 month'
         + interval '4 days'
       )::date;
$$;

comment on function public.is_time_entry_locked(timestamptz) is
  'Gibt true zurueck wenn ein time_entry mit dem gegebenen clock_in nach Abrechnungs-Deadline gesperrt ist. Deadline = 5. des Folgemonats 00:00 Europe/Zurich. Kein Admin-Bypass — Nachtraegliches Korrigieren muss bewusst per direktem SQL geschehen (Leo-Vorgabe: sonst stimmt die Auszahlung nicht).';

-- === 2. RLS-Policies neu ===
-- INSERT: Neuer Eintrag mit clock_in im Sperrfenster ist verboten.
drop policy if exists "time_entries_insert_own" on public.time_entries;
create policy "time_entries_insert_own" on public.time_entries
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_time_entry_locked(clock_in)
  );

-- UPDATE: Zeile darf weder aktuell gesperrt sein (using) noch durch die
-- Aenderung in ein gesperrtes Fenster geraten (with check).
drop policy if exists "time_entries_update" on public.time_entries;
create policy "time_entries_update" on public.time_entries
  for update
  using (
    (
      user_id = auth.uid()
      or is_admin()
      or has_permission('stempelzeiten:edit-all')
    )
    and not public.is_time_entry_locked(clock_in)
  )
  with check (
    (
      user_id = auth.uid()
      or is_admin()
      or has_permission('stempelzeiten:edit-all')
    )
    and not public.is_time_entry_locked(clock_in)
  );

-- DELETE: gesperrte Zeile darf niemand loeschen.
drop policy if exists "time_entries_delete" on public.time_entries;
create policy "time_entries_delete" on public.time_entries
  for delete
  using (
    (
      user_id = auth.uid()
      or is_admin()
      or has_permission('stempelzeiten:edit-all')
    )
    and not public.is_time_entry_locked(clock_in)
  );
