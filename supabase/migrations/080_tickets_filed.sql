-- Beleg-Ablage — Filing-Felder auf tickets.
--
-- Analog zu jobs.invoiced_* (Migration 079) braucht's fuer Belege eine
-- "abgelegt"-Markierung. Buchhaltung sieht in /abrechnung die offenen
-- Belege, klickt "Beleg abgelegt", gibt eine Ablage-Referenz ein
-- (z.B. Bexio-Beleg-Nr) und der Eintrag wandert ins "abgelegt"-Archiv.
--
-- Felder:
--   - filed_at: timestamp wann abgelegt (NULL = noch offen)
--   - filed_reference: optionale Referenz (Bexio-Doc-Nr, Ordner-Ref, etc.)
--   - filed_by: wer's markiert hat (Audit, FK auf profiles ON DELETE SET NULL)
--
-- /abrechnung-Seite filtert: type='beleg' AND filed_at IS NULL AND
-- status != 'abgelehnt'. /tickets zeigt filed_at IS NOT NULL als
-- "Abgelegt"-Tag.

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS filed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS filed_reference text NULL,
  ADD COLUMN IF NOT EXISTS filed_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Composite-Index fuer die /abrechnung-Belege-Query: type='beleg' +
-- filed_at IS NULL + status-filter. Partial-Index — schmal weil nur die
-- offenen unfiled Belege drin sind.
CREATE INDEX IF NOT EXISTS tickets_unfiled_belege_idx
  ON public.tickets (type, status, created_at DESC)
  WHERE filed_at IS NULL AND type = 'beleg';

-- Index fuer die /tickets-Abgelegt-Tag-Anzeige
CREATE INDEX IF NOT EXISTS tickets_filed_at_idx
  ON public.tickets (filed_at)
  WHERE filed_at IS NOT NULL;
