-- Notifications-Tabelle in supabase_realtime publication aufnehmen
-- damit die Glocke in der Sidebar live aktualisiert wenn neue
-- Notifications eintreffen (RLS filtert pro User automatisch).
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
