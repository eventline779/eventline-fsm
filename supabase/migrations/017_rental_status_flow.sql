-- Erweiterte Vermietungs-Status für den 5-Schritt-Prozess:
-- 1. neu → Konditionen hochladen
-- 2. konditionen_gesendet → Warten auf Bestätigung der Konditionen
-- 3. konditionen_bestaetigt → Angebot erstellen & senden
-- 4. angebot_gesendet → Warten auf Annahme des Angebots
-- 5. bestaetigt → Vertrag & Termine

-- Check-Constraint aktualisieren
ALTER TABLE public.rental_requests DROP CONSTRAINT IF EXISTS rental_requests_status_check;
ALTER TABLE public.rental_requests ADD CONSTRAINT rental_requests_status_check
  CHECK (status IN ('neu', 'konditionen_gesendet', 'konditionen_bestaetigt', 'angebot_gesendet', 'in_bearbeitung', 'bestaetigt', 'abgelehnt'));

-- Bestehende "in_bearbeitung" Einträge auf neuen Status migrieren
UPDATE public.rental_requests SET status = 'konditionen_gesendet' WHERE status = 'in_bearbeitung';
