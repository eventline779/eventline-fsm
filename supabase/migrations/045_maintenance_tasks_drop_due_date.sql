-- due_date war ein Faelligkeitsdatum-Konzept das in der UI nie genutzt wurde —
-- die Karte zeigt seit dem Refactor den Erstellungs-Timestamp (created_at),
-- damit der User sieht "seit wann ist dieses Problem offen". due_date war
-- also redundant und wird komplett entfernt.
alter table public.maintenance_tasks
  drop column if exists due_date;
