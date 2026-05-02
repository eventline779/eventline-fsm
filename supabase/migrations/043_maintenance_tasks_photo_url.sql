-- maintenance_tasks bekommt photo_url damit der "Neue Instandhaltung"-Form
-- ein Foto pro Eintrag speichern kann (Storage-Pfad im documents-Bucket).
-- Vorher hat der Code beim Insert photo_url=path geschrieben, die Spalte
-- fehlte aber → Insert ist silent fehlgeschlagen, Toast zeigte trotzdem
-- "erstellt" weil .insert() error nie geprueft wurde.
alter table public.maintenance_tasks
  add column if not exists photo_url text;
