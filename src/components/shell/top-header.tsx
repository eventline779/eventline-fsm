"use client";

/**
 * Top-Header: sticky horizontal-Bar oben im Content-Bereich.
 * Nimmt die ganze Header-Breite als Suchfeld — kein Kasten-in-Kasten,
 * dadurch integriert der Trigger sich in die Header-Zeile statt als
 * schwebendes Element wirken (Leo 2026-09-05: "wirkt fehl am Platz").
 * Nur Desktop (md+). Auf Mobile uebernimmt MobileNav + Sheet-Menu.
 */

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { CMDK_OPEN_EVENT } from "@/components/shell/command-palette";

export function TopHeader() {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    }
  }, []);

  const openPalette = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(CMDK_OPEN_EVENT));
    }
  };

  return (
    <header className="hidden md:flex sticky top-0 z-20 h-12 items-center px-4 border-b border-border bg-background/85 backdrop-blur">
      <button
        type="button"
        onClick={openPalette}
        className="flex items-center gap-2 px-3 h-8 rounded-md border border-border bg-foreground/[0.03] dark:bg-white/[0.05] dark:border-white/15 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] dark:hover:bg-white/[0.10] transition-colors w-full max-w-md text-xs"
        aria-label="Suche oeffnen"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left">Suchen — Aufträge, Kunden, Leads, Räume, Tickets…</span>
        <kbd className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border border-border dark:border-white/15 bg-background dark:bg-white/[0.04] text-muted-foreground shrink-0">
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
    </header>
  );
}
