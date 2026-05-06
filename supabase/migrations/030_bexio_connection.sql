-- Bexio-Integration: gemeinsamer OAuth-Account fuer die ganze Firma.
-- Singleton-Tabelle: id ist immer 1, RLS erlaubt nur Service-Role-Zugriff (Tokens
-- sind sensibel, nichts hier soll direkt aus dem Client lesbar sein).
--
-- Der refresh_token erlaubt das Erneuern des access_tokens ohne erneutes Login.
-- Wird auch nur serverseitig verwendet.

CREATE TABLE IF NOT EXISTS public.bexio_connection (
  id              integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token    text NOT NULL,
  refresh_token   text NOT NULL,
  expires_at      timestamptz NOT NULL,
  scope           text,
  bexio_company_id text,
  bexio_user_email text,
  connected_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  connected_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS aktivieren — kein Client-Zugriff. Nur die Service-Role (server-side, OAuth-Routes)
-- darf lesen/schreiben. Frontends checken den Verbindungsstatus ueber eine eigene
-- API-Route, nicht ueber direktes Supabase-Select.
ALTER TABLE public.bexio_connection ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.bexio_connection IS 'Singleton-Zeile mit dem Refresh-Token des gemeinsamen Bexio-OAuth-Accounts. Nur ueber Service-Role lesbar.';
COMMENT ON COLUMN public.bexio_connection.id IS 'Immer 1 (Singleton).';
COMMENT ON COLUMN public.bexio_connection.expires_at IS 'Wann der access_token ablaeuft. Bei < 60s vor Ablauf via refresh_token erneuern.';
