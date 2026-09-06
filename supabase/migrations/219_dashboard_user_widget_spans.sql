-- Migration 219: User-Overrides fuer Widget-Breite (col-span) im Dashboard
--
-- Bisher war die Breite jedes Widgets fest in src/lib/dashboard-widgets.ts
-- (WIDGET_SPAN) hinterlegt. Der User konnte nur Reihenfolge + Sichtbarkeit
-- pro Widget aendern. Ab jetzt kann er auch die Breite ueber-definieren —
-- z.B. eine volle Kachel auf 2/3 verkleinern damit eine 1/3-Kachel daneben
-- passt.
--
-- Persistiert als JSONB-Map { widget_id: span_int } in user_dashboard_overrides.
-- Erlaubte span_int-Werte: 4 (1/3), 6 (1/2), 8 (2/3), 12 (voll).
-- Fehlende Eintraege fallen auf den Registry-Default aus WIDGET_SPAN zurueck.

alter table public.user_dashboard_overrides
  add column if not exists widget_spans jsonb not null default '{}'::jsonb;

comment on column public.user_dashboard_overrides.widget_spans is
  'Optionale User-Overrides der Widget-Breite als {widget_id: span_int}. span_int in {4,6,8,12} = col-span-Werte im 12-col-Grid. Fehlt eine ID, gilt der Registry-Default aus src/lib/dashboard-widgets.ts.';
