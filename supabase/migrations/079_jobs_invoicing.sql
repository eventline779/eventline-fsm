-- Abrechnung — Invoicing-Felder auf jobs.
--
-- Bisher gab's keine Abbildung des "Rechnung gestellt"-Status. Mit diesen
-- drei Feldern markieren wir abgeschlossene Auftraege als abgerechnet:
--   - invoiced_at: timestamp wann die Rechnung gestellt wurde (NULL = noch offen)
--   - invoice_number: die Rechnungsnummer (z.B. "RE-2026-001"). Vom Admin
--     beim Markieren eingegeben — Single-Field, frei strukturiert. Eindeutig
--     soll sie sein, aber wir enforcen das nicht in der DB (verschiedene
--     Rechnungs-Jahre, evtl Korrektur-Rechnungen mit Suffix etc.).
--   - invoiced_by: wer es markiert hat (Audit). FK auf profiles damit beim
--     User-Loesch die Spur sauber bleibt (ON DELETE SET NULL).
--
-- /abrechnung-Seite filtert: status='abgeschlossen' AND invoiced_at IS NULL.
-- /auftraege-Archiv zeigt invoiced_at IS NOT NULL als "Abgerechnet"-Tag.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS invoiced_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS invoice_number text NULL,
  ADD COLUMN IF NOT EXISTS invoiced_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Composite-Index fuer die /abrechnung-Query: status='abgeschlossen' +
-- invoiced_at IS NULL geordnet nach end_date. Partial-Index — schmal weil
-- nur die unbezahlten Rows enthalten sind.
CREATE INDEX IF NOT EXISTS jobs_unbilled_idx
  ON public.jobs (status, end_date DESC)
  WHERE invoiced_at IS NULL AND status = 'abgeschlossen' AND is_deleted = false;

-- Index fuer die Archiv-Tag-Anzeige: schnell pruefen ob ein Job abgerechnet ist.
CREATE INDEX IF NOT EXISTS jobs_invoiced_at_idx
  ON public.jobs (invoiced_at)
  WHERE invoiced_at IS NOT NULL;
