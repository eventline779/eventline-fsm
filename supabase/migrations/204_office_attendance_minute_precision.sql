-- Bueroanwesenheit: Minuten-Praezision statt nur volle Stunden.
--
-- Vorher: office_attendance hatte nur start_hour / end_hour (smallint 0..24).
-- Die Widget-Version aus conceptline-fsm nutzt aber time-Werte (from_time /
-- to_time) und laesst den User exakte Zeiten via <input type="time"> setzen.
--
-- Diese Migration ist idempotent und additive: neue Spalten from_time /
-- to_time werden hinzugefuegt und aus bestehenden start_hour/end_hour
-- gebackfilled. Die alten Hour-Spalten bleiben vorlaeufig fuer Read-Kompat
-- (Legacy-Code) — koennen spaeter ohne Zusatz-Migration gedroppt werden.
--
-- WHY additive: existierende Rows sollen weder verloren gehen noch UI-seitig
-- als "keine Zeit gesetzt" auftauchen — der Backfill mapt eine 9-17 Row
-- (start_hour=9, end_hour=17) auf from_time=09:00, to_time=17:00.

-- 1) Spalten anhaengen (nullable, damit alte Rows nicht crashen).
alter table public.office_attendance
  add column if not exists from_time time,
  add column if not exists to_time   time;

-- 2) Backfill aus start_hour / end_hour, nur wo from/to noch NULL.
--    end_hour=24 (Mitternacht) → 23:59:00 als sichtbarer Endwert (time-Typ
--    erlaubt zwar 24:00:00, aber viele Clients zeigen es als 00:00 → Bug-Falle).
update public.office_attendance
   set from_time = make_time(start_hour, 0, 0)
 where start_hour is not null
   and from_time is null;

update public.office_attendance
   set to_time = case
     when end_hour = 24 then '23:59:00'::time
     else make_time(end_hour, 0, 0)
   end
 where end_hour is not null
   and to_time is null;

-- 3) Konsistenz-Check: from < to (nur wenn beide gesetzt sind — sonst waere
--    der Constraint fuer Legacy-Rows verletzt gewesen). Idempotent per drop.
alter table public.office_attendance
  drop constraint if exists office_attendance_time_order;

alter table public.office_attendance
  add constraint office_attendance_time_order check (
    from_time is null
    or to_time is null
    or to_time > from_time
  );

-- 4) RLS-Policies koennen bleiben wie sie sind — from_time/to_time werden
--    ueber dieselben INSERT/UPDATE/DELETE-Pfade gepflegt wie start_hour/end_hour
--    (die Policies checken keine spezifischen Spalten).
