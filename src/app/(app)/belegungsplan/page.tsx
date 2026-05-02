"use client";

/**
 * Belegungsplan-Page — duenner Wrapper um BelegungsplanView. Die ganze
 * Logik + Render lebt im Component damit's auch unter der Schweizer Karte
 * auf /locations wiederverwendbar ist.
 */

import { BelegungsplanView } from "@/components/belegungsplan-view";

export default function BelegungsplanPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 min-h-9">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Belegungsplan</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verfügbarkeit aller Standorte auf einen Blick.
          </p>
        </div>
      </div>
      <BelegungsplanView />
    </div>
  );
}
