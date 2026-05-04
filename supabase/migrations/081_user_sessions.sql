-- Aktivitaets-Tracking — Sessions pro User.
--
-- Ein Eintrag = ein "Besuch" der App. Heartbeat (vom Client alle 5 min)
-- aktualisiert last_seen_at solange der User aktiv ist. Wenn keine Heart-
-- beats fuer >10 min eingetroffen sind, gilt die Session als beendet —
-- der naechste Heartbeat startet eine neue Session.
--
-- Explizites Logout (Button-Click oder Inaktivitaets-Logout) setzt
-- ended_at + end_reason ('logout' / 'inactive') sofort.
--
-- Verwendung:
--   - Admin sieht in Einstellungen → Aktivitaet wer wann in der App war
--   - Inaktivitaets-Logout fuer Non-Admin-User nach 30 min Idle

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NULL,
  end_reason text NULL CHECK (
    end_reason IS NULL OR end_reason IN ('logout', 'inactive', 'expired')
  ),
  user_agent text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Aktive Session pro User schnell finden (heartbeat-lookup).
CREATE INDEX IF NOT EXISTS user_sessions_active_idx
  ON public.user_sessions (user_id)
  WHERE ended_at IS NULL;

-- Pro User chronologisch — fuer Admin-View.
CREATE INDEX IF NOT EXISTS user_sessions_user_started_idx
  ON public.user_sessions (user_id, started_at DESC);

-- Cleanup-Index: alte Sessions fuer eventuelle Retention-Cleanups.
CREATE INDEX IF NOT EXISTS user_sessions_started_at_idx
  ON public.user_sessions (started_at DESC);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- User sieht + bearbeitet eigene Sessions.
DROP POLICY IF EXISTS "Eigene Sessions sehen" ON public.user_sessions;
CREATE POLICY "Eigene Sessions sehen"
  ON public.user_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Eigene Sessions anlegen" ON public.user_sessions;
CREATE POLICY "Eigene Sessions anlegen"
  ON public.user_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Eigene Sessions updaten" ON public.user_sessions;
CREATE POLICY "Eigene Sessions updaten"
  ON public.user_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins sehen alle Sessions (fuer den Aktivitaets-Log).
DROP POLICY IF EXISTS "Admins sehen alle Sessions" ON public.user_sessions;
CREATE POLICY "Admins sehen alle Sessions"
  ON public.user_sessions FOR SELECT TO authenticated
  USING (public.has_permission('admin:activity'));
