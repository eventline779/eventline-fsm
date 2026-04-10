-- Seed: 3 Startlocations für EVENTLINE
-- (Kunden und Profile werden über die App erstellt)

insert into public.locations (name, address_street, address_zip, address_city, capacity, notes, technical_details) values
  ('Theater BAU3', 'Dornacherstrasse 192', '4053', 'Basel', 100, 'Gundeldinger Feld, industrieller/puristischer Stil', 'Komplette Licht- & Tonanlage, Beamer & Leinwand'),
  ('Barakuba', 'Dornacherstrasse 192', '4053', 'Basel', 70, 'Gundeldinger Feld, Retro/familiärer Stil, Bar & Bühne', 'Flexible Bühne & Grundlicht, Bar-Infrastruktur'),
  ('SCALA BASEL', 'Freie Strasse', '4001', 'Basel', 400, 'Klassisch/elegant, repräsentativ', 'Professionelle Theaterausstattung, Foyer für Empfang');

-- Default E-Mail Vorlagen
insert into public.email_templates (name, subject, body_html, type) values
  ('Buchungsbestätigung', 'Ihre Buchung bei EVENTLINE – Bestätigung', '<p>Guten Tag {{kunde_name}},</p><p>Wir freuen uns, Ihnen mitzuteilen, dass Ihre Anfrage für <strong>{{location_name}}</strong> am <strong>{{event_datum}}</strong> bestätigt wurde.</p><p>Details:<br/>Personenanzahl: {{personen_anzahl}}<br/>Veranstaltungstyp: {{event_typ}}</p><p>Bei Fragen stehen wir Ihnen gerne zur Verfügung.</p><p>Freundliche Grüsse<br/>EVENTLINE GmbH<br/>St. Jakobs-Strasse 200, CH-4052 Basel<br/>Tel: 055 556 62 61</p>', 'bestätigung'),
  ('Absage', 'Ihre Anfrage bei EVENTLINE', '<p>Guten Tag {{kunde_name}},</p><p>Vielen Dank für Ihre Anfrage für <strong>{{location_name}}</strong> am <strong>{{event_datum}}</strong>.</p><p>Leider müssen wir Ihnen mitteilen, dass der gewünschte Termin nicht verfügbar ist.</p><p>Gerne prüfen wir alternative Termine für Sie. Kontaktieren Sie uns jederzeit.</p><p>Freundliche Grüsse<br/>EVENTLINE GmbH<br/>St. Jakobs-Strasse 200, CH-4052 Basel<br/>Tel: 055 556 62 61</p>', 'absage'),
  ('Information', 'Information von EVENTLINE', '<p>Guten Tag {{kunde_name}},</p><p>{{nachricht}}</p><p>Freundliche Grüsse<br/>EVENTLINE GmbH<br/>St. Jakobs-Strasse 200, CH-4052 Basel<br/>Tel: 055 556 62 61</p>', 'info');
