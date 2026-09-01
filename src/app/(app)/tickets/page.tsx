"use client";

/**
 * Deep-Link-Alias fuer den Tickets-Tab im HR-Hub. Die eigentliche
 * View lebt in src/components/tickets/tickets-view.tsx — sowohl diese
 * Seite als auch /hr?tab=tickets rendern sie. So bleibt /tickets als
 * Deep-Link (z.B. aus Mail-Notifications) erreichbar.
 */

import { TicketsView } from "@/components/tickets/tickets-view";

export default function TicketsPage() {
  return <TicketsView />;
}
