/**
 * /partner → Redirect auf /einstellungen?tab=partner.
 * Location-Partner ist Verwaltungs-Thema (Rollen/Anfrage-Formular/User-Liste
 * gehoeren zusammen) und lebt jetzt komplett unter Einstellungen (Leo 2026-09-02).
 * Der Redirect erhaelt bestehende Deep-Links am Leben.
 */

import { redirect } from "next/navigation";

export default function PartnerKontaktePage() {
  redirect("/einstellungen?tab=partner");
}
