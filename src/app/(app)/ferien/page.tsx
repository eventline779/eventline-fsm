"use client";

/**
 * Deep-Link-Alias fuer den Ferien-Tab im HR-Hub. Die eigentliche
 * View lebt in src/components/ferien/ferien-view.tsx — sowohl diese
 * Seite als auch /hr?tab=ferien rendern sie. So bleiben bestehende
 * Ferien-Links (Notifications, Bookmarks) erreichbar.
 */

import { FerienView } from "@/components/ferien/ferien-view";

export default function FerienPage() {
  return <FerienView />;
}
