-- Migriert bestehende rental_requests in die jobs-Tabelle als Anfrage-Phase-Jobs.
-- Idempotent ueber rental_requests.id == jobs.id (gleiche UUID wird wiederverwendet).
-- Die rental_requests-Tabelle bleibt erstmal stehen; Drop in einer spaeteren Migration
-- nach finaler Verifikation.

-- 1. Hilfsfunktion: rental_status -> jobs(status, request_step)
INSERT INTO public.jobs (
  id,
  job_number,
  title,
  description,
  status,
  priority,
  customer_id,
  location_id,
  start_date,
  end_date,
  notes,
  created_by,
  created_at,
  updated_at,
  request_step,
  event_type,
  guest_count,
  extended_services
)
SELECT
  rr.id,
  -- Eindeutige Auftragsnummer: nimm naechste ueber bestehender Max + Index
  (SELECT COALESCE(MAX(job_number), 26200) FROM public.jobs)
    + ROW_NUMBER() OVER (ORDER BY rr.created_at)
    AS job_number,
  COALESCE(NULLIF(rr.event_type, ''), 'Vermietungsanfrage') AS title,
  rr.details AS description,
  CASE rr.status
    WHEN 'neu' THEN 'anfrage'
    WHEN 'konditionen_gesendet' THEN 'anfrage'
    WHEN 'konditionen_bestaetigt' THEN 'anfrage'
    WHEN 'angebot_gesendet' THEN 'anfrage'
    WHEN 'in_bearbeitung' THEN 'anfrage'
    WHEN 'bestaetigt' THEN 'offen'
    WHEN 'abgelehnt' THEN 'storniert'
    ELSE 'anfrage'
  END AS status,
  'normal' AS priority,
  rr.customer_id,
  rr.location_id,
  rr.event_date::date AS start_date,
  rr.event_end_date::date AS end_date,
  rr.notes,
  rr.created_by,
  rr.created_at,
  rr.updated_at,
  CASE rr.status
    WHEN 'neu' THEN 1
    WHEN 'konditionen_gesendet' THEN 2
    WHEN 'in_bearbeitung' THEN 2
    WHEN 'konditionen_bestaetigt' THEN 3
    WHEN 'angebot_gesendet' THEN 4
    -- bestaetigt + abgelehnt = NULL (raus aus Anfrage-Phase)
    ELSE NULL
  END AS request_step,
  rr.event_type,
  rr.guest_count,
  NULL AS extended_services -- altes Format hatte services in notes-JSON, muss manuell migriert werden falls noetig
FROM public.rental_requests rr
WHERE NOT EXISTS (
  -- Idempotent: skip wenn schon migriert
  SELECT 1 FROM public.jobs j WHERE j.id = rr.id
);

-- 2. Orphan job_appointments (job_id IS NULL) der bestaetigten Anfragen zuordnen.
-- Diese wurden in Schritt 5 (Vertrag) erstellt aber ohne job_id.
-- Beste Heuristik: matching auf created_at-Zeitnaehe und created_by zur Anfrage.
-- Sicherer: manuelles Mapping spaeter falls noetig. Hier nur Hinweis als Kommentar.
-- Falls ein eindeutiger Mapping-Schluessel existiert, kann das in einer Folgemigration nachgereicht werden.
