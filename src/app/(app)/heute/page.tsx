"use client";

import Link from "next/link";

export default function HeutePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Heute</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Was heute auf dich wartet — Events, Zeiterfassung und offene Aufgaben.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Diese Seite wird in Kürze aufgebaut. Vorerst kannst du über das alte
        Dashboard navigieren:{" "}
        <Link href="/dashboard" className="font-medium text-foreground underline">
          zum Dashboard
        </Link>
        .
      </div>
    </div>
  );
}
