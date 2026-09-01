"use client";

/**
 * Deep-Link-Alias fuer den Stempelzeiten-Tab im HR-Hub. Die eigentliche
 * View lebt in src/components/stempelzeiten/stempelzeiten-view.tsx —
 * sowohl diese Seite als auch /hr?tab=stempelzeiten rendern sie. So
 * bleibt /stempelzeiten als Deep-Link (z.B. aus Notifications) erreichbar
 * ohne den Inhalt zu duplizieren.
 */

import { StempelzeitenView } from "@/components/stempelzeiten/stempelzeiten-view";

export default function StempelzeitenPage() {
  return <StempelzeitenView />;
}
