-- Realtime-Replikation fuer time_entries + customers aktivieren.
--
-- Vorher: nur `jobs` war in supabase_realtime publication, deshalb hat
-- die Stempel-Hook-Subscription keine Events bekommen — wenn man auf
-- der Auftrag-Detail-Page eingestempelt hat, hat der Sidebar-Stempel-
-- Widget davon nichts mitbekommen weil es eine separate Hook-Instanz
-- ist und auf Realtime-Updates angewiesen ist.
--
-- customers war auch nicht aktiviert — der "customers:invalidate"-Event
-- im AppLayout hat dadurch nie gefeuert. Auch das wird hier behoben.

alter publication supabase_realtime add table public.time_entries;
alter publication supabase_realtime add table public.customers;
