-- notifications-Tabelle erweitern um:
--   - type (text) — semantische Kategorie der Notification, app-weit
--     ueber notification-meta.ts auf Icon + Akzent-Farbe gemappt.
--   - resource_type + resource_id — strukturierte Referenz auf das
--     verlinkte Objekt (z.B. resource_type='ticket', resource_id=<uuid>).
--     Erlaubt Bulk-Operations wie "loesche alle Notifications zu diesem
--     Ticket" wenn das Ticket geloescht wird.
--
-- Vorhandene Rows bekommen type='system' als Fallback. Der notify-API-
-- Endpoint setzt den richtigen Wert ab jetzt explizit.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS resource_type text,
  ADD COLUMN IF NOT EXISTS resource_id uuid;

CREATE INDEX IF NOT EXISTS notifications_type_idx ON public.notifications(type);
CREATE INDEX IF NOT EXISTS notifications_resource_idx ON public.notifications(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON public.notifications(user_id, is_read, created_at DESC);
