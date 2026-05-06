-- vertrieb_contacts — fehlende Tabelle die im Code seit langem referenziert
-- wird (src/app/(app)/vertrieb/page.tsx, src/types/index.ts) aber nie als
-- Migration angelegt wurde. Auf Dev-DB existierte sie schlicht nicht — also
-- saubere Erstellung mit RLS-Policies aus dem has_permission()-Modell.
--
-- Schema folgt VertriebContact-Interface in src/types/index.ts.

-- Sequence muss VOR der Tabelle stehen weil die Spalte sie via nextval() liest.
CREATE SEQUENCE IF NOT EXISTS public.vertrieb_contacts_nr_seq START 1001;

CREATE TABLE IF NOT EXISTS public.vertrieb_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Auto-incrementing Lead-Nummer fuer den UI-Identifier (NR-1001 etc.)
  nr          integer NOT NULL DEFAULT nextval('public.vertrieb_contacts_nr_seq'::regclass),

  -- Pflicht: Firma. Rest sind optional und kommen oft erst mit Recherche.
  firma       text NOT NULL,
  branche     text,
  ansprechperson text,
  position    text,
  email       text,
  telefon     text,
  event_typ   text,

  -- Status-Pipeline: offen → kontaktiert → gespraech → gewonnen | abgesagt
  status      text NOT NULL DEFAULT 'offen'
              CHECK (status IN ('offen', 'kontaktiert', 'gespraech', 'gewonnen', 'abgesagt')),
  datum_kontakt date,

  -- JSON-Notizen mit beliebiger Struktur (Bedarfs-Felder, Offerten etc.)
  notizen     text,

  -- Priorisierung + Kategorisierung — beide Pflicht damit Filter funktionieren.
  prioritaet  text NOT NULL DEFAULT 'mittel'
              CHECK (prioritaet IN ('top', 'gut', 'mittel')),
  kategorie   text NOT NULL DEFAULT 'veranstaltung'
              CHECK (kategorie IN ('verwaltung', 'veranstaltung')),

  -- Step im Anfrage-Wizard fuer Bedarfs-Erfassung (1..5).
  step        integer NOT NULL DEFAULT 1,

  -- Bei Status='abgesagt' optional warum.
  verloren_grund text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Tabellen-Trigger fuer updated_at — gleicher Helper wie ueberall.
CREATE TRIGGER vertrieb_contacts_updated_at
  BEFORE UPDATE ON public.vertrieb_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =====================================================================
-- RLS — gegated ueber has_permission(), gleiches Pattern wie kunden/jobs.
-- =====================================================================
ALTER TABLE public.vertrieb_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vertrieb-Contacts sehen"
  ON public.vertrieb_contacts FOR SELECT TO authenticated
  USING (public.has_permission('vertrieb:view'));

CREATE POLICY "Vertrieb-Contacts anlegen"
  ON public.vertrieb_contacts FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('vertrieb:create'));

CREATE POLICY "Vertrieb-Contacts bearbeiten"
  ON public.vertrieb_contacts FOR UPDATE TO authenticated
  USING (public.has_permission('vertrieb:edit'))
  WITH CHECK (public.has_permission('vertrieb:edit'));

CREATE POLICY "Vertrieb-Contacts loeschen"
  ON public.vertrieb_contacts FOR DELETE TO authenticated
  USING (public.has_permission('vertrieb:delete'));

-- Indexes fuer haeufige Filter
CREATE INDEX IF NOT EXISTS vertrieb_contacts_status_idx ON public.vertrieb_contacts(status);
CREATE INDEX IF NOT EXISTS vertrieb_contacts_kategorie_idx ON public.vertrieb_contacts(kategorie);
CREATE INDEX IF NOT EXISTS vertrieb_contacts_prioritaet_idx ON public.vertrieb_contacts(prioritaet);
CREATE INDEX IF NOT EXISTS vertrieb_contacts_created_at_idx ON public.vertrieb_contacts(created_at DESC);

-- Realtime: Vertrieb-Page hat eine Subscription auf der Tabelle.
ALTER PUBLICATION supabase_realtime ADD TABLE public.vertrieb_contacts;
